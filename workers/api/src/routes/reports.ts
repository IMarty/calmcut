import { reports, segments, titles, votes } from '@calmcut/db'
import { isEnabledPhobia } from '@calmcut/phobias'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { dbOf, requireDevice } from '../lib/auth.js'
import type { AppBindings } from '../lib/env.js'
import { boundedString, fail, finiteNumber, readJson } from '../lib/http.js'
import { isUlid, ulid } from '../lib/ulid.js'

/**
 * Signalements et votes (§7.6).
 *
 * **L'asymétrie est la règle.** Un seul signalement `present` rend un segment
 * actif pour tout le monde, immédiatement, en statut `pending` — parce qu'un rat
 * qui passe est grave et qu'une alerte de trop est bénigne. Le désactiver exige un
 * consensus, calculé par le cron d'agrégation (M7), jamais par une seule requête.
 *
 * Les deux routes répondent `202` sans attendre : le client doit donner un retour
 * visuel en moins de 50 ms et poster en arrière-plan (principe 9).
 */

/** Temps de réaction humain retiré de la position signalée (§7.6). */
const REACTION_DELAY = 2
/** Un nouveau segment couvre `[t − 3, t + 5]` autour de la position corrigée. */
const SEGMENT_BEFORE = 3
const SEGMENT_AFTER = 5
/** Deux signalements à moins de 5 s l'un de l'autre alimentent le même segment. */
const GROUPING_WINDOW = 5

const SOURCE_KINDS = ['netflix', 'disney', 'prime', 'youtube', 'file', 'canonical'] as const

export const reportRoutes = () => {
  const app = new Hono<AppBindings>()

  // Intergiciel par route : voir la note dans `routes/titles.ts`.
  app.post('/reports', requireDevice, async (c) => {
    const body = await readJson(c)
    if (body === undefined) return fail(c, 'bad-request', 'corps JSON attendu')

    const titleId = boundedString(body.titleId, 26)
    const phobia = boundedString(body.phobia, 64)
    const kind = boundedString(body.kind, 16)
    const rawPosition = finiteNumber(body.position, 0, 86_400)
    const sourceKind = boundedString(body.sourceKind, 32)

    if (titleId === undefined || !isUlid(titleId)) {
      return fail(c, 'bad-request', 'titleId invalide')
    }
    if (phobia === undefined || !isEnabledPhobia(phobia)) {
      return fail(c, 'bad-request', 'phobie inconnue ou désactivée')
    }
    if (kind !== 'present' && kind !== 'false-alarm') {
      return fail(c, 'bad-request', 'kind doit valoir present ou false-alarm')
    }
    if (rawPosition === undefined) return fail(c, 'bad-request', 'position invalide')
    if (sourceKind !== undefined && !(SOURCE_KINDS as readonly string[]).includes(sourceKind)) {
      return fail(c, 'bad-request', 'sourceKind inconnu')
    }

    const db = dbOf(c.env)
    const titleRows = await db
      .select({ runtime: titles.runtimeCanonical })
      .from(titles)
      .where(eq(titles.id, titleId))
      .limit(1)

    const title = titleRows[0]
    if (title === undefined) return fail(c, 'not-found', 'titre inconnu')
    if (rawPosition > title.runtime + 60) {
      return fail(c, 'bad-request', 'position au-delà de la durée du titre')
    }

    // On signale toujours *après* avoir vu la chose : la position utile est en amont.
    const position = Math.max(0, rawPosition - REACTION_DELAY)

    const deviceId = c.get('deviceId')
    const weight = c.get('reputation')
    const nowS = Math.floor(Date.now() / 1000)

    const segmentId =
      kind === 'present'
        ? await attachToSegment(db, { titleId, phobia, position, weight, nowS })
        : await findSegmentAt(db, titleId, phobia, position)

    await db.insert(reports).values({
      id: ulid(),
      segmentId,
      titleId,
      phobiaId: phobia,
      position,
      kind,
      deviceId,
      sourceKind: sourceKind as (typeof SOURCE_KINDS)[number] | undefined,
      createdAt: nowS,
    })

    // Un signalement de fausse alerte vaut aussi comme vote négatif : c'est le même
    // geste côté utilisateur, et la pondération est déjà là.
    if (kind === 'false-alarm' && segmentId !== null) {
      await castVote(db, segmentId, deviceId, -1, weight, nowS)
    }

    return c.json({ accepted: true, segmentId }, 202, { 'Cache-Control': 'no-store' })
  })

  app.post('/votes', requireDevice, async (c) => {
    const body = await readJson(c)
    if (body === undefined) return fail(c, 'bad-request', 'corps JSON attendu')

    const segmentId = boundedString(body.segmentId, 26)
    const value = body.value
    if (segmentId === undefined || !isUlid(segmentId)) {
      return fail(c, 'bad-request', 'segmentId invalide')
    }
    if (value !== 1 && value !== -1) return fail(c, 'bad-request', 'value doit valoir 1 ou -1')

    const db = dbOf(c.env)
    const exists = await db
      .select({ id: segments.id })
      .from(segments)
      .where(eq(segments.id, segmentId))
      .limit(1)
    if (exists.length === 0) return fail(c, 'not-found', 'segment inconnu')

    await castVote(
      db,
      segmentId,
      c.get('deviceId'),
      value,
      c.get('reputation'),
      Math.floor(Date.now() / 1000),
    )
    return c.json({ accepted: true }, 202, { 'Cache-Control': 'no-store' })
  })

  return app
}

type Db = ReturnType<typeof dbOf>

/**
 * Rattache un signalement à un segment existant, ou en crée un.
 *
 * Le segment créé est immédiatement `pending`, donc immédiatement appliqué par les
 * clients : c'est l'asymétrie voulue. Un seul témoignage suffit à protéger.
 */
const attachToSegment = async (
  db: Db,
  input: {
    readonly titleId: string
    readonly phobia: string
    readonly position: number
    readonly weight: number
    readonly nowS: number
  },
): Promise<string> => {
  const near = await findSegmentAt(db, input.titleId, input.phobia, input.position)

  if (near !== null) {
    await db
      .update(segments)
      .set({
        // Le segment s'étend pour couvrir ce nouveau témoignage : deux personnes
        // qui signalent à cinq secondes d'écart ont vu la même scène, plus longue
        // que ce qu'on croyait.
        start: sql`MIN(${segments.start}, ${input.position - SEGMENT_BEFORE})`,
        end: sql`MAX(${segments.end}, ${input.position + SEGMENT_AFTER})`,
        score: sql`MIN(0.99, ${segments.score} + ${input.weight * 0.1})`,
        reportsCount: sql`${segments.reportsCount} + 1`,
        updatedAt: input.nowS,
      })
      .where(eq(segments.id, near))
    return near
  }

  const id = ulid(input.nowS * 1000)
  await db.insert(segments).values({
    id,
    titleId: input.titleId,
    phobiaId: input.phobia,
    start: Math.max(0, input.position - SEGMENT_BEFORE),
    end: input.position + SEGMENT_AFTER,
    modality: 'user',
    origin: 'user',
    status: 'pending',
    score: Math.min(0.99, 0.3 + input.weight * 0.1),
    reportsCount: 1,
    createdAt: input.nowS,
    updatedAt: input.nowS,
  })
  return id
}

/** Segment de la même phobie dont la plage englobe la position, à 5 s près. */
const findSegmentAt = async (
  db: Db,
  titleId: string,
  phobia: string,
  position: number,
): Promise<string | null> => {
  const rows = await db
    .select({ id: segments.id })
    .from(segments)
    .where(
      and(
        eq(segments.titleId, titleId),
        eq(segments.phobiaId, phobia),
        lte(segments.start, position + GROUPING_WINDOW),
        gte(segments.end, position - GROUPING_WINDOW),
      ),
    )
    .orderBy(segments.start)
    .limit(1)

  return rows[0]?.id ?? null
}

/**
 * Enregistre un vote. Un second vote du même appareil remplace le premier.
 *
 * Le changement de statut n'a **pas** lieu ici : passer un segment en `disabled`
 * exige au moins 5 votes pondérés dont 2 d'appareils de réputation ≥ 2, ce que
 * seul le cron d'agrégation peut évaluer (M7). Une requête isolée ne doit jamais
 * pouvoir éteindre une protection.
 */
const castVote = async (
  db: Db,
  segmentId: string,
  deviceId: string,
  value: 1 | -1,
  weight: number,
  nowS: number,
): Promise<void> => {
  await db
    .insert(votes)
    .values({ segmentId, deviceId, value, weight, createdAt: nowS })
    .onConflictDoUpdate({
      target: [votes.segmentId, votes.deviceId],
      set: { value, weight, createdAt: nowS },
    })

  await db.update(segments).set({ updatedAt: nowS }).where(eq(segments.id, segmentId))
}
