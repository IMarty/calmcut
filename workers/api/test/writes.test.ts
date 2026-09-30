import { devices, reports, segments, titles, votes } from '@calmcut/db'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDevice, db, postJson, request, resetDatabase } from './helpers.js'

const TITLE = `01JBQ${'W'.repeat(20)}1`
const RUNTIME = 6000

const insertTitle = async () => {
  await resetDatabase()
  const now = 1_760_000_000
  await db()
    .insert(titles)
    .values({
      id: TITLE,
      tmdbId: 777_001,
      kind: 'movie',
      name: 'Film des signalements',
      year: 2011,
      runtimeCanonical: RUNTIME,
      publicSlug: 'film-des-signalements-2011',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
  // Le catalogue des phobies doit exister pour l'intégrité référentielle.
  await db()
    .insert((await import('@calmcut/db')).phobias)
    .values([
      { id: 'rats', label: 'Rats et souris', emoji: '🐀' },
      { id: 'spiders', label: 'Araignées', emoji: '🕷️' },
    ])
    .onConflictDoNothing()
}

describe('POST /v1/reports', () => {
  beforeEach(insertTitle)

  it('exige un jeton', async () => {
    const response = await postJson('/v1/reports', {
      titleId: TITLE,
      phobia: 'rats',
      position: 100,
      kind: 'present',
    })
    expect(response.status).toBe(401)
  })

  it('UN SEUL signalement rend un segment actif immédiatement', async () => {
    const { token } = await createDevice()
    const response = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 1000, kind: 'present' },
      { token },
    )
    expect(response.status).toBe(202)

    const body = await response.json<{ segmentId: string }>()
    const rows = await db().select().from(segments).where(eq(segments.id, body.segmentId))
    const segment = rows[0]

    // L'asymétrie de §7.6 : protéger d'abord, discuter ensuite.
    expect(segment?.status).toBe('pending')
    expect(segment?.origin).toBe('user')
    expect(segment?.reportsCount).toBe(1)
  })

  it('recule la position de 2 s — on signale après avoir vu', async () => {
    const { token } = await createDevice()
    const response = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 1000, kind: 'present' },
      { token },
    )
    const { segmentId } = await response.json<{ segmentId: string }>()

    const reportRows = await db().select().from(reports).where(eq(reports.segmentId, segmentId))
    expect(reportRows[0]?.position).toBe(998)

    // Le segment couvre [t − 3, t + 5] autour de la position corrigée.
    const segmentRows = await db().select().from(segments).where(eq(segments.id, segmentId))
    expect(segmentRows[0]?.start).toBe(995)
    expect(segmentRows[0]?.end).toBe(1003)
  })

  it('regroupe deux signalements proches sur le même segment', async () => {
    const a = await createDevice()
    const b = await createDevice()

    const first = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 2000, kind: 'present' },
      { token: a.token },
    )
    const second = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 2004, kind: 'present' },
      { token: b.token },
    )

    const one = await first.json<{ segmentId: string }>()
    const two = await second.json<{ segmentId: string }>()
    expect(two.segmentId).toBe(one.segmentId)

    const rows = await db().select().from(segments).where(eq(segments.id, one.segmentId))
    expect(rows[0]?.reportsCount).toBe(2)
    // Le segment s'étend pour couvrir les deux témoignages.
    expect(rows[0]?.end).toBeGreaterThanOrEqual(2007)
  })

  it('ne regroupe pas deux signalements éloignés', async () => {
    const { token } = await createDevice()
    const first = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 1000, kind: 'present' },
      { token },
    )
    const second = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 3000, kind: 'present' },
      { token },
    )
    const one = await first.json<{ segmentId: string }>()
    const two = await second.json<{ segmentId: string }>()
    expect(two.segmentId).not.toBe(one.segmentId)
  })

  it('ne regroupe pas des phobies différentes', async () => {
    const { token } = await createDevice()
    const rats = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 1500, kind: 'present' },
      { token },
    )
    const spiders = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'spiders', position: 1500, kind: 'present' },
      { token },
    )
    expect((await spiders.json<{ segmentId: string }>()).segmentId).not.toBe(
      (await rats.json<{ segmentId: string }>()).segmentId,
    )
  })

  it('UNE fausse alerte ne désactive RIEN — il faut un consensus', async () => {
    const author = await createDevice()
    const created = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 1000, kind: 'present' },
      { token: author.token },
    )
    const { segmentId } = await created.json<{ segmentId: string }>()

    const complainer = await createDevice()
    await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 1000, kind: 'false-alarm' },
      { token: complainer.token },
    )

    const rows = await db().select().from(segments).where(eq(segments.id, segmentId))
    // §7.6 : il faut au moins 5 votes pondérés, dont 2 de réputation ≥ 2.
    // Une requête isolée ne doit jamais éteindre une protection.
    expect(rows[0]?.status).toBe('pending')
  })

  it('enregistre une fausse alerte comme vote négatif', async () => {
    const author = await createDevice()
    const created = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 1000, kind: 'present' },
      { token: author.token },
    )
    const { segmentId } = await created.json<{ segmentId: string }>()

    const complainer = await createDevice()
    await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 1000, kind: 'false-alarm' },
      { token: complainer.token },
    )

    const rows = await db()
      .select()
      .from(votes)
      .where(and(eq(votes.segmentId, segmentId), eq(votes.deviceId, complainer.deviceId)))
    expect(rows[0]?.value).toBe(-1)
  })

  it('refuse un titre inconnu', async () => {
    const { token } = await createDevice()
    const response = await postJson(
      '/v1/reports',
      { titleId: `01JBQ${'V'.repeat(21)}`, phobia: 'rats', position: 100, kind: 'present' },
      { token },
    )
    expect(response.status).toBe(404)
  })

  it('refuse une phobie désactivée ou inconnue', async () => {
    const { token } = await createDevice()
    for (const phobia of ['clowns', 'dragons']) {
      const response = await postJson(
        '/v1/reports',
        { titleId: TITLE, phobia, position: 100, kind: 'present' },
        { token },
      )
      expect(response.status, phobia).toBe(400)
    }
  })

  it('refuse une position au-delà de la durée du titre', async () => {
    const { token } = await createDevice()
    const response = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: RUNTIME + 600, kind: 'present' },
      { token },
    )
    expect(response.status).toBe(400)
  })

  it('refuse un kind inventé et un corps non JSON', async () => {
    const { token } = await createDevice()
    const bad = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 100, kind: 'maybe' },
      { token },
    )
    expect(bad.status).toBe(400)

    const notJson = await request('/v1/reports', {
      method: 'POST',
      body: 'pas du json',
      token,
      headers: { 'Content-Type': 'application/json' },
    })
    expect(notJson.status).toBe(400)
  })

  it('n’autorise pas la mise en cache d’une écriture', async () => {
    const { token } = await createDevice()
    const response = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 100, kind: 'present' },
      { token },
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('POST /v1/votes', () => {
  beforeEach(insertTitle)

  const createSegment = async (token: string): Promise<string> => {
    const response = await postJson(
      '/v1/reports',
      { titleId: TITLE, phobia: 'rats', position: 1000, kind: 'present' },
      { token },
    )
    return (await response.json<{ segmentId: string }>()).segmentId
  }

  it('enregistre un vote pondéré par la réputation', async () => {
    const author = await createDevice()
    const segmentId = await createSegment(author.token)

    const voter = await createDevice()
    await db().update(devices).set({ reputation: 2.5 }).where(eq(devices.id, voter.deviceId))

    const response = await postJson('/v1/votes', { segmentId, value: -1 }, { token: voter.token })
    expect(response.status).toBe(202)

    const rows = await db()
      .select()
      .from(votes)
      .where(and(eq(votes.segmentId, segmentId), eq(votes.deviceId, voter.deviceId)))
    expect(rows[0]?.weight).toBe(2.5)
  })

  it('remplace le vote précédent du même appareil', async () => {
    const author = await createDevice()
    const segmentId = await createSegment(author.token)
    const voter = await createDevice()

    await postJson('/v1/votes', { segmentId, value: -1 }, { token: voter.token })
    await postJson('/v1/votes', { segmentId, value: 1 }, { token: voter.token })

    const rows = await db()
      .select()
      .from(votes)
      .where(and(eq(votes.segmentId, segmentId), eq(votes.deviceId, voter.deviceId)))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.value).toBe(1)
  })

  it('refuse une valeur autre que +1 ou −1', async () => {
    const author = await createDevice()
    const segmentId = await createSegment(author.token)
    for (const value of [0, 2, -5, 'oui']) {
      const response = await postJson('/v1/votes', { segmentId, value }, { token: author.token })
      expect(response.status, String(value)).toBe(400)
    }
  })

  it('refuse un segment inconnu', async () => {
    const { token } = await createDevice()
    const response = await postJson(
      '/v1/votes',
      { segmentId: `01JBQ${'T'.repeat(21)}`, value: -1 },
      { token },
    )
    expect(response.status).toBe(404)
  })

  it('exige un jeton', async () => {
    const response = await postJson('/v1/votes', { segmentId: TITLE, value: 1 })
    expect(response.status).toBe(401)
  })
})
