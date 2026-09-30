import type { PhobiaId } from './ids.js'

/** Action appliquée par défaut pendant un segment de cette phobie. */
export type ProtectionAction = 'white-noise' | 'blur' | 'blackout' | 'mute'

/** Locales supportées par le site et les clients. */
export type Locale = 'fr' | 'en'

/** Indices tirés des sous-titres SDH (batch T1, §7.2). */
export interface SubtitleHeuristics {
  /** Mots-clés dans le dialogue. */
  readonly keywords: readonly RegExp[]
  /** Indications sonores entre crochets, p. ex. `[rats squeaking]`. */
  readonly soundCues: readonly RegExp[]
}

/** Classes AudioSet visées par la future détection audio côté client. */
export interface AudioHeuristics {
  readonly audioSetClasses: readonly string[]
}

/** Invites pour la future détection visuelle (YOLO-World). */
export interface VisualHeuristics {
  readonly prompts: readonly string[]
}

/**
 * Profil déclaratif d'une phobie. Tout est donnée, jamais de code par phobie,
 * pour qu'ajouter une phobie reste une contribution de configuration.
 */
export interface PhobiaProfile {
  readonly id: PhobiaId
  readonly emoji: string
  readonly labels: Readonly<Record<Locale, string>>
  /** Une phobie désactivée existe dans le catalogue mais n'est pas proposée aux utilisateurs. */
  readonly enabled: boolean
  readonly subtitles: SubtitleHeuristics
  readonly audio?: AudioHeuristics
  readonly visual?: VisualHeuristics
  readonly defaultAction: ProtectionAction
  /** Marge de sécurité ajoutée avant le segment détecté, en secondes. */
  readonly marginBefore: number
  /** Marge de sécurité ajoutée après le segment détecté, en secondes. */
  readonly marginAfter: number
}
