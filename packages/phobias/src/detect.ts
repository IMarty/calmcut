import type { PhobiaId, PhobiaProfile } from '@calmcut/core'
import { findPhobia } from './index.js'

/**
 * Détection de scènes phobogènes dans des sous-titres.
 *
 * Même code pour deux appelants très différents :
 *
 * - le **batch T1** (§7.2), qui traite des sous-titres SDH récupérés par API et
 *   pousse des segments `pending` vers l'ingestion ;
 * - le **mode démo du compagnon**, où l'utilisateur fournit son propre `.srt` et
 *   obtient immédiatement une protection, sans API ni compte.
 *
 * Le texte n'est jamais conservé : seuls des horaires et un identifiant de phobie
 * sortent de cette fonction (principe 1).
 */

/** Une réplique à examiner. */
export interface DetectableCue {
  readonly text: string
  /** Secondes. */
  readonly start: number
  /** Secondes. */
  readonly end: number
}

/** Une scène détectée, sur la timeline des sous-titres. */
export interface DetectedScene {
  readonly phobia: PhobiaId
  readonly start: number
  readonly end: number
  /** 0→1. Une indication sonore vaut plus qu'un mot dans le dialogue. */
  readonly confidence: number
  /** Ce qui a déclenché la détection. */
  readonly evidence: 'sound-cue' | 'keyword'
  /**
   * Indices, dans le tableau fourni, des répliques qui ont déclenché la détection.
   *
   * **Des indices, et non le texte.** Ce paquet est consommé par `calmcut-batch`,
   * où le texte des sous-titres doit être jeté après traitement (principe 1) :
   * le faire remonter ici y mettrait un piège permanent. L'appelant qui possède
   * déjà les répliques peut les retrouver ; celui qui ne les a plus n'obtient que
   * des nombres.
   *
   * Une scène issue de plusieurs répliques fusionnées en porte plusieurs.
   */
  readonly cues: readonly number[]
}

export interface DetectOptions {
  /** Marge ajoutée de part et d'autre, en secondes. Défaut : 2 (§7.2). */
  readonly margin?: number
  /**
   * Deux détections séparées de moins de ce délai forment une seule scène.
   * Défaut : 8 s.
   */
  readonly mergeWithin?: number
}

/**
 * Les indications sonores sont bien plus fiables que le dialogue.
 *
 * `[couinements]` dit qu'un rat est audible maintenant. « J'ai horreur des rats »
 * dit seulement qu'on en parle — souvent sans qu'aucun rat soit à l'écran.
 */
const SOUND_CUE_CONFIDENCE = 0.75
const KEYWORD_CONFIDENCE = 0.4

/** Contenu entre crochets : c'est là que vivent les indications sonores SDH. */
const BRACKETED = /\[([^\]]*)\]|\(([^)]*)\)/g

const DEFAULTS = { margin: 2, mergeWithin: 8 }

const scan = (
  cue: DetectableCue,
  profile: PhobiaProfile,
  cueIndex: number,
): DetectedScene | undefined => {
  // Les indications sonores ne comptent que dans les crochets : « squeak » dans
  // une réplique parlée n'est pas un bruit de rat.
  const bracketed = [...cue.text.matchAll(BRACKETED)]
    .map((match) => match[1] ?? match[2] ?? '')
    .join(' ')

  if (bracketed !== '' && profile.subtitles.soundCues.some((re) => re.test(bracketed))) {
    return {
      phobia: profile.id,
      start: cue.start,
      end: cue.end,
      confidence: SOUND_CUE_CONFIDENCE,
      evidence: 'sound-cue',
      cues: [cueIndex],
    }
  }

  // Une indication sonore peut aussi nommer directement la bête : « [rats] ».
  if (bracketed !== '' && profile.subtitles.keywords.some((re) => re.test(bracketed))) {
    return {
      phobia: profile.id,
      start: cue.start,
      end: cue.end,
      confidence: SOUND_CUE_CONFIDENCE,
      evidence: 'sound-cue',
      cues: [cueIndex],
    }
  }

  if (profile.subtitles.keywords.some((re) => re.test(cue.text))) {
    return {
      phobia: profile.id,
      start: cue.start,
      end: cue.end,
      confidence: KEYWORD_CONFIDENCE,
      evidence: 'keyword',
      cues: [cueIndex],
    }
  }

  return undefined
}

/**
 * Cherche les scènes phobogènes dans des sous-titres.
 *
 * Les phobies demandées sont résolues par identifiant, activées ou non : le batch
 * doit pouvoir préparer des données pour une phobie encore désactivée côté client.
 *
 * Les scènes sont renvoyées triées, marges appliquées et chevauchements fusionnés.
 */
export const detectFromSubtitles = (
  cues: readonly DetectableCue[],
  phobiaIds: readonly string[],
  options: DetectOptions = {},
): DetectedScene[] => {
  const margin = options.margin ?? DEFAULTS.margin
  const mergeWithin = options.mergeWithin ?? DEFAULTS.mergeWithin

  const profiles = phobiaIds
    .map((id) => findPhobia(id))
    .filter((profile): profile is PhobiaProfile => profile !== undefined)
  if (profiles.length === 0) return []

  const found: DetectedScene[] = []
  cues.forEach((cue, cueIndex) => {
    for (const profile of profiles) {
      const scene = scan(cue, profile, cueIndex)
      if (scene !== undefined) found.push(scene)
    }
  })

  found.sort((a, b) => a.start - b.start || a.end - b.end)

  const merged: DetectedScene[] = []
  for (const scene of found) {
    const widened = {
      ...scene,
      start: Math.max(0, scene.start - margin),
      end: scene.end + margin,
    }
    const last = merged[merged.length - 1]

    if (
      last !== undefined &&
      last.phobia === widened.phobia &&
      widened.start - last.end <= mergeWithin
    ) {
      merged[merged.length - 1] = {
        phobia: last.phobia,
        start: last.start,
        end: Math.max(last.end, widened.end),
        // Deux indices indépendants valent mieux qu'un : la confiance monte, sans
        // jamais atteindre 1 — seule la foule peut confirmer.
        confidence: Math.min(0.95, last.confidence + widened.confidence * 0.3),
        evidence: last.evidence === 'sound-cue' ? 'sound-cue' : widened.evidence,
        cues: [...last.cues, ...widened.cues],
      }
      continue
    }
    merged.push(widened)
  }

  return merged
}
