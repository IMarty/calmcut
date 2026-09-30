import { SAMPLE_RATE } from './windower.js'

/**
 * Capture du micro et sortie audio, sur un seul `AudioContext`.
 *
 * **Le contexte tourne à 16 kHz**, la fréquence que Whisper exige. Le navigateur
 * ré-échantillonne alors le micro lui-même, dans du code natif, et il n'y a plus
 * de conversion à écrire ni à exécuter en JavaScript. Le bruit blanc en souffre
 * peu : un bruit limité à 8 kHz masque très bien une bande-son, et il est même
 * moins agressif qu'un bruit pleine bande.
 */

export interface CaptureHandlers {
  /** Un paquet d'audio. `at` est l'instant local de son premier échantillon. */
  readonly onAudio: (pcm: Float32Array, at: number) => void
  readonly onError?: (error: unknown) => void
}

export interface MicCapture {
  /** Contexte partagé avec le bruit blanc et le compte à rebours. */
  readonly context: AudioContext
  /** Horloge locale de référence, en secondes. */
  now(): number
  /**
   * Suspend l'envoi de paquets sans couper le micro.
   *
   * Utilisé pendant la protection : le bruit blanc sort par le haut-parleur et
   * reviendrait dans le micro. On ne transcrit de toute façon pas pendant une
   * scène, alors autant ne pas polluer le suivi.
   */
  setMuted(muted: boolean): void
  stop(): Promise<void>
}

const CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  // Trois réglages contre-intuitifs mais délibérés : on écoute une télévision à
  // l'autre bout de la pièce, pas une personne qui parle dans le téléphone.
  // La réduction de bruit prendrait les dialogues lointains pour du bruit, et
  // l'annulation d'écho les traiterait comme un retour à supprimer.
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: true,
}

/**
 * Demande le micro et démarre la capture.
 *
 * L'audio ne quitte jamais l'appareil (principe 4) : il va du micro à l'AudioWorklet,
 * puis au Worker de transcription, et nulle part ailleurs.
 */
export const startCapture = async (handlers: CaptureHandlers): Promise<MicCapture> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: CONSTRAINTS, video: false })

  const context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'playback' })
  // Sur mobile, le contexte démarre suspendu jusqu'à une interaction.
  if (context.state === 'suspended') await context.resume()

  await context.audioWorklet.addModule('/capture-processor.js')

  const source = context.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(context, 'capture-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
  })

  node.port.onmessage = (event: MessageEvent<{ pcm: Float32Array; at: number }>) => {
    handlers.onAudio(event.data.pcm, event.data.at)
  }
  node.onprocessorerror = (event) => handlers.onError?.(event)

  source.connect(node)

  let stopped = false

  return {
    context,
    now: () => context.currentTime,
    setMuted(muted: boolean) {
      if (stopped) return
      node.port.postMessage({ type: 'mute', value: muted })
    },
    async stop() {
      if (stopped) return
      stopped = true
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      for (const track of stream.getTracks()) track.stop()
      await context.close()
    },
  }
}
