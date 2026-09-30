import type { HeardSegment } from '@calmcut/sync'

/**
 * Transcription de l'audio en segments horodatés.
 *
 * L'interface existe pour deux raisons : elle permet de tester la chaîne complète
 * sans télécharger un modèle de 40 Mo, et elle laisse la porte ouverte à un autre
 * moteur que Whisper sans toucher au reste.
 */
export interface Transcriber {
  /** Charge le modèle. `onProgress` reçoit une valeur entre 0 et 1. */
  load(onProgress?: (progress: number, label: string) => void): Promise<void>
  /** Quel back-end a réellement été retenu. */
  readonly device: 'webgpu' | 'wasm'
  /**
   * Transcrit une fenêtre.
   *
   * Les `start` renvoyés sont **relatifs au début de la fenêtre**, en secondes :
   * l'appelant y ajoute l'instant local de la fenêtre.
   */
  transcribe(pcm: Float32Array): Promise<HeardSegment[]>
  dispose(): Promise<void>
}

/** Un segment brut tel que Transformers.js le renvoie. */
interface WhisperChunk {
  readonly text?: unknown
  readonly timestamp?: readonly unknown[]
}

export interface WhisperOptions {
  /** Défaut : `onnx-community/whisper-tiny`. */
  readonly model?: string
  readonly device?: 'webgpu' | 'wasm'
  /** Langue attendue. `undefined` laisse Whisper décider. */
  readonly language?: string
}

/**
 * Transcripteur Whisper, via Transformers.js.
 *
 * WebGPU quand il est disponible, repli WASM sinon — un repli qui n'est pas
 * théorique : c'est le cas de Safari et de beaucoup d'Android d'entrée de gamme,
 * exactement les appareils qu'on posera sur la table du salon.
 */
export const createWhisperTranscriber = (options: WhisperOptions = {}): Transcriber => {
  const modelId = options.model ?? 'onnx-community/whisper-tiny'
  let pipe: unknown
  let device: 'webgpu' | 'wasm' = options.device ?? 'webgpu'

  const build = async (target: 'webgpu' | 'wasm', onProgress?: (p: number, l: string) => void) => {
    const { pipeline } = await import('@huggingface/transformers')
    return pipeline('automatic-speech-recognition', modelId, {
      device: target,
      dtype: target === 'webgpu' ? 'fp16' : 'q8',
      progress_callback: (event: unknown) => {
        const e = event as { status?: string; progress?: number; file?: string }
        if (e.status === 'progress' && typeof e.progress === 'number') {
          onProgress?.(Math.min(1, e.progress / 100), e.file ?? modelId)
        }
      },
    })
  }

  return {
    get device() {
      return device
    },

    async load(onProgress) {
      try {
        pipe = await build(device, onProgress)
      } catch (error) {
        if (device === 'wasm') throw error
        // Pas de WebGPU, ou un pilote qui refuse le modèle : on retombe sur WASM
        // plutôt que de priver l'utilisateur de protection.
        device = 'wasm'
        onProgress?.(0, 'repli sur WASM')
        pipe = await build('wasm', onProgress)
      }
    },

    async transcribe(pcm: Float32Array): Promise<HeardSegment[]> {
      if (pipe === undefined) throw new Error('transcripteur non chargé')

      const run = pipe as (
        audio: Float32Array,
        opts: Record<string, unknown>,
      ) => Promise<{ chunks?: readonly WhisperChunk[]; text?: unknown }>

      const result = await run(pcm, {
        return_timestamps: true,
        chunk_length_s: 0,
        ...(options.language !== undefined ? { language: options.language } : {}),
      })

      const chunks = result.chunks ?? []
      const segments: HeardSegment[] = []
      for (const chunk of chunks) {
        const text = typeof chunk.text === 'string' ? chunk.text : ''
        const start = chunk.timestamp?.[0]
        if (text.trim() === '' || typeof start !== 'number') continue
        segments.push({ text, start })
      }

      // Certains modèles ne renvoient pas de découpage : mieux vaut un segment
      // unique daté au début de la fenêtre que rien du tout.
      if (segments.length === 0 && typeof result.text === 'string' && result.text.trim() !== '') {
        segments.push({ text: result.text, start: 0 })
      }

      return segments
    },

    async dispose() {
      const disposable = pipe as { dispose?: () => Promise<void> } | undefined
      await disposable?.dispose?.()
      pipe = undefined
    },
  }
}
