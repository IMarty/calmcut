<script lang="ts">
  import { asPhobiaId, asSegmentId, type Segment } from '@calmcut/core'
  import { detectFromSubtitles, enabledPhobias } from '@calmcut/phobias'
  import {
    createAnnouncer,
    createNoiseMask,
    prepareSegments,
    ProtectionRunner,
    type ActiveSegment,
    type NoiseMask,
    type Protection,
  } from '@calmcut/player-actions'
  import { buildIndexFromCues, parseSubtitles } from '@calmcut/sync'
  import { startCapture, type MicCapture } from '../lib/capture.js'
  import {
    browserLanguage,
    guessLanguage,
    LANGUAGES,
    whisperLanguage,
    type LanguageCode,
  } from '../lib/language.js'
  import { mediaTimeFrom, type FromWorker, type SyncStatus, type ToWorker } from '../lib/protocol.js'

  /**
   * L'unique îlot interactif du compagnon.
   *
   * Il ne fait que de l'affichage et de l'orchestration. Tout ce qui coûte —
   * Whisper, le verrouillage — vit dans un Worker ; tout ce qui s'entend passe par
   * un AudioContext partagé avec la capture.
   */

  type Stage = 'setup' | 'loading' | 'listening' | 'locked' | 'error'

  let stage = $state<Stage>('setup')
  let statusMessage = $state('')
  let loadProgress = $state(0)
  let loadLabel = $state('')
  let device = $state<'webgpu' | 'wasm' | undefined>(undefined)

  let fileName = $state('')
  let cueCount = $state(0)
  let indexSize = $state(0)

  /**
   * Langue de la bande-son. Estimée depuis les sous-titres, corrigeable par
   * l'utilisateur : une détection silencieuse qui se trompe fait échouer tout le
   * verrouillage sans rien expliquer.
   */
  let language = $state<LanguageCode>(browserLanguage() ?? 'fr')
  let languageGuess = $state<{ code: LanguageCode; confidence: number } | undefined>(undefined)
  let quality = $state<'tiny' | 'base'>('tiny')

  /** Dernier compte rendu du Worker, pour le panneau de diagnostic. */
  let lastHeard = $state<
    | {
        transcript: string
        segments: number
        trigrams: number
        support: number
        bestOffset: number | undefined
      }
    | undefined
  >(undefined)
  let heardCount = $state(0)

  /**
   * Historique des offsets mesurés, pour distinguer deux causes de décalage.
   *
   * Un offset **stable** signifie que le suivi fonctionne : si la position
   * affichée ne correspond pas au minuteur du lecteur, c'est que le fichier de
   * sous-titres est décalé par rapport à cette version du film — et les
   * protections tombent quand même au bon moment, puisqu'elles viennent du même
   * fichier.
   *
   * Un offset qui **dérive** signale un vrai problème de suivi : là, les
   * protections seraient décalées elles aussi.
   */
  let offsetHistory = $state<{ at: number; offset: number }[]>([])

  const offsetDrift = $derived.by(() => {
    if (offsetHistory.length < 3) return undefined
    const first = offsetHistory[0]
    const last = offsetHistory[offsetHistory.length - 1]
    if (first === undefined || last === undefined) return undefined
    const elapsed = last.at - first.at
    if (elapsed < 30) return undefined
    return ((last.offset - first.offset) / elapsed) * 60
  })

  const offsetSpread = $derived.by(() => {
    if (offsetHistory.length < 2) return undefined
    const values = offsetHistory.map((h) => h.offset)
    return Math.max(...values) - Math.min(...values)
  })
  let scenes = $state<ActiveSegment[]>([])

  /**
   * Répliques du fichier chargé, conservées en mémoire pour l'affichage.
   *
   * Elles ne sont **ni stockées ni transmises** : elles vivent le temps de la
   * session, dans cet onglet, comme le fichier que l'utilisateur vient d'ouvrir
   * (principe 1). Rien ne va en `localStorage`, rien ne part sur le réseau.
   */
  let loadedCues = $state<{ text: string; start: number; end: number }[]>([])

  /** Pour chaque scène préparée, les répliques qui l'ont déclenchée. */
  let sceneEvidence = $state<Map<string, number[]>>(new Map())
  let chosen = $state<string[]>(enabledPhobias.map((p) => p.id))
  let volume = $state(0.6)

  let mediaTime = $state<number | undefined>(undefined)
  let protection = $state<Protection>({ kind: 'idle' })
  let held = $state(false)
  let syncStatus = $state<SyncStatus | undefined>(undefined)

  let worker: Worker | undefined
  let capture: MicCapture | undefined
  let noise: NoiseMask | undefined
  let runner: ProtectionRunner | undefined
  let wakeLock: WakeLockSentinel | undefined
  let frame = 0
  let indexBuffer: ArrayBuffer | undefined
  let titleSalt = ''

  const PHOBIA_EMOJI = new Map(enabledPhobias.map((p) => [p.id, p.emoji]))

  /**
   * Prochaine scène après la position courante.
   *
   * Affichée pour que l'utilisateur sache ce qui l'attend — et, pendant un test,
   * pour pouvoir avancer juste avant une scène plutôt que d'attendre.
   */
  const upcoming = $derived.by(() => {
    const now = mediaTime
    return now === undefined ? undefined : scenes.find((scene) => scene.end > now)
  })

  /** « 4 min 20 » plutôt que « 260 s » : c'est un délai, pas une mesure. */
  const formatDelay = (seconds: number): string => {
    const total = Math.max(0, Math.round(seconds))
    if (total < 60) return `${total} s`
    const m = Math.floor(total / 60)
    const s = total % 60
    return s === 0 ? `${m} min` : `${m} min ${String(s).padStart(2, '0')}`
  }

  const formatTime = (seconds: number | undefined): string => {
    if (seconds === undefined || !Number.isFinite(seconds)) return '--:--:--'
    const total = Math.max(0, Math.floor(seconds))
    const h = String(Math.floor(total / 3600)).padStart(2, '0')
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
    const s = String(total % 60).padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  /** Charge un `.srt` ou `.vtt` local : on en tire l'index de synchro et les scènes. */
  async function loadSubtitles(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file === undefined) return

    const text = await file.text()
    const cues = parseSubtitles(text)
    if (cues.length === 0) {
      statusMessage = "Ce fichier ne contient aucun sous-titre lisible."
      return
    }

    fileName = file.name
    cueCount = cues.length
    loadedCues = cues
    // Le sel dérive du nom du fichier : en mode démo il n'y a pas de titleId, et
    // deux films différents ne doivent pas partager d'espace de hachage.
    titleSalt = `demo:${file.name}:${cues.length}`
    indexBuffer = buildIndexFromCues(cues, titleSalt)
    indexSize = (indexBuffer.byteLength - 16) / 8

    // Les sous-titres sont la meilleure source pour deviner la langue : c'est
    // exactement le texte qu'on va chercher à retrouver dans l'audio.
    const guess = guessLanguage(cues.map((c) => c.text).join(' '))
    languageGuess = guess
    if (guess.confidence > 0.25) language = guess.code

    statusMessage = ''
    recomputeScenes(cues)
  }

  function recomputeScenes(cues: ReturnType<typeof parseSubtitles>) {
    const detected = detectFromSubtitles(cues, chosen)
    const asSegments: Segment[] = detected.map((scene, i) => ({
      id: asSegmentId(`demo-${i}`),
      phobia: asPhobiaId(scene.phobia),
      start: scene.start,
      end: scene.end,
      modality: 'subs',
      status: 'confirmed',
      score: scene.confidence,
    }))
    // Les marges ont déjà été appliquées par la détection.
    const prepared = prepareSegments(asSegments, chosen, { marginBefore: 0, marginAfter: 0 })

    // `prepareSegments` fusionne les segments qui se chevauchent et ne garde
    // qu'un identifiant : on reconstitue les répliques par intersection de plages
    // plutôt que de dépendre de sa politique de fusion.
    const evidence = new Map<string, number[]>()
    for (const segment of prepared) {
      const indices = detected
        .filter((scene) => scene.start < segment.end && scene.end > segment.start)
        .flatMap((scene) => [...scene.cues])
      evidence.set(segment.id, [...new Set(indices)].sort((a, b) => a - b))
    }

    scenes = prepared
    sceneEvidence = evidence
    runner?.setSegments(scenes)
  }

  async function start() {
    if (indexBuffer === undefined) {
      statusMessage = "Charge d'abord un fichier de sous-titres."
      return
    }

    stage = 'loading'
    statusMessage = ''

    try {
      capture = await startCapture({
        onAudio: (pcm, at) => {
          worker?.postMessage({ type: 'audio', pcm, at } satisfies ToWorker, [pcm.buffer])
        },
        onError: (error) => {
          statusMessage = `Problème de capture audio : ${String(error)}`
        },
      })
    } catch (error) {
      stage = 'error'
      statusMessage =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? "L'accès au micro a été refusé. Le compagnon a besoin d'entendre le film pour se synchroniser — l'audio ne quitte jamais cet appareil."
          : `Impossible d'accéder au micro : ${String(error)}`
      return
    }

    noise = createNoiseMask(capture.context, { volume })
    const announcer = createAnnouncer()
    runner = new ProtectionRunner(scenes, {
      noise,
      announcer,
      vibrate: (pattern) => navigator.vibrate?.([...pattern]),
      onChange: (next) => {
        protection = next
        // Pendant la protection, le bruit blanc sort par le haut-parleur et
        // reviendrait dans le micro : on cesse d'envoyer de l'audio au suivi.
        capture?.setMuted(next.kind === 'protecting')
      },
    })

    worker = new Worker(new URL('../workers/sync.worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', (event: MessageEvent<FromWorker>) => onWorkerMessage(event.data))

    // L'index est transféré : le Worker en devient propriétaire.
    const transferred = indexBuffer
    indexBuffer = undefined
    worker.postMessage(
      {
        type: 'init',
        index: transferred,
        titleSalt,
        language: whisperLanguage(language),
        model: `onnx-community/whisper-${quality}`,
      } satisfies ToWorker,
      [transferred],
    )

    await requestWakeLock()
    tick()
  }

  function onWorkerMessage(message: FromWorker) {
    switch (message.type) {
      case 'loading':
        loadProgress = message.progress
        loadLabel = message.label
        return
      case 'ready':
        device = message.device
        stage = 'listening'
        return
      case 'status':
        syncStatus = message.status
        stage = message.status.phase === 'locked' ? 'locked' : 'listening'
        return
      case 'heard':
        heardCount += 1
        if (message.bestOffset !== undefined && message.support >= 3) {
          const at = capture?.now() ?? 0
          // On ne garde que douze mesures : assez pour voir une dérive, assez peu
          // pour que l'ancien ne masque pas le récent.
          offsetHistory = [...offsetHistory, { at, offset: message.bestOffset }].slice(-12)
        }
        lastHeard = {
          transcript: message.transcript,
          segments: message.segments,
          trigrams: message.trigrams,
          support: message.support,
          bestOffset: message.bestOffset,
        }
        indexSize = message.indexSize
        return
      case 'warning':
        statusMessage = message.message
        return
      case 'error':
        stage = 'error'
        statusMessage = message.message
        return
    }
  }

  /**
   * Boucle d'affichage.
   *
   * Elle tourne à la fréquence de l'écran parce que la protection doit être
   * décidée sans latence, mais elle n'écrit dans l'état réactif que lorsque ce
   * qui est *affiché* change : rien ne sert de réordonner le DOM soixante fois
   * par seconde pour un chiffre qui change une fois par seconde.
   */
  let shownSecond = -1
  let shownRemaining = -1

  function tick() {
    frame = requestAnimationFrame(tick)
    if (capture === undefined || runner === undefined) return

    const now = capture.now()
    const position = syncStatus === undefined ? undefined : mediaTimeFrom(syncStatus, now)
    const next = runner.update(position)

    const second = position === undefined ? -1 : Math.floor(position)
    if (second !== shownSecond) {
      shownSecond = second
      mediaTime = position
    }

    const remaining = next.kind === 'idle' ? -1 : Math.ceil(next.remaining)
    if (next.kind !== protection.kind || remaining !== shownRemaining || held !== runner.isHolding) {
      shownRemaining = remaining
      protection = next
      held = runner.isHolding
    }
  }

  async function requestWakeLock() {
    try {
      wakeLock = await navigator.wakeLock?.request('screen')
    } catch {
      // Refusé ou non pris en charge : l'écran s'éteindra, la protection continue.
    }
  }

  function resync() {
    worker?.postMessage({ type: 'resync' } satisfies ToWorker)
    runner?.release()
  }

  function falseAlarm() {
    runner?.release()
  }

  async function stop() {
    cancelAnimationFrame(frame)
    worker?.postMessage({ type: 'stop' } satisfies ToWorker)
    worker?.terminate()
    worker = undefined
    runner?.dispose()
    noise?.dispose()
    await capture?.stop()
    capture = undefined
    void wakeLock?.release()
    wakeLock = undefined
    syncStatus = undefined
    mediaTime = undefined
    protection = { kind: 'idle' }
    lastHeard = undefined
    heardCount = 0
    offsetHistory = []
    stage = 'setup'
  }

  $effect(() => {
    noise?.setVolume(volume)
  })

  $effect(() => () => void stop())
</script>

<section class="companion" aria-live="polite">
  {#if stage === 'setup'}
    <h2>Mode démo</h2>
    <p class="lede">
      Charge le fichier de sous-titres du film que tu vas regarder. CalmCut y repère les scènes,
      écoute le film au micro pour se synchroniser, et te prévient avant chaque scène.
    </p>
    <p class="privacy">
      L'audio du micro <strong>ne quitte jamais cet appareil</strong>. Aucun compte, aucun envoi.
    </p>

    <label class="field">
      <span>Sous-titres du film (.srt ou .vtt)</span>
      <input type="file" accept=".srt,.vtt,text/vtt,text/plain" onchange={loadSubtitles} />
    </label>

    {#if fileName !== ''}
      <p class="found">
        <strong>{fileName}</strong> — {cueCount} répliques, <strong>{scenes.length}</strong>
        {scenes.length === 1 ? 'scène repérée' : 'scènes repérées'}
      </p>

      <label class="field">
        <span>Langue parlée dans le film</span>
        <select bind:value={language}>
          {#each LANGUAGES as option (option.code)}
            <option value={option.code}>{option.label}</option>
          {/each}
        </select>
        <small class="hint">
          {#if languageGuess !== undefined && languageGuess.confidence > 0.25}
            Déduite des sous-titres. <strong>Corrige-la si elle est fausse</strong> : une mauvaise
            langue empêche toute synchronisation.
          {:else}
            Impossible de la déduire des sous-titres — vérifie-la.
          {/if}
        </small>
      </label>

      {#if scenes.length > 0}
        <details class="scenes" open>
          <summary>{scenes.length} {scenes.length === 1 ? 'scène repérée' : 'scènes repérées'}</summary>
          <!--
            Ces horaires sont calculés dans ce navigateur à partir du fichier de
            l'utilisateur. Rien ne vient de la base de CalmCut, donc rien à
            protéger ici — contrairement aux fiches film publiques du site, qui
            n'affichent jamais de timestamp précis.
          -->
          <ol>
            {#each scenes as scene (scene.id)}
              <li>
                <div class="head">
                  <span class="emoji">{PHOBIA_EMOJI.get(scene.phobia) ?? '⚠️'}</span>
                  <span class="range">{formatTime(scene.start)} → {formatTime(scene.end)}</span>
                  <span class="hint">{formatDelay(scene.end - scene.start)}</span>
                </div>
                <!--
                  Les répliques qui ont déclenché la détection, pour vérifier la
                  correspondance avec le film. Elles viennent du fichier de
                  l'utilisateur et restent dans cet onglet : rien n'est stocké,
                  rien n'est transmis (principe 1).
                -->
                <ul class="evidence">
                  {#each sceneEvidence.get(scene.id) ?? [] as index (index)}
                    {@const cue = loadedCues[index]}
                    {#if cue !== undefined}
                      <li>
                        <span class="cue-time">{formatTime(cue.start)}</span>
                        <span class="cue-text">{cue.text}</span>
                      </li>
                    {/if}
                  {/each}
                </ul>
              </li>
            {/each}
          </ol>
          <p class="hint">
            Horaires marges comprises. Sous chaque scène, <strong>les répliques du fichier qui
            l'ont déclenchée</strong> — de quoi vérifier que le sous-titre correspond bien à ce
            qu'on voit à l'écran. Pour tester vite, avance le film juste avant l'une d'elles.
          </p>
        </details>
      {:else}
        <p class="hint">
          Aucune scène repérée dans ces sous-titres pour les phobies cochées. La synchronisation
          se testera quand même, mais aucune protection ne se déclenchera.
        </p>
      {/if}

      <fieldset class="field">
        <legend>Qualité de la reconnaissance vocale</legend>
        <label class="check">
          <input type="radio" value="tiny" bind:group={quality} />
          <span>Rapide — 39 Mo à télécharger</span>
        </label>
        <label class="check">
          <input type="radio" value="base" bind:group={quality} />
          <span>Précise — 145 Mo, plus fiable hors anglais</span>
        </label>
      </fieldset>
    {/if}

    <fieldset class="field">
      <legend>Ce dont tu veux être protégé</legend>
      {#each enabledPhobias as phobia (phobia.id)}
        <label class="check">
          <input type="checkbox" value={phobia.id} bind:group={chosen} />
          <span>{phobia.emoji} {phobia.labels.fr}</span>
        </label>
      {/each}
    </fieldset>

    <p class="hint">Un casque est recommandé : le bruit blanc masque mieux, et le micro entend mieux.</p>

    <button class="primary" onclick={start} disabled={fileName === '' || chosen.length === 0}>
      Commencer à écouter
    </button>
  {:else if stage === 'loading'}
    <h2>Préparation</h2>
    <p>Téléchargement du modèle de reconnaissance vocale, une seule fois.</p>
    <progress value={loadProgress} max="1"></progress>
    <p class="hint">{Math.round(loadProgress * 100)} % — {loadLabel}</p>
  {:else if stage === 'error'}
    <h2>Ça n'a pas fonctionné</h2>
    <p class="error">{statusMessage}</p>
    <button onclick={stop}>Recommencer</button>
  {:else}
    <div class="status" class:locked={stage === 'locked'}>
      {#if stage === 'locked'}
        <p class="position">{formatTime(mediaTime)}</p>
        <p class="hint">
          Synchronisé{#if held} — position maintenue{/if}
          <br />
          Position dans la timeline des <strong>sous-titres</strong>. Elle peut différer du
          minuteur de ton lecteur si le fichier ne correspond pas exactement à cette version du
          film — sans que cela décale les protections.
        </p>
      {:else}
        <p class="position">À l'écoute…</p>
        <p class="hint">Laisse le film parler quelques secondes.</p>
      {/if}
    </div>

    {#if stage === 'locked' && protection.kind === 'idle'}
      <p class="next">
        {#if upcoming !== undefined && mediaTime !== undefined}
          Prochaine scène : <strong>{PHOBIA_EMOJI.get(upcoming.phobia) ?? '⚠️'}
          {formatTime(upcoming.start)}</strong> — dans {formatDelay(upcoming.start - mediaTime)}
        {:else}
          Plus aucune scène après cette position.
        {/if}
      </p>
    {/if}

    {#if protection.kind === 'warning'}
      <div class="alert warning" role="alert">
        <p class="countdown">{Math.max(1, Math.ceil(protection.remaining))}</p>
        <p>{PHOBIA_EMOJI.get(protection.segment.phobia) ?? '⚠️'} Détourne les yeux</p>
      </div>
    {:else if protection.kind === 'protecting'}
      <div class="alert protecting" role="alert">
        <p class="countdown">{PHOBIA_EMOJI.get(protection.segment.phobia) ?? '⚠️'}</p>
        <p>Protection active — encore {Math.max(0, Math.ceil(protection.remaining))} s</p>
        <button onclick={falseAlarm}>✋ Fausse alerte</button>
      </div>
    {/if}

    <label class="field">
      <span>Volume du bruit blanc</span>
      <input type="range" min="0" max="1" step="0.05" bind:value={volume} />
    </label>

    <p class="meta">
      {scenes.length} scènes • {device === 'webgpu' ? 'WebGPU' : 'WASM'}
      {#if syncStatus !== undefined && syncStatus.rate !== 1}
        • vitesse {syncStatus.rate.toFixed(3)}×
      {/if}
    </p>

    {#if statusMessage !== ''}<p class="hint">{statusMessage}</p>{/if}

    <details class="diag" open={stage === 'listening' && heardCount > 0}>
      <summary>Diagnostic</summary>
      {#if lastHeard === undefined}
        <p class="hint">
          Aucun relevé encore. Le premier arrive après 8 secondes d'audio.
        </p>
      {:else}
        <dl>
          <dt>Relevés effectués</dt>
          <dd>{heardCount}</dd>
          <dt>Répliques entendues au dernier relevé</dt>
          <dd>{lastHeard.segments}</dd>
          <dt>Trigrammes extraits</dt>
          <dd>{lastHeard.trigrams}</dd>
          <dt>Trigrammes concordants</dt>
          <dd>
            {lastHeard.support} <span class="hint">(il en faut 3 pour verrouiller)</span>
          </dd>
          <dt>Index du titre</dt>
          <dd>{indexSize} trigrammes</dd>
          {#if lastHeard.bestOffset !== undefined}
            <dt>Décalage mesuré</dt>
            <dd>{lastHeard.bestOffset > 0 ? '+' : ''}{lastHeard.bestOffset.toFixed(1)} s</dd>
          {/if}
          <dt>Vitesse de lecture mesurée</dt>
          <dd>{(syncStatus?.rate ?? 1).toFixed(4)}×</dd>
        </dl>

        {#if offsetDrift !== undefined}
          <p class="verdict" class:bad={Math.abs(offsetDrift) > 0.5}>
            {#if Math.abs(offsetDrift) > 0.5}
              ⚠️ <strong>Le décalage dérive de {offsetDrift > 0 ? '+' : ''}{offsetDrift.toFixed(1)}
              s par minute.</strong> C'est un vrai problème de suivi : les protections seront
              décalées elles aussi. Dis-le-moi avec ce chiffre.
            {:else}
              ✓ <strong>Le décalage est stable</strong>
              {#if offsetSpread !== undefined}(±{offsetSpread.toFixed(1)} s sur {offsetHistory.length}
                mesures){/if}. Le suivi fonctionne. Si la position affichée ne correspond pas au
              minuteur de ton lecteur, c'est que le fichier de sous-titres est décalé par rapport à
              cette version du film — <strong>les protections tombent quand même au bon
              moment</strong>, puisqu'elles viennent du même fichier.
            {/if}
          </p>
        {/if}
        <p class="transcript">
          <span class="hint">Dernière transcription — reste sur cet appareil :</span><br />
          {lastHeard.transcript === '' ? '(rien entendu)' : lastHeard.transcript}
        </p>
        {#if lastHeard.trigrams === 0}
          <p class="hint">
            Rien d'exploitable entendu. Monte le son du film, rapproche l'appareil, ou attends un
            passage avec du dialogue.
          </p>
        {:else if lastHeard.support === 0}
          <p class="hint">
            La transcription ne correspond à aucune réplique connue. Vérifie que la
            <strong>langue</strong> est la bonne, et que le fichier de sous-titres correspond bien
            à cette version du film.
          </p>
        {:else if lastHeard.support < 3}
          <p class="hint">
            Ça concorde un peu mais pas assez. Essaie la qualité « Précise », ou un passage plus
            bavard.
          </p>
        {/if}
      {/if}
    </details>

    <div class="actions">
      <button onclick={resync}>Se resynchroniser</button>
      <button onclick={stop}>Arrêter</button>
    </div>
  {/if}
</section>

<style>
  .companion {
    display: grid;
    gap: 1.25rem;
    max-width: 34rem;
    margin-inline: auto;
  }

  h2 {
    margin: 0;
    font-size: 1.5rem;
  }

  .lede {
    margin: 0;
    line-height: 1.6;
  }

  .privacy,
  .hint,
  .meta {
    margin: 0;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .found {
    margin: 0;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: var(--surface);
  }

  .error {
    margin: 0;
    line-height: 1.6;
    color: var(--danger);
  }

  .field {
    display: grid;
    gap: 0.5rem;
  }

  fieldset.field {
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1rem;
  }

  legend {
    padding-inline: 0.5rem;
    font-size: 0.875rem;
  }

  .check {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  button {
    padding: 0.75rem 1rem;
    font: inherit;
    color: var(--fg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .primary {
    color: var(--on-accent);
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
  }

  .status {
    padding: 1.5rem;
    text-align: center;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
  }

  .status.locked {
    border-color: var(--accent);
  }

  .position {
    margin: 0 0 0.25rem;
    font-size: 2rem;
    font-variant-numeric: tabular-nums;
  }

  .alert {
    padding: 1.5rem;
    text-align: center;
    border-radius: 0.75rem;
  }

  .alert p {
    margin: 0 0 0.5rem;
  }

  .countdown {
    font-size: 3.5rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .warning {
    background: var(--warn-bg);
    color: var(--warn-fg);
  }

  .protecting {
    background: var(--protect-bg);
    color: var(--protect-fg);
  }

  progress {
    width: 100%;
  }

  select {
    padding: 0.5rem;
    font: inherit;
    color: var(--fg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
  }

  .diag {
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
  }

  .diag dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.25rem 1rem;
    margin: 0.75rem 0;
  }

  .diag dt {
    color: var(--muted);
  }

  .diag dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .scenes {
    padding: 0.75rem 1rem;
    font-size: 0.9375rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
  }

  .scenes ol {
    margin: 0.75rem 0 0.5rem;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.375rem;
  }

  .scenes > ol > li {
    padding: 0.5rem 0;
    border-top: 1px solid var(--border);
  }

  .scenes > ol > li:first-child {
    border-top: none;
  }

  .head {
    display: grid;
    grid-template-columns: 1.5rem auto 1fr;
    gap: 0.5rem;
    align-items: baseline;
  }

  .evidence {
    margin: 0.375rem 0 0 2rem;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.1875rem;
    font-size: 0.875rem;
  }

  .evidence li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.5rem;
    align-items: baseline;
  }

  .cue-time {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .cue-text {
    /* Une réplique peut être longue : on la laisse respirer plutôt que la tronquer,
       c'est justement le texte qu'on veut comparer au film. */
    overflow-wrap: anywhere;
  }

  .range {
    font-variant-numeric: tabular-nums;
  }

  .emoji {
    font-size: 1.125rem;
  }

  .next {
    margin: 0;
    padding: 0.75rem 1rem;
    text-align: center;
    border-radius: 0.5rem;
    background: var(--surface);
    font-size: 0.9375rem;
  }

  .verdict {
    margin: 0.75rem 0 0;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: var(--surface);
    line-height: 1.5;
  }

  .verdict.bad {
    background: var(--warn-bg);
    color: var(--warn-fg);
  }

  .transcript {
    margin: 0.75rem 0 0;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: var(--surface);
    line-height: 1.5;
  }

  /* Pas d'animation : le compagnon s'adresse à des personnes déjà en alerte. */
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
