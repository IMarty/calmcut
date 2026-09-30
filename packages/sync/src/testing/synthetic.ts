import type { SubtitleCue } from '../index-format.js'
import type { HeardSegment } from '../histogram.js'

/**
 * Timelines synthétiques pour les tests.
 *
 * Exclu du build : ce module n'est pas publié. Il sert à valider l'algorithme de
 * verrouillage sur les quatre situations que le critère d'acceptation de M1
 * exige — décalage, facteur d'échelle, pause, coupure publicitaire — sans jamais
 * dépendre d'une œuvre réelle (principe 1).
 */

/** Générateur congruentiel linéaire : déterministe, donc les tests le sont aussi. */
const lcg = (seed: number) => {
  let state = seed >>> 0
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const SUBJECTS = [
  'le gardien',
  'ma soeur',
  'cet homme',
  'la voisine',
  'le chauffeur',
  'notre invite',
  'la doctoresse',
  'ton frere',
]
const VERBS = [
  'a trouve',
  'refuse de voir',
  'attendait',
  'a compris',
  'cherchait',
  'a reconnu',
  'redoutait',
  'ignorait',
]
const OBJECTS = [
  'la porte du fond',
  'ce vieux carnet',
  'les traces dans la neige',
  'une lettre sans timbre',
  'le bruit du grenier',
  'la clef rouillee',
  'trois billets froisses',
  'le dernier train',
]
const TAILS = [
  'avant la nuit',
  'sans rien dire',
  'depuis des annees',
  'malgre la pluie',
  'pour la seconde fois',
  'en silence',
  'ce matin la',
  'une fois de plus',
]

/**
 * Un script de dialogues plausible et surtout **varié** : si les répliques se
 * répétaient, chaque trigramme aurait plusieurs occurrences dans le film et
 * l'histogramme aurait plusieurs pics — ce qui testerait autre chose.
 */
export const syntheticScript = (
  cueCount: number,
  options: { readonly seed?: number; readonly gap?: number; readonly startAt?: number } = {},
): SubtitleCue[] => {
  const random = lcg(options.seed ?? 42)
  const gap = options.gap ?? 4
  let t = options.startAt ?? 12

  const pick = <T>(pool: readonly T[]): T => pool[Math.floor(random() * pool.length)] as T

  const cues: SubtitleCue[] = []
  for (let i = 0; i < cueCount; i += 1) {
    // L'indice rend chaque réplique unique même si le tirage se répète.
    cues.push({
      text: `${pick(SUBJECTS)} ${pick(VERBS)} ${pick(OBJECTS)} ${pick(TAILS)} ${i}`,
      start: t,
    })
    t += gap + random() * gap
  }
  return cues
}

/** Un intervalle pendant lequel le film n'avance pas (pause, publicité). */
export interface Interruption {
  /** Instant local où l'interruption commence, en secondes. */
  readonly at: number
  /** Durée, en secondes. */
  readonly duration: number
}

export interface PlaybackOptions {
  /** Position canonique au démarrage de l'horloge locale, en secondes. */
  readonly offset?: number
  /** Vitesse de lecture. 25 / 23.976 pour un transfert PAL. */
  readonly rate?: number
  /** Pauses et coupures publicitaires. */
  readonly interruptions?: readonly Interruption[]
}

/**
 * Convertit un instant de l'horloge locale en position dans le film.
 *
 * Pendant une interruption, la position du film n'avance plus alors que
 * l'horloge locale continue : c'est exactement ce qui fait diverger le suivi.
 */
export const makeClock = (options: PlaybackOptions = {}) => {
  const offset = options.offset ?? 0
  const rate = options.rate ?? 1
  const interruptions = [...(options.interruptions ?? [])].sort((a, b) => a.at - b.at)

  return (local: number): number => {
    let frozen = 0
    for (const gap of interruptions) {
      if (local <= gap.at) break
      frozen += Math.min(local - gap.at, gap.duration)
    }
    return offset + (local - frozen) * rate
  }
}

export interface ListenOptions {
  /** Durée de la fenêtre d'écoute, en secondes. Défaut : 8. */
  readonly windowSeconds?: number
  /** Erreur de segmentation de Whisper, en secondes. Défaut : 0,25. */
  readonly segmentationError?: number
  /** Proportion de mots mal transcrits. Défaut : 0. */
  readonly wordErrorRate?: number
  readonly seed?: number
}

/**
 * Simule ce que Whisper produit pour une fenêtre d'écoute donnée.
 *
 * On ne modélise pas l'audio : on part des répliques réellement prononcées
 * pendant la fenêtre, et on y injecte les deux erreurs qui comptent vraiment —
 * un décalage de segmentation, et des mots mal entendus.
 */
export const listen = (
  cues: readonly SubtitleCue[],
  clock: (local: number) => number,
  windowStart: number,
  options: ListenOptions = {},
): HeardSegment[] => {
  const windowSeconds = options.windowSeconds ?? 8
  const error = options.segmentationError ?? 0.25
  const wer = options.wordErrorRate ?? 0
  const random = lcg(options.seed ?? Math.floor(windowStart * 1000) + 7)

  const from = clock(windowStart)
  const to = clock(windowStart + windowSeconds)

  const degrade = (text: string): string => {
    if (wer === 0) return text
    return text
      .split(' ')
      .map((word) => (random() < wer ? 'euh' : word))
      .join(' ')
  }

  const segments: HeardSegment[] = []
  for (const cue of cues) {
    if (cue.start < from || cue.start >= to) continue
    // Inversion de l'horloge : à quel instant local cette réplique est-elle entendue ?
    const localStart = invert(clock, cue.start, windowStart, windowStart + windowSeconds)
    if (localStart === undefined) continue
    segments.push({
      text: degrade(cue.text),
      start: localStart + (random() * 2 - 1) * error,
    })
  }
  return segments
}

/** Recherche dichotomique de l'instant local correspondant à une position du film. */
const invert = (
  clock: (local: number) => number,
  canonical: number,
  lo: number,
  hi: number,
): number | undefined => {
  if (clock(lo) > canonical || clock(hi) < canonical) return undefined
  let a = lo
  let b = hi
  for (let i = 0; i < 60; i += 1) {
    const mid = (a + b) / 2
    if (clock(mid) < canonical) a = mid
    else b = mid
  }
  return (a + b) / 2
}
