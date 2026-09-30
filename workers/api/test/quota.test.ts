import { deviceTitleAccess, devices, titles } from '@calmcut/db'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { DAILY_DISTINCT_TITLES } from '../src/lib/quota.js'
import { createDevice, db, request, resetDatabase, seed } from './helpers.js'

/**
 * Le quota est la principale défense contre l'aspiration (§8.2).
 *
 * Ce qu'il doit faire : coûter cher à qui veut lire beaucoup de titres différents.
 * Ce qu'il ne doit **pas** faire : gêner quelqu'un qui regarde un film.
 */

const CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Crée `count` titres avec des identifiants valides et distincts. */
const manyTitles = async (count: number): Promise<string[]> => {
  const now = 1_760_000_000
  const ids: string[] = []
  for (let i = 0; i < count; i += 1) {
    const suffix = `${CHARS[Math.floor(i / 32)] as string}${CHARS[i % 32] as string}`
    const id = `01JBQ${'Q'.repeat(19)}${suffix}`
    ids.push(id)
    await db()
      .insert(titles)
      .values({
        id,
        tmdbId: 500_000 + i,
        kind: 'movie',
        name: `Titre ${i}`,
        year: 2010,
        runtimeCanonical: 5400,
        publicSlug: `titre-quota-${i}`,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
  }
  return ids
}

describe('quota de titres distincts', () => {
  beforeEach(async () => {
    await resetDatabase()
    // Le catalogue des phobies doit exister.
    await seed({ titleCount: 1 })
  })

  it('ne consomme rien à relire le même titre', async () => {
    const [id] = await manyTitles(1)
    const { deviceId, token } = await createDevice()

    for (let i = 0; i < 10; i += 1) {
      const response = await request(`/v1/titles/${id as string}?phobias=rats`, { token })
      expect(response.status).toBe(200)
    }

    const rows = await db().select().from(devices).where(eq(devices.id, deviceId))
    // Recharger sa fiche dix fois ne doit pas coûter dix titres.
    expect(rows[0]?.quotaUsed).toBe(1)
  })

  it('compte un titre par titre distinct', async () => {
    const ids = await manyTitles(5)
    const { deviceId, token } = await createDevice()

    for (const id of ids) {
      await request(`/v1/titles/${id}?phobias=rats`, { token })
    }

    const rows = await db().select().from(devices).where(eq(devices.id, deviceId))
    expect(rows[0]?.quotaUsed).toBe(5)

    const access = await db()
      .select()
      .from(deviceTitleAccess)
      .where(eq(deviceTitleAccess.deviceId, deviceId))
    expect(access).toHaveLength(5)
  })

  it('refuse le 51e titre distinct du jour', async () => {
    const ids = await manyTitles(DAILY_DISTINCT_TITLES + 1)
    const { token } = await createDevice()

    for (let i = 0; i < DAILY_DISTINCT_TITLES; i += 1) {
      const response = await request(`/v1/titles/${ids[i] as string}?phobias=rats`, { token })
      expect(response.status, `titre ${i}`).toBe(200)
    }

    const beyond = await request(
      `/v1/titles/${ids[DAILY_DISTINCT_TITLES] as string}?phobias=rats`,
      { token },
    )
    expect(beyond.status).toBe(429)
    expect(Number(beyond.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('laisse continuer un titre DÉJÀ ouvert même quota atteint', async () => {
    const ids = await manyTitles(DAILY_DISTINCT_TITLES + 1)
    const { token } = await createDevice()

    const first = ids[0] as string
    for (let i = 0; i < DAILY_DISTINCT_TITLES; i += 1) {
      await request(`/v1/titles/${ids[i] as string}?phobias=rats`, { token })
    }
    // Le quota est dépensé.
    expect(
      (await request(`/v1/titles/${ids[DAILY_DISTINCT_TITLES] as string}?phobias=rats`, { token }))
        .status,
    ).toBe(429)

    // Mais on ne coupe pas une protection en cours : le film déjà ouvert passe.
    const again = await request(`/v1/titles/${first}?phobias=rats`, { token })
    expect(again.status).toBe(200)
  })

  it('compte séparément deux appareils', async () => {
    const ids = await manyTitles(3)
    const a = await createDevice()
    const b = await createDevice()

    for (const id of ids) await request(`/v1/titles/${id}?phobias=rats`, { token: a.token })
    await request(`/v1/titles/${ids[0] as string}?phobias=rats`, { token: b.token })

    const rowsA = await db().select().from(devices).where(eq(devices.id, a.deviceId))
    const rowsB = await db().select().from(devices).where(eq(devices.id, b.deviceId))
    expect(rowsA[0]?.quotaUsed).toBe(3)
    expect(rowsB[0]?.quotaUsed).toBe(1)
  })

  it('repart de zéro quand le jour du compteur change', async () => {
    const ids = await manyTitles(2)
    const { deviceId, token } = await createDevice()

    await request(`/v1/titles/${ids[0] as string}?phobias=rats`, { token })
    // On simule le lendemain en marquant le compteur comme datant d'hier.
    await db()
      .update(devices)
      .set({ quotaDay: '2000-01-01', quotaUsed: 50 })
      .where(eq(devices.id, deviceId))

    const response = await request(`/v1/titles/${ids[1] as string}?phobias=rats`, { token })
    expect(response.status).toBe(200)
    const rows = await db().select().from(devices).where(eq(devices.id, deviceId))
    expect(rows[0]?.quotaUsed).toBe(1)
  })

  it('le lookup consomme aussi du quota — c’est là qu’un aspirateur frappe', async () => {
    const ids = await manyTitles(1)
    const id = ids[0] as string
    await db()
      .insert((await import('@calmcut/db')).titleSources)
      .values({
        id: `${id}S`,
        titleId: id,
        kind: 'netflix',
        externalId: 'quota-lookup',
        offset: 0,
        scale: 1,
        confidence: 0.9,
        method: 'subs-align',
      })
      .onConflictDoNothing()

    const { deviceId, token } = await createDevice()
    await request('/v1/lookup?kind=netflix&externalId=quota-lookup', { token })

    const rows = await db().select().from(devices).where(eq(devices.id, deviceId))
    expect(rows[0]?.quotaUsed).toBe(1)
  })

  it('un titre inconnu ne consomme pas de quota', async () => {
    const { deviceId, token } = await createDevice()
    await request('/v1/lookup?kind=netflix&externalId=jamais-vu', { token })
    const rows = await db().select().from(devices).where(eq(devices.id, deviceId))
    expect(rows[0]?.quotaUsed).toBe(0)
  })
})
