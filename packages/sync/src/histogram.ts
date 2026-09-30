import type { SyncIndex } from './index-format.js'
import { hashTrigrams } from './trigrams.js'

/** Un trigramme entendu, et l'instant local auquel il l'a été. */
export interface HeardTrigram {
  readonly hash: number
  /** Secondes, sur l'horloge locale du client. */
  readonly at: number
}

/**
 * Hypothèse de position : `canonique = local + offset`.
 *
 * `support` compte les trigrammes **distincts** qui concordent, pas les
 * candidats : une réplique répétée trois fois dans le film ne doit pas valoir
 * trois témoignages indépendants.
 */
export interface OffsetEstimate {
  readonly offset: number
  readonly support: number
  /** Écart entre le plus petit et le plus grand offset concordant, en secondes. */
  readonly spread: number
}

export interface EstimateOptions {
  /** Demi-largeur de la fenêtre de concordance, en secondes. Défaut : 0,5. */
  readonly tolerance?: number
}

/** Demi-largeur par défaut de la fenêtre de concordance, en secondes (§7.3). */
export const DEFAULT_TOLERANCE = 0.5

interface Candidate {
  readonly offset: number
  /** Indice du trigramme entendu d'où vient ce candidat. */
  readonly source: number
}

/** Un segment de transcription : ce que Whisper a entendu, et quand il a commencé. */
export interface HeardSegment {
  readonly text: string
  /** Secondes, sur l'horloge locale du client. */
  readonly start: number
}

/**
 * Convertit des segments de transcription en trigrammes horodatés.
 *
 * **Tous les trigrammes d'un segment portent l'instant de début du segment**, et
 * non une position interpolée. C'est la symétrie exacte de ce que fait l'index,
 * où tous les trigrammes d'une réplique portent son `cueStart` : les deux côtés
 * commettent alors la même approximation, et elle s'annule dans la différence.
 *
 * Interpoler serait pire. Sur une fenêtre de 8 s, répartir les trigrammes
 * uniformément disperserait les offsets candidats de plusieurs secondes — bien
 * au-delà de la tolérance de ±0,5 s — et aucun pic ne se formerait.
 */
export const hearSegments = (
  segments: readonly HeardSegment[],
  titleSalt: string,
): readonly HeardTrigram[] => {
  const out: HeardTrigram[] = []
  for (const segment of segments) {
    for (const hash of hashTrigrams(segment.text, titleSalt)) {
      out.push({ hash, at: segment.start })
    }
  }
  return out
}

/**
 * Cherche l'offset qui explique le mieux ce qui vient d'être entendu.
 *
 * Chaque couple (trigramme entendu à `t`, occurrence connue à `c`) propose
 * `offset = c − t`. Le bon offset est celui autour duquel ces propositions
 * s'agglutinent — une fenêtre glissante de largeur `2 × tolerance` trouve
 * l'agglutination la plus large.
 *
 * Renvoie `undefined` si aucun trigramme entendu n'a de correspondance.
 */
export const estimateOffset = (
  heard: readonly HeardTrigram[],
  index: SyncIndex,
  options: EstimateOptions = {},
): OffsetEstimate | undefined => {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE

  const candidates: Candidate[] = []
  heard.forEach((trigram, source) => {
    for (const cueStart of index.lookup(trigram.hash)) {
      candidates.push({ offset: cueStart - trigram.at, source })
    }
  })

  if (candidates.length === 0) return undefined

  candidates.sort((a, b) => a.offset - b.offset)

  const width = tolerance * 2
  const inWindow = new Map<number, number>()
  let best: { start: number; end: number; support: number } | undefined
  let lo = 0

  for (let hi = 0; hi < candidates.length; hi += 1) {
    const entering = candidates[hi] as Candidate
    inWindow.set(entering.source, (inWindow.get(entering.source) ?? 0) + 1)

    while ((candidates[hi] as Candidate).offset - (candidates[lo] as Candidate).offset > width) {
      const leaving = candidates[lo] as Candidate
      const left = (inWindow.get(leaving.source) as number) - 1
      if (left === 0) inWindow.delete(leaving.source)
      else inWindow.set(leaving.source, left)
      lo += 1
    }

    const support = inWindow.size
    if (best === undefined || support > best.support) {
      best = { start: lo, end: hi, support }
    }
  }

  if (best === undefined) return undefined

  const cluster = candidates.slice(best.start, best.end + 1)

  // Un offset par trigramme entendu : sans cela, une réplique récurrente pèserait
  // autant de fois qu'elle apparaît dans le film.
  const perSource = new Map<number, number>()
  for (const candidate of cluster) {
    if (!perSource.has(candidate.source)) perSource.set(candidate.source, candidate.offset)
  }

  const offsets = [...perSource.values()].sort((a, b) => a - b)
  const middle = offsets.length >> 1
  const offset =
    offsets.length % 2 === 1
      ? (offsets[middle] as number)
      : ((offsets[middle - 1] as number) + (offsets[middle] as number)) / 2

  return {
    offset,
    support: best.support,
    spread: (offsets[offsets.length - 1] as number) - (offsets[0] as number),
  }
}
