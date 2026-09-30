import { SYNC_INDEX_VERSION } from './version.js'
import { hashTrigrams } from './trigrams.js'

/** `CCSY`, en octets. */
const MAGIC = [0x43, 0x43, 0x53, 0x59] as const
export const SYNC_INDEX_HEADER_BYTES = 16
const PAIR_BYTES = 8

/** Résolution temporelle de l'index : la centiseconde. */
const TIME_SCALE = 100

/** Temps maximal représentable, en secondes (uint32 de centisecondes). */
export const SYNC_INDEX_MAX_TIME = 0xffffffff / TIME_SCALE

export type SyncIndexErrorCode =
  'bad-magic' | 'unsupported-version' | 'truncated' | 'time-out-of-range'

/**
 * Une erreur d'index n'est jamais fatale pour l'utilisateur : le client doit
 * retomber en écoute plutôt que de verrouiller sur des données qu'il ne sait
 * pas interpréter. Le code permet de distinguer « je ne connais pas cette
 * version » (attendre un nouvel index) de « ce fichier est corrompu ».
 */
export class SyncIndexError extends Error {
  readonly code: SyncIndexErrorCode

  constructor(code: SyncIndexErrorCode, message: string) {
    super(message)
    this.name = 'SyncIndexError'
    this.code = code
  }
}

/** Une occurrence : un trigramme haché, et l'instant où il est prononcé. */
export interface SyncEntry {
  readonly hash: number
  /** Secondes, sur la timeline canonique. */
  readonly cueStart: number
}

/** Une réplique de sous-titre, avant hachage. Le texte n'est jamais conservé. */
export interface SubtitleCue {
  readonly text: string
  /** Secondes. */
  readonly start: number
}

/**
 * Sérialise les occurrences en un bloc binaire compact.
 *
 * Les paires sont triées par hash, ce qui permet une recherche dichotomique à la
 * lecture — le compagnon interroge l'index plusieurs fois par seconde pendant
 * qu'il écoute, et ne peut pas se permettre un parcours linéaire.
 */
export const buildSyncIndex = (entries: readonly SyncEntry[]): ArrayBuffer => {
  const pairs: SyncEntry[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    if (entry.cueStart < 0 || entry.cueStart > SYNC_INDEX_MAX_TIME) {
      throw new SyncIndexError(
        'time-out-of-range',
        `cueStart ${entry.cueStart}s hors de l'intervalle représentable [0, ${SYNC_INDEX_MAX_TIME}]`,
      )
    }
    const cs = Math.round(entry.cueStart * TIME_SCALE)
    const key = `${entry.hash >>> 0}:${cs}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push({ hash: entry.hash >>> 0, cueStart: cs })
  }

  pairs.sort((a, b) => a.hash - b.hash || a.cueStart - b.cueStart)

  const buffer = new ArrayBuffer(SYNC_INDEX_HEADER_BYTES + pairs.length * PAIR_BYTES)
  const view = new DataView(buffer)

  for (let i = 0; i < MAGIC.length; i += 1) view.setUint8(i, MAGIC[i] as number)
  view.setUint16(4, SYNC_INDEX_VERSION, true)
  view.setUint16(6, 0, true)
  view.setUint32(8, pairs.length, true)
  view.setUint32(12, 0, true)

  let offset = SYNC_INDEX_HEADER_BYTES
  for (const pair of pairs) {
    view.setUint32(offset, pair.hash, true)
    view.setUint32(offset + 4, pair.cueStart, true)
    offset += PAIR_BYTES
  }

  return buffer
}

/**
 * Construit l'index d'un titre à partir de ses sous-titres.
 *
 * Le texte est normalisé, découpé en trigrammes, haché avec un sel propre au
 * titre — puis **jeté**. Rien de ce qui entre dans cette fonction n'en ressort :
 * un index ne contient que des entiers (principe 1).
 */
export const buildIndexFromCues = (
  cues: readonly SubtitleCue[],
  titleSalt: string,
): ArrayBuffer => {
  const entries: SyncEntry[] = []
  for (const cue of cues) {
    for (const hash of hashTrigrams(cue.text, titleSalt)) {
      entries.push({ hash, cueStart: cue.start })
    }
  }
  return buildSyncIndex(entries)
}

/** Index lisible, avec recherche dichotomique. */
export interface SyncIndex {
  readonly version: number
  /** Nombre de paires. */
  readonly size: number
  /** Instants (en secondes) où ce trigramme est prononcé. Tableau vide si absent. */
  lookup(hash: number): readonly number[]
}

/**
 * Lit un index binaire.
 *
 * Refuse une version inconnue : mieux vaut rester en écoute que verrouiller sur
 * une interprétation erronée des octets — un verrouillage faux décale toutes les
 * protections, et c'est exactement le scénario « le rat passe ».
 */
export const parseSyncIndex = (buffer: ArrayBuffer): SyncIndex => {
  if (buffer.byteLength < SYNC_INDEX_HEADER_BYTES) {
    throw new SyncIndexError(
      'truncated',
      `index de ${buffer.byteLength} octets, en-tête de ${SYNC_INDEX_HEADER_BYTES} attendu`,
    )
  }

  const view = new DataView(buffer)
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (view.getUint8(i) !== MAGIC[i]) {
      throw new SyncIndexError('bad-magic', "ce fichier n'est pas un index de synchro CalmCut")
    }
  }

  const version = view.getUint16(4, true)
  if (version !== SYNC_INDEX_VERSION) {
    throw new SyncIndexError(
      'unsupported-version',
      `index en version ${version}, ce client ne sait lire que la ${SYNC_INDEX_VERSION}`,
    )
  }

  const count = view.getUint32(8, true)
  const expected = SYNC_INDEX_HEADER_BYTES + count * PAIR_BYTES
  if (buffer.byteLength < expected) {
    throw new SyncIndexError(
      'truncated',
      `index annonçant ${count} paires, soit ${expected} octets, mais il en fait ${buffer.byteLength}`,
    )
  }

  const pairs = new Uint32Array(buffer, SYNC_INDEX_HEADER_BYTES, count * 2)

  /** Indice de la première paire dont le hash est ≥ `hash`. */
  const lowerBound = (hash: number): number => {
    let lo = 0
    let hi = count
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if ((pairs[mid * 2] as number) < hash) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  return {
    version,
    size: count,
    lookup(hash: number): readonly number[] {
      const target = hash >>> 0
      const out: number[] = []
      for (let i = lowerBound(target); i < count && pairs[i * 2] === target; i += 1) {
        out.push((pairs[i * 2 + 1] as number) / TIME_SCALE)
      }
      return out
    },
  }
}
