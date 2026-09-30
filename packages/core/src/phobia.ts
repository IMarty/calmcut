import type { PhobiaId } from './ids.js'

/** Action appliquée par défaut pendant un segment de cette phobie. */
export type ProtectionAction = 'white-noise' | 'blur' | 'blackout' | 'mute'

/** Locales supportées par le site et les clients. */
export type Locale = 'fr' | 'en'

/**
 * Indices tirés des sous-titres (batch T1, §7.2).
 *
 * La distinction entre les deux premières listes est la leçon la plus coûteuse du
 * projet : un dialogue qui **parle** d'un rat n'indique presque jamais qu'un rat
 * soit à l'écran. Voir `docs/adr/0007`.
 */
export interface SubtitleHeuristics {
  /**
   * Mots-clés dans le dialogue → **mention** au niveau du titre.
   *
   * Ne produit aucune protection horodatée. Alimente les fiches SEO et la
   * priorisation du batch.
   */
  readonly keywords: readonly RegExp[]
  /**
   * Indications sonores SDH → **occurrence** horodatée.
   *
   * **Formes nominales seulement** : `couinements`, `squeaking`. Les formes
   * conjuguées décrivent souvent une personne — `[couine avec enthousiasme]` est
   * un humain, pas un rongeur — et produisent des faux positifs.
   */
  readonly soundCues: readonly RegExp[]
  /**
   * Motifs qui **annulent** une correspondance.
   *
   * Indispensable pour les homographes : en français, « souris » est aussi une
   * forme du verbe *sourire*. « Pourquoi tu souris ? » ne parle pas de rongeurs.
   */
  readonly excludes?: readonly RegExp[]
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
