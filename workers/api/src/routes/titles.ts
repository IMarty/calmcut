import { TIMELINE_FORMAT_VERSION, type TitleDocument } from '@calmcut/core'
import { segments, syncIndexes, titles, titleSources } from '@calmcut/db'
import { resolveEnabledPhobias } from '@calmcut/phobias'
import { SYNC_INDEX_VERSION } from '@calmcut/sync'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { dbOf, requireDevice } from '../lib/auth.js'
import type { AppBindings } from '../lib/env.js'
import { boundedString, fail, secondsUntilUtcMidnight } from '../lib/http.js'
import { consumeTitleQuota } from '../lib/quota.js'
import { isUlid } from '../lib/ulid.js'

/**
 * Lecture des titres (§7.1, §8.5).
 *
 * Aucun endpoint de liste, aucune pagination sur les segments, aucun moyen
 * d'énumérer quoi que ce soit : la seule façon d'obtenir un titre est de le nommer
 * (§8.2). C'est ce qui rend le quota de 50 titres par jour effectif.
 */

const SOURCE_KINDS = ['netflix', 'disney', 'prime', 'youtube', 'file', 'canonical'] as const
type SourceKind = (typeof SOURCE_KINDS)[number]

const isSourceKind = (value: string): value is SourceKind =>
  (SOURCE_KINDS as readonly string[]).includes(value)

/**
 * Les intergiciels sont attachés **route par route**, jamais par `use('*')`.
 *
 * Plusieurs sous-applications sont montées sur `/v1` : un `use('*')` dans l'une
 * d'elles s'appliquerait à toutes les requêtes `/v1` qu'aucune route ne résout, et
 * ferait répondre 403 là où il faut 404. Un sondage anonyme apprendrait alors quelles
 * routes existent.
 */
export const titleRoutes = () => {
  const app = new Hono<AppBindings>()

  /** Résout un identifiant de plateforme vers un titleId. Consomme du quota. */
  app.get('/lookup', requireDevice, async (c) => {
    const kind = boundedString(c.req.query('kind'), 32)
    const externalId = boundedString(c.req.query('externalId'), 128)
    if (kind === undefined || externalId === undefined || !isSourceKind(kind)) {
      return fail(c, 'bad-request', 'kind ou externalId invalide')
    }

    const db = dbOf(c.env)
    const rows = await db
      .select({ titleId: titleSources.titleId })
      .from(titleSources)
      .where(and(eq(titleSources.kind, kind), eq(titleSources.externalId, externalId)))
      .limit(1)

    const found = rows[0]
    if (found === undefined) return fail(c, 'not-found', 'titre inconnu')

    // Le quota se compte ici : c'est cet appel qu'un aspirateur ferait en boucle.
    const nowMs = Date.now()
    const quota = await consumeTitleQuota(db, c.get('deviceId'), found.titleId, nowMs)
    if (!quota.allowed) {
      return fail(c, 'quota-exceeded', 'quota journalier atteint', {
        'Retry-After': String(secondsUntilUtcMidnight(nowMs)),
      })
    }

    return c.json({ titleId: found.titleId }, 200, { 'Cache-Control': 'private, max-age=3600' })
  })

  /** Document public d'un titre. */
  app.get('/titles/:id', requireDevice, async (c) => {
    const titleId = c.req.param('id')
    if (!isUlid(titleId)) return fail(c, 'bad-request', 'identifiant invalide')

    const db = dbOf(c.env)
    const titleRows = await db
      .select({
        // On sélectionne colonne par colonne, jamais `select()` complet : ainsi
        // `creditsStart` et `creditsEnd` ne peuvent pas fuiter par inadvertance (§6).
        id: titles.id,
        publicSlug: titles.publicSlug,
        name: titles.name,
        year: titles.year,
        runtimeCanonical: titles.runtimeCanonical,
      })
      .from(titles)
      .where(eq(titles.id, titleId))
      .limit(1)

    const title = titleRows[0]
    if (title === undefined) return fail(c, 'not-found', 'titre inconnu')

    const nowMs = Date.now()
    const quota = await consumeTitleQuota(db, c.get('deviceId'), titleId, nowMs)
    if (!quota.allowed) {
      return fail(c, 'quota-exceeded', 'quota journalier atteint', {
        'Retry-After': String(secondsUntilUtcMidnight(nowMs)),
      })
    }

    const requested = (c.req.query('phobias') ?? '').split(',').filter((id) => id !== '')
    const wanted = resolveEnabledPhobias(requested)
    if (wanted.length === 0) return fail(c, 'bad-request', 'aucune phobie valide demandée')

    const segmentRows = await db
      .select({
        id: segments.id,
        phobiaId: segments.phobiaId,
        start: segments.start,
        end: segments.end,
        modality: segments.modality,
        status: segments.status,
        score: segments.score,
        origin: segments.origin,
      })
      .from(segments)
      .where(
        and(
          eq(segments.titleId, titleId),
          inArray(segments.phobiaId, [...wanted]),
          // Un segment désactivé n'est pas servi : le client n'a rien à en faire,
          // et l'envoyer révélerait ce que la foule a écarté.
          ne(segments.status, 'disabled'),
        ),
      )

    const sourceRows = await db
      .select({
        kind: titleSources.kind,
        externalId: titleSources.externalId,
        offset: titleSources.offset,
        scale: titleSources.scale,
      })
      .from(titleSources)
      .where(eq(titleSources.titleId, titleId))

    const syncRows = await db
      .select({ version: syncIndexes.version })
      .from(syncIndexes)
      .where(eq(syncIndexes.titleId, titleId))
      .limit(1)

    const sync = syncRows[0]

    const document: TitleDocument = {
      v: TIMELINE_FORMAT_VERSION,
      title: {
        slug: title.publicSlug,
        name: title.name,
        year: title.year,
        runtime: title.runtimeCanonical,
      },
      sources: sourceRows,
      segments: segmentRows
        .map((row) => ({
          id: row.id as TitleDocument['segments'][number]['id'],
          phobia: row.phobiaId as TitleDocument['segments'][number]['phobia'],
          start: row.start,
          end: row.end,
          modality: row.modality,
          status: row.status,
          score: row.score,
          origin: row.origin,
        }))
        .sort((a, b) => a.start - b.start),
      // TODO(M8) : appliquer le filigrane par appareil avant de servir, et mettre
      // en cache par (titleId, deviceBucket). Conception dans le dépôt privé
      // `calmcut-watermark`.
      ...(sync !== undefined
        ? { sync: { version: sync.version, url: `/v1/titles/${titleId}/sync` } }
        : {}),
    }

    return c.json(document, 200, { 'Cache-Control': 'private, max-age=300' })
  })

  /** Index de synchro binaire. */
  app.get('/titles/:id/sync', requireDevice, async (c) => {
    const titleId = c.req.param('id')
    if (!isUlid(titleId)) return fail(c, 'bad-request', 'identifiant invalide')

    const db = dbOf(c.env)
    const rows = await db
      .select({ r2Key: syncIndexes.r2Key, version: syncIndexes.version })
      .from(syncIndexes)
      .where(eq(syncIndexes.titleId, titleId))
      .limit(1)

    const row = rows[0]
    if (row === undefined) return fail(c, 'not-found', 'index indisponible')

    if (row.version !== SYNC_INDEX_VERSION) {
      // L'index est périmé : mieux vaut ne rien servir que de faire verrouiller un
      // client sur un format qu'il interprétera de travers.
      return fail(c, 'not-found', 'index en cours de reconstruction')
    }

    const object = await c.env.DATA.get(row.r2Key)
    if (object === null) return fail(c, 'not-found', 'index indisponible')

    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'private, max-age=86400',
        'X-Sync-Version': String(row.version),
      },
    })
  })

  return app
}
