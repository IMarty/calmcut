import { segments, syncIndexes, titles, titleSources } from '@calmcut/db'
import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDevice, db, request, resetDatabase, seed } from './helpers.js'

/** Identifiants de test : 26 caractères de l'alphabet Crockford, sans I, L, O ni U. */
const SEG_RATS = `01JBQ${'A'.repeat(19)}01`
const SEG_RATS_DISABLED = `01JBQ${'B'.repeat(19)}02`
const SEG_SPIDERS = `01JBQ${'C'.repeat(19)}03`
const ABSENT_TITLE = `01JBQ${'D'.repeat(21)}`

/**
 * Un titre dont tout est connu : les assertions sur les valeurs exactes passent
 * par lui, les assertions sur le comportement réaliste passent par le seed.
 */
const FIXED = {
  id: '01JBQ' + 'Z'.repeat(20) + '1',
  slug: 'titre-fixe-2007',
  runtime: 6660,
  // Volontairement distincts de `runtime` : sinon le test de non-exposition
  // ci-dessous serait trompé par la durée, qui est publique à juste titre.
  creditsStart: 6401,
  creditsEnd: 6649,
}

const insertFixedTitle = async () => {
  const now = 1_760_000_000
  await db()
    .insert(titles)
    .values({
      id: FIXED.id,
      tmdbId: 123_456,
      kind: 'movie',
      name: 'Titre fixe',
      year: 2007,
      runtimeCanonical: FIXED.runtime,
      creditsStart: FIXED.creditsStart,
      creditsEnd: FIXED.creditsEnd,
      publicSlug: FIXED.slug,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()

  await db()
    .insert(titleSources)
    .values({
      id: `${FIXED.id}S`,
      titleId: FIXED.id,
      kind: 'netflix',
      externalId: '70021642',
      offset: -12.3,
      scale: 1,
      confidence: 0.9,
      method: 'subs-align',
    })
    .onConflictDoNothing()

  const rows = [
    { id: SEG_RATS, phobia: 'rats', start: 4331.2, end: 4339.8, status: 'confirmed' },
    { id: SEG_RATS_DISABLED, phobia: 'rats', start: 5000, end: 5010, status: 'disabled' },
    { id: SEG_SPIDERS, phobia: 'spiders', start: 1200, end: 1210, status: 'pending' },
  ] as const

  for (const row of rows) {
    await db()
      .insert(segments)
      .values({
        id: row.id,
        titleId: FIXED.id,
        phobiaId: row.phobia,
        start: row.start,
        end: row.end,
        modality: 'subs',
        origin: 'batch',
        status: row.status,
        score: 0.8,
        reportsCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
  }
}

describe('GET /v1/lookup', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seed({ titleCount: 2 })
    await insertFixedTitle()
  })

  it('résout un identifiant de plateforme', async () => {
    const { token } = await createDevice()
    const response = await request('/v1/lookup?kind=netflix&externalId=70021642', { token })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ titleId: FIXED.id })
  })

  it('renvoie 404 pour un identifiant inconnu', async () => {
    const { token } = await createDevice()
    const response = await request('/v1/lookup?kind=netflix&externalId=inexistant', { token })
    expect(response.status).toBe(404)
  })

  it('refuse un `kind` qui n’est pas une plateforme connue', async () => {
    const { token } = await createDevice()
    const response = await request('/v1/lookup?kind=pirate&externalId=1', { token })
    expect(response.status).toBe(400)
  })

  it('refuse une requête sans paramètre', async () => {
    const { token } = await createDevice()
    expect((await request('/v1/lookup', { token })).status).toBe(400)
  })
})

describe('GET /v1/titles/:id', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seed({ titleCount: 2 })
    await insertFixedTitle()
  })

  it('renvoie le document au format attendu', async () => {
    const { token } = await createDevice()
    const response = await request(`/v1/titles/${FIXED.id}?phobias=rats,spiders`, { token })
    expect(response.status).toBe(200)

    const body = await response.json<Record<string, unknown>>()
    expect(body.v).toBe(1)
    expect(body.title).toEqual({
      slug: FIXED.slug,
      name: 'Titre fixe',
      year: 2007,
      runtime: FIXED.runtime,
    })
    expect(body.sources).toEqual([
      { kind: 'netflix', externalId: '70021642', offset: -12.3, scale: 1 },
    ])
  })

  it('N’EXPOSE JAMAIS creditsStart ni creditsEnd', async () => {
    const { token } = await createDevice()
    const response = await request(`/v1/titles/${FIXED.id}?phobias=rats`, { token })
    const raw = await response.text()

    // §6 : ces colonnes sont internes. Les exposer affaiblirait le filigrane.
    // On teste le texte brut de la réponse, pas seulement l'objet analysé :
    // un champ ajouté par erreur n'importe où doit faire échouer ce test.
    expect(raw).not.toContain('credits')
    expect(raw).not.toContain(String(FIXED.creditsStart))
    expect(raw).not.toContain(String(FIXED.creditsEnd))
  })

  it('n’expose aucune borne de générique, quel que soit le titre du seed', async () => {
    const { token } = await createDevice()
    const data = await seed({ titleCount: 3 })
    for (const title of data.titles) {
      const response = await request(`/v1/titles/${title.id}?phobias=rats,spiders`, { token })
      if (response.status !== 200) continue
      const raw = await response.text()
      expect(raw).not.toContain('credits')
      expect(raw).not.toContain(String(title.creditsStart))
    }
  })

  it('exclut les segments désactivés', async () => {
    const { token } = await createDevice()
    const response = await request(`/v1/titles/${FIXED.id}?phobias=rats`, { token })
    const body = await response.json<{ segments: { id: string; status: string }[] }>()

    expect(body.segments.map((s) => s.id)).toEqual([SEG_RATS])
    expect(body.segments.every((s) => s.status !== 'disabled')).toBe(true)
  })

  it('ne renvoie que les phobies demandées', async () => {
    const { token } = await createDevice()
    const response = await request(`/v1/titles/${FIXED.id}?phobias=spiders`, { token })
    const body = await response.json<{ segments: { phobia: string }[] }>()
    expect(body.segments.map((s) => s.phobia)).toEqual(['spiders'])
  })

  it('trie les segments par instant de début', async () => {
    const { token } = await createDevice()
    const response = await request(`/v1/titles/${FIXED.id}?phobias=rats,spiders`, { token })
    const body = await response.json<{ segments: { start: number }[] }>()
    const starts = body.segments.map((s) => s.start)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })

  it('refuse une demande sans phobie valide', async () => {
    const { token } = await createDevice()
    expect((await request(`/v1/titles/${FIXED.id}`, { token })).status).toBe(400)
    expect((await request(`/v1/titles/${FIXED.id}?phobias=dragons`, { token })).status).toBe(400)
  })

  it('refuse une phobie désactivée — le client ne doit pas la contourner', async () => {
    const { token } = await createDevice()
    const response = await request(`/v1/titles/${FIXED.id}?phobias=clowns`, { token })
    expect(response.status).toBe(400)
  })

  it('renvoie 400 pour un identifiant qui n’est pas un ULID', async () => {
    const { token } = await createDevice()
    expect((await request('/v1/titles/pas-un-ulid?phobias=rats', { token })).status).toBe(400)
  })

  it('renvoie 404 pour un titre inconnu', async () => {
    const { token } = await createDevice()
    const response = await request(`/v1/titles/${ABSENT_TITLE}?phobias=rats`, { token })
    expect(response.status).toBe(404)
  })

  it('interdit la mise en cache partagée d’un document personnalisé', async () => {
    const { token } = await createDevice()
    const response = await request(`/v1/titles/${FIXED.id}?phobias=rats`, { token })
    // `private` : le document sera personnalisé par appareil à M8, il ne doit
    // jamais atterrir dans un cache partagé.
    expect(response.headers.get('Cache-Control')).toContain('private')
  })

  it('n’offre aucun moyen d’énumérer les titres', async () => {
    const { token } = await createDevice()
    for (const path of ['/v1/titles', '/v1/titles/', '/v1/public/titles']) {
      const response = await request(path, { token })
      expect(response.status, path).toBe(404)
    }
  })
})

describe('GET /v1/titles/:id/sync', () => {
  beforeEach(resetDatabase)

  it('sert l’index binaire du titre', async () => {
    const data = await seed({ titleCount: 1 })
    const title = data.titles[0]
    expect(title).toBeDefined()

    const { token } = await createDevice()
    const response = await request(`/v1/titles/${title!.id}/sync`, { token })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream')

    const buffer = await response.arrayBuffer()
    // En-tête CCSY de 16 octets, puis des paires de 8 octets.
    expect(buffer.byteLength).toBeGreaterThan(16)
    expect((buffer.byteLength - 16) % 8).toBe(0)
    expect(new TextDecoder().decode(new Uint8Array(buffer, 0, 4))).toBe('CCSY')
  })

  it('ne sert rien plutôt qu’un index de version inconnue', async () => {
    const data = await seed({ titleCount: 1 })
    const title = data.titles[0]!
    await db().update(syncIndexes).set({ version: 999 }).where(eq(syncIndexes.titleId, title.id))

    const { token } = await createDevice()
    const response = await request(`/v1/titles/${title.id}/sync`, { token })
    // Mieux vaut pas d'index qu'un index que le client interprétera de travers :
    // un verrouillage faux décale toutes les protections.
    expect(response.status).toBe(404)
  })

  it('renvoie 404 quand l’objet R2 a disparu', async () => {
    const data = await seed({ titleCount: 1 })
    const title = data.titles[0]!
    await env.DATA.delete(`sync/${title.id}.bin`)

    const { token } = await createDevice()
    expect((await request(`/v1/titles/${title.id}/sync`, { token })).status).toBe(404)
  })

  it('exige un jeton', async () => {
    const data = await seed({ titleCount: 1 })
    expect((await request(`/v1/titles/${data.titles[0]!.id}/sync`)).status).toBe(401)
  })
})
