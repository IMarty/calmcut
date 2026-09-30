import { segments, syncIndexes, titles, titleSources } from '@calmcut/db'
import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, postJson, resetDatabase, seed } from './helpers.js'

/** Un lot de batch plausible. */
const lot = () => ({
  title: {
    tmdbId: 2062,
    imdbId: 'tt0382932',
    kind: 'movie',
    name: 'Film ingéré',
    year: 2007,
    runtime: 6660,
    slug: 'film-ingere-2007',
    creditsStart: 6400,
    creditsEnd: 6649,
  },
  sources: [
    { kind: 'netflix', externalId: '70021642', offset: -12.3, scale: 1, method: 'subs-align' },
  ],
  segments: [
    { phobia: 'rats', start: 4331.2, end: 4339.8, modality: 'subs', score: 0.82 },
    { phobia: 'rats', start: 5000, end: 5010, modality: 'subs', score: 0.6 },
  ],
  sync: { version: 1, r2Key: 'sync/ingere.bin', cuesCount: 1200 },
})

const INGEST_TOKEN = 'ingest-de-test'

describe('POST /v1/ingest', () => {
  beforeEach(async () => {
    await resetDatabase()
    // Le catalogue des phobies doit exister : le seed s'en charge.
    await seed({ titleCount: 1 })
  })

  it('refuse sans jeton de service', async () => {
    expect((await postJson('/v1/ingest', lot())).status).toBe(403)
  })

  it('refuse un jeton de service erroné', async () => {
    const response = await postJson('/v1/ingest', lot(), { token: 'pas-le-bon' })
    expect(response.status).toBe(403)
  })

  it('refuse un jeton d’appareil — ce n’est pas la même autorité', async () => {
    const { createDevice } = await import('./helpers.js')
    const device = await createDevice()
    const response = await postJson('/v1/ingest', lot(), { token: device.token })
    expect(response.status).toBe(403)
  })

  it('crée le titre, ses sources, ses segments et son index', async () => {
    const response = await postJson('/v1/ingest', lot(), { token: INGEST_TOKEN })
    expect(response.status).toBe(200)

    const body = await response.json<Record<string, unknown>>()
    expect(body.created).toBe(true)
    expect(body.segmentsInserted).toBe(2)
    expect(body.sourcesUpserted).toBe(1)

    const titleId = body.titleId as string
    const sources = await db().select().from(titleSources).where(eq(titleSources.titleId, titleId))
    expect(sources).toHaveLength(1)

    const rows = await db().select().from(segments).where(eq(segments.titleId, titleId))
    expect(rows).toHaveLength(2)
    // Le batch propose, la foule vérifie (§7.2).
    expect(rows.every((r) => r.status === 'pending' && r.origin === 'batch')).toBe(true)

    const sync = await db().select().from(syncIndexes).where(eq(syncIndexes.titleId, titleId))
    expect(sync[0]?.cuesCount).toBe(1200)
  })

  it('EST IDEMPOTENT : rejouer le même lot ne duplique rien', async () => {
    const first = await postJson('/v1/ingest', lot(), { token: INGEST_TOKEN })
    const firstBody = await first.json<{ titleId: string; segmentsInserted: number }>()

    const second = await postJson('/v1/ingest', lot(), { token: INGEST_TOKEN })
    const secondBody = await second.json<{
      titleId: string
      created: boolean
      segmentsInserted: number
      segmentsSkipped: number
    }>()

    // Le batch tourne sur GitHub Actions : un job peut être relancé ou dédoublé.
    expect(secondBody.titleId).toBe(firstBody.titleId)
    expect(secondBody.created).toBe(false)
    expect(secondBody.segmentsInserted).toBe(0)
    expect(secondBody.segmentsSkipped).toBe(2)

    const rows = await db().select().from(segments).where(eq(segments.titleId, firstBody.titleId))
    expect(rows).toHaveLength(2)

    const sources = await db()
      .select()
      .from(titleSources)
      .where(eq(titleSources.titleId, firstBody.titleId))
    expect(sources).toHaveLength(1)
  })

  it('reste idempotent sur cinq rejeux', async () => {
    for (let i = 0; i < 5; i += 1) await postJson('/v1/ingest', lot(), { token: INGEST_TOKEN })
    const rows = await db().select().from(titles).where(eq(titles.tmdbId, 2062))
    expect(rows).toHaveLength(1)
  })

  it('ajoute un nouveau segment sans toucher aux anciens', async () => {
    await postJson('/v1/ingest', lot(), { token: INGEST_TOKEN })

    const enriched = lot()
    const withExtra = {
      ...enriched,
      segments: [
        ...enriched.segments,
        { phobia: 'spiders', start: 100, end: 110, modality: 'subs', score: 0.7 },
      ],
    }
    const response = await postJson('/v1/ingest', withExtra, { token: INGEST_TOKEN })
    const body = await response.json<{ titleId: string; segmentsInserted: number }>()
    expect(body.segmentsInserted).toBe(1)

    const rows = await db().select().from(segments).where(eq(segments.titleId, body.titleId))
    expect(rows).toHaveLength(3)
  })

  it('n’efface pas les bornes du générique quand le lot ne les fournit pas', async () => {
    const created = await postJson('/v1/ingest', lot(), { token: INGEST_TOKEN })
    const { titleId } = await created.json<{ titleId: string }>()

    const without = lot() as Record<string, unknown>
    const title = { ...(without.title as Record<string, unknown>) }
    delete title.creditsStart
    delete title.creditsEnd
    await postJson('/v1/ingest', { ...without, title }, { token: INGEST_TOKEN })

    const rows = await db().select().from(titles).where(eq(titles.id, titleId))
    // Ces colonnes servent au filigrane : un lot qui les ignore ne doit pas
    // effacer ce qu'on savait déjà.
    expect(rows[0]?.creditsStart).toBe(6400)
    expect(rows[0]?.creditsEnd).toBe(6649)
  })

  it('ignore un segment invalide plutôt que de rejeter tout le lot', async () => {
    const bad = lot()
    const mixed = {
      ...bad,
      segments: [
        ...bad.segments,
        { phobia: 'dragons', start: 10, end: 20, modality: 'subs', score: 0.5 },
        { phobia: 'rats', start: 500, end: 400, modality: 'subs', score: 0.5 },
        { phobia: 'rats', start: 600, end: 610, modality: 'vibes', score: 0.5 },
      ],
    }
    const response = await postJson('/v1/ingest', mixed, { token: INGEST_TOKEN })
    const body = await response.json<{ segmentsInserted: number; segmentsSkipped: number }>()
    // Un lot de 2 000 titres ne doit pas échouer à cause d'une ligne douteuse.
    expect(body.segmentsInserted).toBe(2)
    expect(body.segmentsSkipped).toBe(3)
  })

  it('accepte une phobie désactivée — le batch prépare avant le client', async () => {
    const withDisabled = {
      ...lot(),
      segments: [{ phobia: 'snakes', start: 10, end: 20, modality: 'subs', score: 0.5 }],
    }
    const response = await postJson('/v1/ingest', withDisabled, { token: INGEST_TOKEN })
    const body = await response.json<{ segmentsInserted: number }>()
    expect(body.segmentsInserted).toBe(1)
  })

  it('refuse un lot sans titre ou avec un slug invalide', async () => {
    expect((await postJson('/v1/ingest', {}, { token: INGEST_TOKEN })).status).toBe(400)

    const badSlug = { ...lot(), title: { ...lot().title, slug: 'Pas Un Slug' } }
    expect((await postJson('/v1/ingest', badSlug, { token: INGEST_TOKEN })).status).toBe(400)
  })

  it('remplace l’index de synchro plutôt que d’en accumuler', async () => {
    const created = await postJson('/v1/ingest', lot(), { token: INGEST_TOKEN })
    const { titleId } = await created.json<{ titleId: string }>()

    const updated = { ...lot(), sync: { version: 1, r2Key: 'sync/nouveau.bin', cuesCount: 1500 } }
    await postJson('/v1/ingest', updated, { token: INGEST_TOKEN })

    const rows = await db().select().from(syncIndexes).where(eq(syncIndexes.titleId, titleId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.r2Key).toBe('sync/nouveau.bin')
    expect(rows[0]?.cuesCount).toBe(1500)
  })

  it('n’écrit rien dans R2 — c’est le batch qui y dépose l’index', async () => {
    await postJson('/v1/ingest', lot(), { token: INGEST_TOKEN })
    // L'API n'est pas un point de dépôt de fichiers : le batch écrit dans R2
    // directement, et n'annonce ici que la clé.
    expect(await env.DATA.get('sync/ingere.bin')).toBeNull()
  })
})
