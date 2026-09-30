import { segments, syncIndexes, titles, titleSources } from '@calmcut/db'
import { findPhobia } from '@calmcut/phobias'
import { SYNC_INDEX_VERSION } from '@calmcut/sync'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { dbOf, requireIngestToken } from '../lib/auth.js'
import type { AppBindings } from '../lib/env.js'
import { boundedString, fail, finiteNumber, readJson } from '../lib/http.js'
import { ulid } from '../lib/ulid.js'

/**
 * Ingestion depuis `calmcut-batch` (§7.2).
 *
 * **Idempotent** : rejouer le même lot ne duplique rien. C'est indispensable — le
 * batch tourne sur GitHub Actions, où un job peut être relancé, interrompu, ou
 * dédoublé par une file de demandes regroupées.
 *
 * L'idempotence repose sur des clés naturelles : `tmdbId` pour un titre,
 * `(kind, externalId)` pour une source, et `(titleId, phobiaId, start, end)` pour
 * un segment. Le batch n'a pas à connaître nos identifiants internes.
 */

const SOURCE_KINDS = ['netflix', 'disney', 'prime', 'youtube', 'file', 'canonical'] as const
const METHODS = ['subs-align', 'manual', 'fingerprint'] as const

interface IngestSegment {
  readonly phobia: string
  readonly start: number
  readonly end: number
  readonly modality: 'meta' | 'subs' | 'audio' | 'video'
  readonly score: number
}

export const ingestRoutes = () => {
  const app = new Hono<AppBindings>()

  // Intergiciel par route : voir la note dans `routes/titles.ts`. Ici c'est
  // critique — un `use('*')` ferait répondre 403 à toute requête /v1 non résolue.
  app.post('/ingest', requireIngestToken, async (c) => {
    const body = await readJson(c)
    if (body === undefined) return fail(c, 'bad-request', 'corps JSON attendu')

    const title = body.title
    if (typeof title !== 'object' || title === null) {
      return fail(c, 'bad-request', 'title manquant')
    }
    const t = title as Record<string, unknown>

    const tmdbId = finiteNumber(t.tmdbId, 1, Number.MAX_SAFE_INTEGER)
    const name = boundedString(t.name, 500)
    const year = finiteNumber(t.year, 1870, 2200)
    const runtime = finiteNumber(t.runtime, 1, 86_400)
    const kind = boundedString(t.kind, 16)
    const slug = boundedString(t.slug, 200)

    if (tmdbId === undefined || name === undefined || year === undefined || runtime === undefined) {
      return fail(c, 'bad-request', 'title incomplet')
    }
    if (kind !== 'movie' && kind !== 'episode') {
      return fail(c, 'bad-request', 'kind doit valoir movie ou episode')
    }
    if (slug === undefined || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return fail(c, 'bad-request', 'slug invalide')
    }

    const nowS = Math.floor(Date.now() / 1000)
    const db = dbOf(c.env)

    // Le titre : clé naturelle `tmdbId`.
    const existing = await db
      .select({ id: titles.id })
      .from(titles)
      .where(eq(titles.tmdbId, tmdbId))
      .limit(1)

    let titleId = existing[0]?.id
    if (titleId === undefined) {
      titleId = ulid(nowS * 1000)
      await db.insert(titles).values({
        id: titleId,
        tmdbId,
        imdbId: boundedString(t.imdbId, 32) ?? null,
        kind,
        name,
        year,
        runtimeCanonical: runtime,
        creditsStart: finiteNumber(t.creditsStart, 0, 86_400) ?? null,
        creditsEnd: finiteNumber(t.creditsEnd, 0, 86_400) ?? null,
        publicSlug: slug,
        createdAt: nowS,
        updatedAt: nowS,
      })
    } else {
      await db
        .update(titles)
        .set({
          name,
          year,
          runtimeCanonical: runtime,
          // Les bornes du générique ne sont écrasées que si le batch en fournit :
          // un lot qui les ignore ne doit pas effacer ce qu'on savait.
          ...(finiteNumber(t.creditsStart, 0, 86_400) !== undefined
            ? { creditsStart: finiteNumber(t.creditsStart, 0, 86_400) }
            : {}),
          ...(finiteNumber(t.creditsEnd, 0, 86_400) !== undefined
            ? { creditsEnd: finiteNumber(t.creditsEnd, 0, 86_400) }
            : {}),
          updatedAt: nowS,
        })
        .where(eq(titles.id, titleId))
    }

    // Les sources : clé naturelle `(kind, externalId)`.
    let sourcesUpserted = 0
    if (Array.isArray(body.sources)) {
      for (const raw of body.sources) {
        if (typeof raw !== 'object' || raw === null) continue
        const s = raw as Record<string, unknown>
        const sourceKind = boundedString(s.kind, 32)
        const externalId = boundedString(s.externalId, 128)
        const method = boundedString(s.method, 32)
        if (
          sourceKind === undefined ||
          externalId === undefined ||
          !(SOURCE_KINDS as readonly string[]).includes(sourceKind) ||
          method === undefined ||
          !(METHODS as readonly string[]).includes(method)
        ) {
          continue
        }

        await db
          .insert(titleSources)
          .values({
            id: ulid(nowS * 1000),
            titleId,
            kind: sourceKind as (typeof SOURCE_KINDS)[number],
            externalId,
            offset: finiteNumber(s.offset, -86_400, 86_400) ?? 0,
            scale: finiteNumber(s.scale, 0.5, 2) ?? 1,
            confidence: finiteNumber(s.confidence, 0, 1) ?? 0.5,
            method: method as (typeof METHODS)[number],
          })
          .onConflictDoUpdate({
            target: [titleSources.kind, titleSources.externalId],
            set: {
              titleId,
              offset: finiteNumber(s.offset, -86_400, 86_400) ?? 0,
              scale: finiteNumber(s.scale, 0.5, 2) ?? 1,
              confidence: finiteNumber(s.confidence, 0, 1) ?? 0.5,
            },
          })
        sourcesUpserted += 1
      }
    }

    // Les segments : on ne duplique pas un segment identique déjà présent.
    let segmentsInserted = 0
    let segmentsSkipped = 0
    if (Array.isArray(body.segments)) {
      for (const raw of body.segments) {
        const segment = validateSegment(raw)
        if (segment === undefined) {
          segmentsSkipped += 1
          continue
        }

        const duplicate = await db
          .select({ id: segments.id })
          .from(segments)
          .where(
            and(
              eq(segments.titleId, titleId),
              eq(segments.phobiaId, segment.phobia),
              eq(segments.start, segment.start),
              eq(segments.end, segment.end),
            ),
          )
          .limit(1)

        if (duplicate.length > 0) {
          segmentsSkipped += 1
          continue
        }

        await db.insert(segments).values({
          id: ulid(nowS * 1000),
          titleId,
          phobiaId: segment.phobia,
          start: segment.start,
          end: segment.end,
          modality: segment.modality,
          origin: 'batch',
          // Le batch ne confirme rien : il propose, la foule vérifie (§7.2).
          status: 'pending',
          score: segment.score,
          reportsCount: 0,
          createdAt: nowS,
          updatedAt: nowS,
        })
        segmentsInserted += 1
      }
    }

    // L'index de synchro : une seule ligne par titre, remplacée.
    const sync = body.sync
    if (typeof sync === 'object' && sync !== null) {
      const s = sync as Record<string, unknown>
      const r2Key = boundedString(s.r2Key, 512)
      const version = finiteNumber(s.version, 1, 65_535)
      const cuesCount = finiteNumber(s.cuesCount, 0, 10_000_000)
      if (r2Key !== undefined && version !== undefined && cuesCount !== undefined) {
        await db
          .insert(syncIndexes)
          .values({ titleId, version, r2Key, cuesCount, updatedAt: nowS })
          .onConflictDoUpdate({
            target: syncIndexes.titleId,
            set: { version, r2Key, cuesCount, updatedAt: nowS },
          })
      }
    }

    return c.json(
      {
        titleId,
        created: existing[0] === undefined,
        sourcesUpserted,
        segmentsInserted,
        segmentsSkipped,
        syncIndexVersion: SYNC_INDEX_VERSION,
      },
      200,
      { 'Cache-Control': 'no-store' },
    )
  })

  return app
}

const validateSegment = (raw: unknown): IngestSegment | undefined => {
  if (typeof raw !== 'object' || raw === null) return undefined
  const s = raw as Record<string, unknown>

  const phobia = boundedString(s.phobia, 64)
  const start = finiteNumber(s.start, 0, 86_400)
  const end = finiteNumber(s.end, 0, 86_400)
  const modality = boundedString(s.modality, 16)
  const score = finiteNumber(s.score, 0, 1)

  if (phobia === undefined || findPhobia(phobia) === undefined) return undefined
  if (start === undefined || end === undefined || end <= start) return undefined
  if (modality !== 'meta' && modality !== 'subs' && modality !== 'audio' && modality !== 'video') {
    return undefined
  }

  return { phobia, start, end, modality, score: score ?? 0.5 }
}
