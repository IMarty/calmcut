import type { TrackerPhase, UnlockReason } from '@calmcut/sync'

/**
 * Contrat entre le thread principal et le Worker de synchro.
 *
 * Le Worker porte Whisper **et** l'algorithme de verrouillage : le thread
 * principal ne doit jamais avoir à attendre une transcription, il a un compte à
 * rebours à afficher à l'image près.
 */

/** Thread principal → Worker. */
export type ToWorker =
  /** Charge le modèle et l'index de synchro du titre. */
  | {
      readonly type: 'init'
      /** Index binaire CCSY. Transféré, donc plus lisible côté appelant. */
      readonly index: ArrayBuffer
      readonly titleSalt: string
      /** `webgpu` avec repli automatique sur `wasm`. */
      readonly device?: 'webgpu' | 'wasm'
    }
  /** Un bloc audio à 16 kHz, mono. `at` est l'instant local du premier échantillon. */
  | { readonly type: 'audio'; readonly pcm: Float32Array; readonly at: number }
  /** L'utilisateur signale un décalage : on repart en écoute. */
  | { readonly type: 'resync' }
  | { readonly type: 'stop' }

/** Worker → thread principal. */
export type FromWorker =
  /** Progression du téléchargement du modèle, entre 0 et 1. */
  | { readonly type: 'loading'; readonly progress: number; readonly label: string }
  /** Le modèle est prêt. `device` dit ce qui a réellement été utilisé. */
  | { readonly type: 'ready'; readonly device: 'webgpu' | 'wasm' }
  | { readonly type: 'status'; readonly status: SyncStatus }
  /** Une erreur non fatale : on continue d'écouter. */
  | { readonly type: 'warning'; readonly message: string }
  /** Une erreur fatale : le compagnon ne peut pas fonctionner. */
  | { readonly type: 'error'; readonly message: string }

/** Ce que le thread principal sait de la position du film. */
export interface SyncStatus {
  readonly phase: TrackerPhase
  /**
   * Position du film à l'instant `anchorLocal`, en secondes. Le thread principal
   * extrapole avec `rate` entre deux mises à jour, pour ne pas dépendre du Worker.
   */
  readonly anchorMedia: number | undefined
  readonly anchorLocal: number | undefined
  readonly rate: number
  readonly support: number
  readonly lastUnlockReason: UnlockReason | undefined
}

/**
 * Extrapole la position du film entre deux messages du Worker.
 *
 * C'est cette fonction qui permet au compte à rebours d'être fluide : le Worker
 * n'envoie un point d'ancrage que toutes les quelques secondes, l'interface
 * rafraîchit à 60 images par seconde.
 */
export const mediaTimeFrom = (status: SyncStatus, localTime: number): number | undefined => {
  if (status.phase !== 'locked') return undefined
  if (status.anchorMedia === undefined || status.anchorLocal === undefined) return undefined
  return status.anchorMedia + (localTime - status.anchorLocal) * status.rate
}
