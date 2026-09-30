/// <reference lib="webworker" />
import {
  estimateOffset,
  hearSegments,
  parseSyncIndex,
  SyncIndexError,
  SyncTracker,
  type SyncIndex,
} from '@calmcut/sync'
import type { FromWorker, SyncStatus, ToWorker } from '../lib/protocol.js'
import { createWhisperTranscriber, type Transcriber } from '../lib/transcriber.js'
import { AudioWindower } from '../lib/windower.js'

/**
 * Worker de synchronisation : Whisper + algorithme de verrouillage.
 *
 * Il ne touche à rien d'audible. Il reçoit de l'audio, il renvoie une position.
 * Tout ce qui s'entend — bruit blanc, voix du compte à rebours — reste sur le
 * thread principal, qui seul dispose d'un `AudioContext` utilisable pour la
 * sortie.
 *
 * Il rend compte de **chaque** relevé, même infructueux (message `heard`). Un
 * échec de verrouillage muet est indébogable : on ne sait pas si le micro
 * n'entend rien, si la transcription est mauvaise, ou si elle est bonne mais ne
 * concorde pas.
 */

const post = (message: FromWorker, transfer: Transferable[] = []): void => {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer)
}

let tracker: SyncTracker | undefined
let index: SyncIndex | undefined
let transcriber: Transcriber | undefined
let windower = new AudioWindower()
let busy = false
let stopped = false
let currentSalt = ''

/** Dernier instant local reçu, pour décider si un recalage est souhaitable. */
let latestLocalTime = 0

const toStatus = (): SyncStatus => {
  const status = tracker?.status
  if (status === undefined) {
    return {
      phase: 'listening',
      anchorMedia: undefined,
      anchorLocal: undefined,
      rate: 1,
      support: 0,
      lastUnlockReason: undefined,
    }
  }
  const anchorLocal = status.anchoredAt
  return {
    phase: status.phase,
    anchorLocal,
    anchorMedia: anchorLocal === undefined ? undefined : tracker?.mediaTimeAt(anchorLocal),
    rate: status.rate,
    support: status.support,
    lastUnlockReason: status.lastUnlockReason,
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const init = async (message: Extract<ToWorker, { type: 'init' }>): Promise<void> => {
  try {
    index = parseSyncIndex(message.index)
    tracker = new SyncTracker(index)
  } catch (error) {
    const reason =
      error instanceof SyncIndexError
        ? `index de synchro illisible (${error.code})`
        : 'index de synchro illisible'
    post({ type: 'error', message: reason })
    return
  }

  if (index.size === 0) {
    post({
      type: 'error',
      message:
        "l'index de synchro est vide : les sous-titres n'ont produit aucun trigramme exploitable",
    })
    return
  }

  transcriber = createWhisperTranscriber({
    // La langue est obligatoire : sans elle, Whisper transcrit en anglais et
    // aucun trigramme ne peut concorder avec des sous-titres d'une autre langue.
    language: message.language,
    ...(message.device !== undefined ? { device: message.device } : {}),
    ...(message.model !== undefined ? { model: message.model } : {}),
  })

  try {
    await transcriber.load((progress, label) => post({ type: 'loading', progress, label }))
  } catch (error) {
    post({
      type: 'error',
      message: `impossible de charger le modèle de transcription : ${describe(error)}`,
    })
    return
  }

  post({ type: 'ready', device: transcriber.device })
  post({ type: 'status', status: toStatus() })
}

/**
 * Consomme l'audio en attente.
 *
 * Verrouillé, on ne transcrit que lorsqu'un recalage est souhaitable : Whisper est
 * le poste de dépense principal, et le film continue d'avancer sans lui grâce à
 * l'horloge locale.
 */
const pump = async (): Promise<void> => {
  if (busy || stopped) return
  if (tracker === undefined || transcriber === undefined || index === undefined) return

  const wanted = tracker.status.phase === 'listening' || tracker.needsResync(latestLocalTime)
  if (!wanted) {
    windower.flush()
    return
  }

  const window = windower.take()
  if (window === undefined) return

  busy = true
  try {
    const heard = await transcriber.transcribe(window.pcm)
    if (stopped) return

    const segments = heard.map((segment) => ({
      text: segment.text,
      start: window.startedAt + segment.start,
    }))
    const trigrams = hearSegments(segments, currentSalt)

    // On estime l'offset ici aussi, pour pouvoir rendre compte du meilleur
    // candidat même quand il reste sous le seuil de verrouillage. Sans cette
    // information, un échec ne dit pas s'il manque un trigramme ou vingt.
    const estimate = trigrams.length === 0 ? undefined : estimateOffset(trigrams, index)

    post({
      type: 'heard',
      transcript: segments
        .map((s) => s.text.trim())
        .join(' ')
        .slice(0, 400),
      segments: segments.length,
      trigrams: trigrams.length,
      support: estimate?.support ?? 0,
      bestOffset: estimate?.offset,
      indexSize: index.size,
    })

    tracker.observe(trigrams)
    post({ type: 'status', status: toStatus() })
  } catch (error) {
    // Une fenêtre qui échoue n'est pas un motif d'abandon : la suivante arrive
    // dans quatre secondes.
    post({ type: 'warning', message: `transcription échouée : ${describe(error)}` })
  } finally {
    busy = false
  }

  // Une autre fenêtre peut déjà être prête : on enchaîne sans attendre d'audio.
  void pump()
}

self.addEventListener('message', (event: MessageEvent<ToWorker>) => {
  const message = event.data

  switch (message.type) {
    case 'init':
      currentSalt = message.titleSalt
      stopped = false
      windower = new AudioWindower()
      void init(message)
      return

    case 'audio':
      if (stopped) return
      latestLocalTime = message.at + message.pcm.length / 16_000
      windower.push(message.pcm, message.at)
      void pump()
      return

    case 'resync':
      tracker?.reset()
      windower.flush()
      post({ type: 'status', status: toStatus() })
      return

    case 'stop':
      stopped = true
      windower.flush()
      void transcriber?.dispose()
      return
  }
})
