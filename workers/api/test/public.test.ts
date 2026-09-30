import { phobias, segments, titles } from '@calmcut/db'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, request, resetDatabase } from './helpers.js'

/**
 * Le résumé public est la seule route sans authentification.
 *
 * Elle alimente le rendu SEO du site. Donc c'est aussi la seule qu'un aspirateur
 * peut interroger librement — et elle ne doit rien lui apprendre d'exploitable
 * (§7.7).
 */

const TITLE = `01JBQ${'P'.repeat(20)}1`
const SLUG = 'titre-public-2019'

beforeEach(async () => {
  await resetDatabase()
  const now = 1_760_000_000

  await db()
    .insert(phobias)
    .values([
      { id: 'rats', label: 'Rats et souris', emoji: '🐀' },
      { id: 'spiders', label: 'Araignées', emoji: '🕷️' },
    ])
    .onConflictDoNothing()

  await db()
    .insert(titles)
    .values({
      id: TITLE,
      tmdbId: 314_159,
      kind: 'movie',
      name: 'Titre public',
      year: 2019,
      runtimeCanonical: 7200,
      creditsStart: 6900,
      creditsEnd: 7100,
      publicSlug: SLUG,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()

  const rows = [
    {
      id: `01JBQ${'E'.repeat(19)}01`,
      phobia: 'rats',
      start: 4331.2,
      end: 4339.8,
      status: 'confirmed',
    },
    { id: `01JBQ${'F'.repeat(19)}02`, phobia: 'rats', start: 4500, end: 4510, status: 'verified' },
    {
      id: `01JBQ${'G'.repeat(19)}03`,
      phobia: 'spiders',
      start: 1200.7,
      end: 1210,
      status: 'pending',
    },
    { id: `01JBQ${'H'.repeat(19)}04`, phobia: 'rats', start: 900, end: 910, status: 'disabled' },
  ] as const

  for (const row of rows) {
    await db()
      .insert(segments)
      .values({
        id: row.id,
        titleId: TITLE,
        phobiaId: row.phobia,
        start: row.start,
        end: row.end,
        modality: 'subs',
        origin: 'batch',
        status: row.status,
        score: 0.7,
        reportsCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
  }
})

describe('GET /v1/public/titles/:slug/summary', () => {
  it('répond sans authentification', async () => {
    const response = await request(`/v1/public/titles/${SLUG}/summary`)
    expect(response.status).toBe(200)
  })

  it('compte les scènes par phobie', async () => {
    const response = await request(`/v1/public/titles/${SLUG}/summary`)
    const body = await response.json<{
      phobias: { phobia: string; count: number; verified: boolean; firstAround: number }[]
    }>()

    const rats = body.phobias.find((p) => p.phobia === 'rats')
    const spiders = body.phobias.find((p) => p.phobia === 'spiders')
    // Le segment désactivé n'est pas compté.
    expect(rats?.count).toBe(2)
    expect(spiders?.count).toBe(1)
  })

  it('signale qu’une scène a été vérifiée', async () => {
    const response = await request(`/v1/public/titles/${SLUG}/summary`)
    const body = await response.json<{ phobias: { phobia: string; verified: boolean }[] }>()
    expect(body.phobias.find((p) => p.phobia === 'rats')?.verified).toBe(true)
    expect(body.phobias.find((p) => p.phobia === 'spiders')?.verified).toBe(false)
  })

  it('N’EXPOSE AUCUN TIMESTAMP PRÉCIS', async () => {
    const response = await request(`/v1/public/titles/${SLUG}/summary`)
    const raw = await response.text()

    // §7.7 : la page dit « oui, 2 scènes, vers 1 h 12 », jamais les bornes.
    for (const precise of ['4331.2', '4339.8', '4500', '1200.7', '1210', '910']) {
      expect(raw, precise).not.toContain(precise)
    }
  })

  it('arrondit les positions à cinq minutes', async () => {
    const response = await request(`/v1/public/titles/${SLUG}/summary`)
    const body = await response.json<{ phobias: { firstAround: number }[] }>()
    for (const entry of body.phobias) {
      expect(entry.firstAround % 300, String(entry.firstAround)).toBe(0)
    }
  })

  it('n’expose ni les bornes du générique ni les identifiants de segment', async () => {
    const response = await request(`/v1/public/titles/${SLUG}/summary`)
    const raw = await response.text()
    expect(raw).not.toContain('credits')
    expect(raw).not.toContain('6900')
    expect(raw).not.toContain('01JBQ')
  })

  it('n’expose pas l’identifiant interne du titre', async () => {
    const response = await request(`/v1/public/titles/${SLUG}/summary`)
    const body = await response.json<Record<string, unknown>>()
    // Le slug est public, le ULID non : le connaître permettrait d'appeler la
    // route authentifiée sans passer par `lookup`.
    expect(Object.keys(body).sort()).toEqual(['name', 'phobias', 'slug', 'year'])
    expect(JSON.stringify(body)).not.toContain(TITLE)
  })

  it('est cachable par le cache partagé, contrairement aux routes d’appareil', async () => {
    const response = await request(`/v1/public/titles/${SLUG}/summary`)
    const cache = response.headers.get('Cache-Control') ?? ''
    expect(cache).toContain('public')
    expect(cache).toContain('s-maxage')
  })

  it('renvoie 404 pour un slug inconnu', async () => {
    expect((await request('/v1/public/titles/film-inexistant/summary')).status).toBe(404)
  })

  it('refuse un slug mal formé', async () => {
    expect((await request('/v1/public/titles/Pas%20Un%20Slug/summary')).status).toBe(400)
  })
})
