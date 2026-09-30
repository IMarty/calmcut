import type { PhobiaId, SegmentId, TitleId } from './ids.js'
import type { TimelineFormatVersion } from './version.js'

/** Plateforme ou support sur lequel une timeline est mesurée. */
export type SourceKind = 'netflix' | 'disney' | 'prime' | 'youtube' | 'file' | 'canonical'

/** Comment un segment a été détecté. */
export type Modality = 'meta' | 'subs' | 'audio' | 'video' | 'user'

/** Qui a produit le segment. */
export type SegmentOrigin = 'batch' | 'ai-client' | 'user'

/**
 * Cycle de vie d'un segment. L'asymétrie est volontaire (principe 5) : un seul
 * signalement suffit à rendre un segment actif, le désactiver exige un consensus.
 */
export type SegmentStatus = 'pending' | 'confirmed' | 'verified' | 'disputed' | 'disabled'

/** Un segment est actif — donc appliqué par le client — dans tous les états sauf `disabled`. */
export const isActiveStatus = (status: SegmentStatus): boolean => status !== 'disabled'

/** Mapping d'une timeline de plateforme vers la timeline canonique : `canonical = local * scale + offset`. */
export interface TimelineSource {
  readonly kind: SourceKind
  readonly externalId: string
  /** Secondes. */
  readonly offset: number
  /** 1 par défaut ; 25/23.976 pour un transfert PAL, par exemple. */
  readonly scale: number
}

/** Boîte englobante normalisée (0→1), pour un futur floutage ciblé. */
export interface BoundingBox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** Un segment phobogène, exprimé en secondes sur la timeline canonique. */
export interface Segment {
  readonly id: SegmentId
  readonly phobia: PhobiaId
  readonly start: number
  readonly end: number
  readonly modality: Modality
  readonly status: SegmentStatus
  readonly score: number
  readonly origin?: SegmentOrigin
  readonly bbox?: BoundingBox
}

/** En-tête public d'un titre. `creditsStart`/`creditsEnd` ne sont jamais exposés (§6). */
export interface TitleHeader {
  readonly slug: string
  readonly name: string
  readonly year: number
  /** Durée canonique, en secondes. */
  readonly runtime: number
}

/** Pointeur vers l'index de synchro binaire du titre. */
export interface SyncPointer {
  readonly version: number
  readonly url: string
}

/** Document public servi par `GET /v1/titles/:id` (§7.1). */
export interface TitleDocument {
  readonly v: TimelineFormatVersion
  readonly title: TitleHeader
  readonly sources: readonly TimelineSource[]
  readonly segments: readonly Segment[]
  readonly sync?: SyncPointer
}

/** Convertit un temps de plateforme vers la timeline canonique. */
export const toCanonicalTime = (localTime: number, source: TimelineSource): number =>
  localTime * source.scale + source.offset

/** Convertit un temps canonique vers la timeline d'une plateforme. */
export const toSourceTime = (canonicalTime: number, source: TimelineSource): number =>
  (canonicalTime - source.offset) / source.scale

/** Traduit tous les segments d'un document vers la timeline d'une source donnée. */
export const segmentsForSource = (
  segments: readonly Segment[],
  source: TimelineSource,
): readonly Segment[] =>
  segments.map((segment) => ({
    ...segment,
    start: toSourceTime(segment.start, source),
    end: toSourceTime(segment.end, source),
  }))

export type { PhobiaId, SegmentId, TitleId }
