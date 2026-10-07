import {
  devices,
  phobias as phobiasTable,
  segments,
  syncIndexes,
  titles,
  titleSources,
} from '@calmcut/db'
import { allPhobias } from '@calmcut/phobias'
import { buildIndexFromCues, type SubtitleCue } from '@calmcut/sync'

/**
 * Jeux de données de développement.
 *
 * **Tout est synthétique.** Aucun titre réel, aucun dialogue réel, aucun index
 * dérivé d'une œuvre : les dialogues sont générés, et les index de synchro le sont
 * à partir de ces dialogues générés. Ni le dépôt ni un environnement de dev ne
 * contiennent donc de donnée dérivée d'un contenu protégé (principe 1).
 *
 * Ce module est aussi utilisé par les tests d'intégration de l'API, ce qui garantit
 * qu'il reste fonctionnel : un outil de seed cassé se découvre d'habitude le jour
 * où on en a besoin.
 */

/** Générateur déterministe : deux exécutions produisent la même base. */
const lcg = (seed: number) => {
  let state = seed >>> 0
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** ULID déterministe, pour que les identifiants de seed soient stables. */
const seededUlid = (random: () => number, atMs: number): string => {
  let time = Math.floor(atMs)
  let out = ''
  for (let i = 0; i < 10; i += 1) {
    out = (ALPHABET[time % 32] as string) + out
    time = Math.floor(time / 32)
  }
  for (let i = 0; i < 16; i += 1) out += ALPHABET[Math.floor(random() * 32)] as string
  return out
}

const WORDS_A = ['la maison', 'le grenier', 'ce couloir', 'la cave', 'notre voisin', 'le concierge']
const WORDS_B = ['cache', 'garde', 'abrite', 'dissimule', 'renferme']
const WORDS_C = [
  'quelque chose d etrange',
  'un bruit continu',
  'une odeur tenace',
  'des traces fraiches',
]

export interface SeedTitle {
  readonly id: string
  readonly tmdbId: number
  readonly name: string
  readonly year: number
  readonly slug: string
  readonly runtime: number
  readonly creditsStart: number
  readonly creditsEnd: number
  readonly cues: SubtitleCue[]
  readonly sources: {
    kind: 'netflix' | 'youtube' | 'file' | 'canonical'
    externalId: string
    offset: number
  }[]
  readonly segments: {
    id: string
    phobia: string
    start: number
    end: number
    status: 'pending' | 'confirmed' | 'verified' | 'disabled'
  }[]
  /** Sel de hachage du titre : dérivé de l'identifiant, jamais public. */
  readonly salt: string
}

export interface SeedData {
  readonly titles: SeedTitle[]
  readonly devices: { id: string; reputation: number }[]
}

export interface SeedOptions {
  readonly titleCount?: number
  readonly seed?: number
  /** Date de référence, pour des horodatages stables. */
  readonly nowMs?: number
}

/** Construit un jeu de données synthétique. */
export const buildSeedData = (options: SeedOptions = {}): SeedData => {
  const random = lcg(options.seed ?? 1312)
  const count = options.titleCount ?? 12
  const nowMs = options.nowMs ?? Date.UTC(2026, 0, 1)

  const enabled = allPhobias.filter((p) => p.enabled)
  const titlesOut: SeedTitle[] = []

  for (let i = 0; i < count; i += 1) {
    const id = seededUlid(random, nowMs + i * 1000)
    const runtime = 4800 + Math.floor(random() * 3600)

    const cues: SubtitleCue[] = []
    let t = 20
    while (t < runtime - 300) {
      const a = WORDS_A[Math.floor(random() * WORDS_A.length)] as string
      const b = WORDS_B[Math.floor(random() * WORDS_B.length)] as string
      const c = WORDS_C[Math.floor(random() * WORDS_C.length)] as string
      cues.push({ text: `${a} ${b} ${c} ${cues.length}`, start: t })
      t += 3 + random() * 5
    }

    const sceneCount = 1 + Math.floor(random() * 4)
    const scenes: SeedTitle['segments'] = []
    for (let s = 0; s < sceneCount; s += 1) {
      const profile = enabled[Math.floor(random() * enabled.length)]
      if (profile === undefined) continue
      const start = 300 + random() * (runtime - 900)
      const statuses = ['pending', 'confirmed', 'verified', 'disabled'] as const
      scenes.push({
        id: seededUlid(random, nowMs + i * 1000 + s + 1),
        phobia: profile.id,
        start: Math.round(start * 10) / 10,
        end: Math.round((start + 4 + random() * 10) * 10) / 10,
        status: statuses[Math.floor(random() * statuses.length)] as (typeof statuses)[number],
      })
    }
    scenes.sort((a, b) => a.start - b.start)

    titlesOut.push({
      id,
      tmdbId: 900_000 + i,
      name: `Film de test ${i + 1}`,
      year: 2000 + (i % 25),
      slug: `film-de-test-${i + 1}-${2000 + (i % 25)}`,
      runtime,
      // Le générique occupe les trois dernières minutes.
      creditsStart: runtime - 180,
      creditsEnd: runtime,
      cues,
      sources: [
        // Un décalage non nul par défaut : c'est le cas réel, et un seed à
        // offset 0 masquerait un bug de conversion de timeline.
        { kind: 'netflix', externalId: `7${String(1_000_000 + i)}`, offset: -12.3 },
        { kind: 'canonical', externalId: id, offset: 0 },
      ],
      segments: scenes,
      salt: `seed:${id}`,
    })
  }

  return {
    titles: titlesOut,
    devices: [
      { id: seededUlid(random, nowMs), reputation: 1 },
      { id: seededUlid(random, nowMs + 1), reputation: 2.5 },
    ],
  }
}

/** Le strict minimum d'une base Drizzle pour écrire le seed. */
type AnyDb = {
  insert: (table: unknown) => {
    values: (rows: unknown) => { onConflictDoNothing: () => Promise<unknown> }
  }
}

export interface SeedResult {
  readonly titles: number
  readonly segments: number
  readonly indexBytes: number
}

/**
 * Écrit le jeu de données.
 *
 * `bucket` est optionnel : sans lui, les index de synchro ne sont pas stockés et
 * les lignes `sync_indexes` ne sont pas créées. Un environnement de dev sans R2
 * reste ainsi utilisable.
 */
export const seedDatabase = async (
  db: AnyDb,
  data: SeedData,
  bucket?: { put: (key: string, value: ArrayBuffer) => Promise<unknown> },
  nowS: number = Math.floor(Date.UTC(2026, 0, 1) / 1000),
): Promise<SeedResult> => {
  // Le catalogue des phobies vient du paquet : c'est lui la source de vérité.
  for (const profile of allPhobias) {
    await db
      .insert(phobiasTable)
      .values({ id: profile.id, label: profile.labels.fr, emoji: profile.emoji })
      .onConflictDoNothing()
  }

  for (const device of data.devices) {
    await db
      .insert(devices)
      .values({
        id: device.id,
        reputation: device.reputation,
        createdAt: nowS,
        lastSeenAt: nowS,
        quotaUsed: 0,
      })
      .onConflictDoNothing()
  }

  let segmentCount = 0
  let indexBytes = 0

  for (const title of data.titles) {
    await db
      .insert(titles)
      .values({
        id: title.id,
        tmdbId: title.tmdbId,
        kind: 'movie',
        name: title.name,
        year: title.year,
        runtimeCanonical: title.runtime,
        creditsStart: title.creditsStart,
        creditsEnd: title.creditsEnd,
        publicSlug: title.slug,
        createdAt: nowS,
        updatedAt: nowS,
      })
      .onConflictDoNothing()

    for (const [i, source] of title.sources.entries()) {
      await db
        .insert(titleSources)
        .values({
          id: `${title.id}-src-${i}`,
          titleId: title.id,
          kind: source.kind,
          externalId: source.externalId,
          offset: source.offset,
          scale: 1,
          confidence: 0.9,
          method: 'subs-align',
        })
        .onConflictDoNothing()
    }

    for (const segment of title.segments) {
      await db
        .insert(segments)
        .values({
          id: segment.id,
          titleId: title.id,
          phobiaId: segment.phobia,
          start: segment.start,
          end: segment.end,
          modality: 'subs',
          origin: 'batch',
          status: segment.status,
          score: 0.6,
          reportsCount: 0,
          createdAt: nowS,
          updatedAt: nowS,
        })
        .onConflictDoNothing()
      segmentCount += 1
    }

    if (bucket !== undefined) {
      const index = buildIndexFromCues(title.cues, title.salt)
      const key = `sync/${title.id}.bin`
      await bucket.put(key, index)
      indexBytes += index.byteLength
      await db
        .insert(syncIndexes)
        .values({
          titleId: title.id,
          version: 1,
          r2Key: key,
          cuesCount: title.cues.length,
          updatedAt: nowS,
        })
        .onConflictDoNothing()
    }
  }

  return { titles: data.titles.length, segments: segmentCount, indexBytes }
}
