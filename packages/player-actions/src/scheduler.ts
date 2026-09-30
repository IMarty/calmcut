import { isActiveStatus, type PhobiaId, type Segment } from '@calmcut/core'

/**
 * Décide, à chaque instant du film, ce que le client doit faire.
 *
 * Volontairement **pur** : pas d'audio, pas de DOM, pas d'horloge interne. On lui
 * donne une position et il répond. C'est ce qui permet de tester le comportement
 * qui compte vraiment — l'alerte tombe-t-elle avant la scène ? — sans navigateur.
 */

/** Ce que le client doit faire à l'instant demandé. */
export type Protection =
  | { readonly kind: 'idle' }
  /** Une scène approche : compte à rebours. `remaining` décroît vers 0. */
  | {
      readonly kind: 'warning'
      readonly segment: ActiveSegment
      readonly remaining: number
    }
  /** On est dans la scène : protection active. */
  | {
      readonly kind: 'protecting'
      readonly segment: ActiveSegment
      /** Secondes restantes avant la fin de la protection. */
      readonly remaining: number
    }

/** Un segment retenu pour ce spectateur, marges de sécurité appliquées. */
export interface ActiveSegment {
  readonly id: string
  readonly phobia: PhobiaId
  /** Début protégé, marge avant comprise. */
  readonly start: number
  /** Fin protégée, marge après comprise. */
  readonly end: number
}

export interface SchedulerOptions {
  /** Durée du compte à rebours, en secondes. Défaut : 5 (§7.4). */
  readonly warningLead?: number
  /** Marge ajoutée avant chaque segment, en secondes. Défaut : 2. */
  readonly marginBefore?: number
  /** Marge ajoutée après chaque segment, en secondes. Défaut : 2. */
  readonly marginAfter?: number
}

const DEFAULTS = { warningLead: 5, marginBefore: 2, marginAfter: 2 }

/**
 * Prépare les segments d'un titre pour un spectateur donné.
 *
 * Trois opérations, dans cet ordre : filtrer sur les phobies choisies, appliquer
 * les marges, puis **fusionner les segments qui se chevauchent**. Sans la fusion,
 * deux scènes proches produiraient deux comptes à rebours dont le second tomberait
 * pendant la première protection — l'utilisateur entendrait « 🐀 dans 5 » alors que
 * le bruit blanc tourne déjà.
 */
export const prepareSegments = (
  segments: readonly Segment[],
  phobias: readonly string[],
  options: SchedulerOptions = {},
): ActiveSegment[] => {
  const before = options.marginBefore ?? DEFAULTS.marginBefore
  const after = options.marginAfter ?? DEFAULTS.marginAfter
  const wanted = new Set(phobias)

  const widened = segments
    .filter((s) => wanted.has(s.phobia) && isActiveStatus(s.status))
    .map((s) => ({
      id: s.id,
      phobia: s.phobia,
      start: Math.max(0, s.start - before),
      end: s.end + after,
    }))
    .sort((a, b) => a.start - b.start)

  const merged: ActiveSegment[] = []
  for (const segment of widened) {
    const last = merged[merged.length - 1]
    if (last !== undefined && segment.start <= last.end) {
      merged[merged.length - 1] = {
        // On garde l'identité et la phobie du premier : c'est celle qui sera
        // annoncée, et c'est celle dont la protection a commencé.
        id: last.id,
        phobia: last.phobia,
        start: last.start,
        end: Math.max(last.end, segment.end),
      }
      continue
    }
    merged.push(segment)
  }

  return merged
}

/**
 * Consulte la liste préparée en **O(log n)**.
 *
 * L'extension appelle cette fonction sur chaque image de la vidéo : un parcours
 * linéaire des segments y serait un travail inutile sur le thread principal
 * pendant la lecture.
 */
export const protectionAt = (
  segments: readonly ActiveSegment[],
  mediaTime: number,
  options: SchedulerOptions = {},
): Protection => {
  const lead = options.warningLead ?? DEFAULTS.warningLead

  // Premier segment dont la fin est strictement après l'instant demandé.
  let lo = 0
  let hi = segments.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((segments[mid] as ActiveSegment).end <= mediaTime) lo = mid + 1
    else hi = mid
  }

  const segment = segments[lo]
  if (segment === undefined) return { kind: 'idle' }

  if (mediaTime >= segment.start) {
    return { kind: 'protecting', segment, remaining: segment.end - mediaTime }
  }

  const untilStart = segment.start - mediaTime
  if (untilStart <= lead) {
    return { kind: 'warning', segment, remaining: untilStart }
  }

  return { kind: 'idle' }
}

/** Instant du prochain changement d'état, ou `undefined` s'il n'y en a plus. */
export const nextTransitionAfter = (
  segments: readonly ActiveSegment[],
  mediaTime: number,
  options: SchedulerOptions = {},
): number | undefined => {
  const lead = options.warningLead ?? DEFAULTS.warningLead
  for (const segment of segments) {
    for (const instant of [segment.start - lead, segment.start, segment.end]) {
      if (instant > mediaTime) return instant
    }
  }
  return undefined
}
