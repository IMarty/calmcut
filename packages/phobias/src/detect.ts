import type { PhobiaId, PhobiaProfile } from '@calmcut/core'
import { findPhobia } from './index.js'

/**
 * Ce que des sous-titres peuvent, et ne peuvent pas, nous apprendre.
 *
 * Un premier essai sur un vrai film a produit **neuf détections, neuf faux
 * positifs**. La cause n'était pas un réglage trop permissif : c'était une erreur
 * de conception. Le code confondait deux choses qui n'ont presque rien à voir.
 *
 * - **Une mention** : le dialogue parle de rats. « Mes souris de laboratoire »,
 *   « parler à des souris », « il y avait une araignée sur son bureau ». Cela
 *   arrive constamment, et n'indique presque jamais qu'une bête soit à l'écran.
 * - **Une occurrence** : une indication sonore SDH atteste d'un bruit *présent*.
 *   `[couinements]`, `[grattements]`. C'est rare, et c'est exploitable.
 *
 * Seules les occurrences produisent des segments protégés. Les mentions alimentent
 * un indicateur **au niveau du titre** — « ce film parle de rats » — utile au SEO
 * et à la priorisation du batch, jamais à une protection horodatée.
 *
 * Voir `docs/adr/0007-mention-nest-pas-occurrence.md`.
 *
 * Le texte n'est jamais conservé : seuls des horaires, des identifiants de phobie
 * et des indices de répliques sortent d'ici (principe 1).
 */

/** Une réplique à examiner. */
export interface DetectableCue {
  readonly text: string
  /** Secondes. */
  readonly start: number
  /** Secondes. */
  readonly end: number
}

/**
 * Une scène détectée, sur la timeline des sous-titres.
 *
 * Toujours issue d'une indication sonore : c'est le seul indice qu'un fichier de
 * sous-titres donne sur ce qui est réellement présent.
 */
export interface DetectedScene {
  readonly phobia: PhobiaId
  readonly start: number
  readonly end: number
  /** 0→1. Jamais 1 : seule la foule peut confirmer. */
  readonly confidence: number
  readonly evidence: 'sound-cue'
  /**
   * Indices, dans le tableau fourni, des répliques qui ont déclenché la détection.
   *
   * **Des indices, et non le texte.** Ce paquet est consommé par `calmcut-batch`,
   * où le texte des sous-titres doit être jeté après traitement (principe 1) :
   * le faire remonter ici y mettrait un piège permanent. L'appelant qui possède
   * déjà les répliques peut les retrouver ; celui qui ne les a plus n'obtient que
   * des nombres.
   */
  readonly cues: readonly number[]
}

/**
 * Le film **parle** de cette phobie, sans qu'on sache quand elle est visible.
 *
 * Sert à l'indicateur de titre de T0/T1 (§7.2) et aux fiches SEO — « ce film
 * évoque les rats » — et à prioriser les titres que la foule devrait vérifier.
 * **Ne produit aucune protection.**
 */
export interface PhobiaMention {
  readonly phobia: PhobiaId
  /** Nombre de répliques concernées. */
  readonly count: number
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

/** Une indication sonore atteste d'un bruit présent, sans le confirmer. */
const SOUND_CUE_CONFIDENCE = 0.6

/** Contenu entre crochets ou parenthèses : c'est là que vivent les indications SDH. */
const BRACKETED = /\[([^\]]*)\]|\(([^)]*)\)/g

const DEFAULTS = { margin: 2, mergeWithin: 8 }

/** Ce qui est écrit entre crochets, concaténé. Vide s'il n'y a rien. */
const bracketedText = (text: string): string =>
  [...text.matchAll(BRACKETED)].map((match) => match[1] ?? match[2] ?? '').join(' ')

const isVetoed = (text: string, profile: PhobiaProfile): boolean =>
  profile.subtitles.excludes?.some((re) => re.test(text)) === true

/**
 * Cherche les **occurrences** : les indications sonores.
 *
 * Deux façons de reconnaître une indication exploitable, toutes deux nominales :
 * le nom du bruit (`[couinements]`) ou le nom de la bête (`[une souris]`). Les
 * formes conjuguées sont volontairement absentes des profils — `[couine avec
 * enthousiasme]` décrit une personne, pas un rongeur, et c'est exactement le faux
 * positif qu'on a observé.
 */
const occurrenceIn = (
  cue: DetectableCue,
  profile: PhobiaProfile,
  cueIndex: number,
): DetectedScene | undefined => {
  const bracketed = bracketedText(cue.text)
  if (bracketed === '' || isVetoed(bracketed, profile)) return undefined

  const matches =
    profile.subtitles.soundCues.some((re) => re.test(bracketed)) ||
    profile.subtitles.keywords.some((re) => re.test(bracketed))
  if (!matches) return undefined

  return {
    phobia: profile.id,
    start: cue.start,
    end: cue.end,
    confidence: SOUND_CUE_CONFIDENCE,
    evidence: 'sound-cue',
    cues: [cueIndex],
  }
}

const resolve = (phobiaIds: readonly string[]): PhobiaProfile[] =>
  phobiaIds
    .map((id) => findPhobia(id))
    .filter((profile): profile is PhobiaProfile => profile !== undefined)

/**
 * Scènes phobogènes attestées par une indication sonore.
 *
 * Renvoie peu de choses, et c'est voulu : un fichier de sous-titres ne dit
 * presque jamais quand une bête est à l'écran. Le reste viendra des signalements
 * de la foule (§7.6), puis de la détection audio et vidéo.
 */
export const detectFromSubtitles = (
  cues: readonly DetectableCue[],
  phobiaIds: readonly string[],
  options: DetectOptions = {},
): DetectedScene[] => {
  const margin = options.margin ?? DEFAULTS.margin
  const mergeWithin = options.mergeWithin ?? DEFAULTS.mergeWithin

  const profiles = resolve(phobiaIds)
  if (profiles.length === 0) return []

  const found: DetectedScene[] = []
  cues.forEach((cue, cueIndex) => {
    for (const profile of profiles) {
      const scene = occurrenceIn(cue, profile, cueIndex)
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
        ...last,
        end: Math.max(last.end, widened.end),
        // Deux indices indépendants valent mieux qu'un : la confiance monte, sans
        // jamais atteindre 1 — seule la foule peut confirmer.
        confidence: Math.min(0.95, last.confidence + widened.confidence * 0.3),
        cues: [...last.cues, ...widened.cues],
      }
      continue
    }
    merged.push(widened)
  }

  return merged
}

/**
 * Phobies simplement **évoquées** par le dialogue.
 *
 * Aucune protection n'en découle. C'est l'indicateur de titre : il alimente les
 * fiches SEO (« ce film évoque les rats ») et dit au batch quels titres méritent
 * d'être soumis à la foule en priorité.
 */
export const mentionsInSubtitles = (
  cues: readonly DetectableCue[],
  phobiaIds: readonly string[],
): PhobiaMention[] => {
  const profiles = resolve(phobiaIds)
  if (profiles.length === 0) return []

  const byPhobia = new Map<PhobiaId, number[]>()

  cues.forEach((cue, cueIndex) => {
    for (const profile of profiles) {
      if (isVetoed(cue.text, profile)) continue
      if (!profile.subtitles.keywords.some((re) => re.test(cue.text))) continue
      const existing = byPhobia.get(profile.id)
      if (existing === undefined) byPhobia.set(profile.id, [cueIndex])
      else existing.push(cueIndex)
    }
  })

  return [...byPhobia.entries()]
    .map(([phobia, indices]) => ({ phobia, count: indices.length, cues: indices }))
    .sort((a, b) => b.count - a.count)
}
