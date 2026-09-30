import type { PhobiaId } from './ids.js'

/** Détection brute produite par un détecteur, sur la timeline locale du média. */
export interface Detection {
  readonly phobia: PhobiaId
  readonly start: number
  readonly end: number
  /** 0→1. */
  readonly confidence: number
}

/**
 * Contrat commun à tous les détecteurs (sous-titres, audio, vidéo).
 * Les implémentations temps réel (tabCapture, WebGPU) arriveront plus tard ;
 * l'interface est figée ici pour que batch, compagnon et extension s'alignent.
 */
export interface Detector {
  readonly id: string
  readonly modality: 'subs' | 'audio' | 'video'
  /** Charge modèles et ressources. Idempotent. */
  init(phobias: readonly PhobiaId[]): Promise<void>
  /** Analyse une fenêtre de média et renvoie les détections trouvées. */
  detect(input: unknown, atTime: number): Promise<readonly Detection[]>
  /** Libère les ressources (workers, sessions ONNX…). */
  dispose(): Promise<void>
}
