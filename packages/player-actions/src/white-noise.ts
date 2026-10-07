/**
 * Bruit blanc Web Audio, avec fondus.
 *
 * Le bruit blanc masque la bande-son pendant la scène. Les fondus de 300 ms
 * comptent autant que le son lui-même : un démarrage sec est une agression
 * sensorielle de plus pour quelqu'un qui est déjà en alerte.
 */

/** Durée des fondus, en secondes (§7.4). */
export const FADE_SECONDS = 0.3

/** Le minimum dont l'exécuteur de protection a besoin. */
export interface NoiseControl {
  /** Monte le bruit blanc en `FADE_SECONDS`. Idempotent. */
  start(): void
  /** Redescend en `FADE_SECONDS`. Idempotent. */
  stop(): void
}

/** Un générateur de bruit blanc que l'on peut arrêter et relancer. */
export interface NoiseMask extends NoiseControl {
  /** Volume cible, entre 0 et 1. Prend effet immédiatement, en douceur. */
  setVolume(volume: number): void
  /** Libère les ressources audio. */
  dispose(): void
}

export interface NoiseMaskOptions {
  /** Volume initial, entre 0 et 1. Défaut : 0,6. */
  readonly volume?: number
  /** Durée du tampon de bruit, en secondes. Défaut : 2. */
  readonly bufferSeconds?: number
}

/**
 * Crée un masque de bruit blanc sur un `AudioContext` existant.
 *
 * Le bruit est généré **une fois** dans un tampon rebouclé, plutôt que calculé en
 * continu par un `ScriptProcessor` : la lecture d'un tampon en boucle est gérée
 * par le thread audio du navigateur et ne coûte rien au thread principal, qui a
 * mieux à faire pendant un film.
 */
export const createNoiseMask = (
  context: AudioContext,
  options: NoiseMaskOptions = {},
): NoiseMask => {
  const targetVolume = options.volume ?? 0.6
  const seconds = options.bufferSeconds ?? 2

  const frames = Math.floor(context.sampleRate * seconds)
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < frames; i += 1) channel[i] = Math.random() * 2 - 1

  // Un fondu aux deux extrémités du tampon évite le clic audible à chaque boucle.
  const ramp = Math.min(256, frames >> 1)
  for (let i = 0; i < ramp; i += 1) {
    const gain = i / ramp
    channel[i] = (channel[i] as number) * gain
    channel[frames - 1 - i] = (channel[frames - 1 - i] as number) * gain
  }

  const gainNode = context.createGain()
  gainNode.gain.value = 0
  gainNode.connect(context.destination)

  const source = context.createBufferSource()
  source.buffer = buffer
  source.loop = true
  source.connect(gainNode)
  source.start()

  let volume = targetVolume
  let running = false
  let disposed = false

  const rampTo = (value: number): void => {
    const now = context.currentTime
    gainNode.gain.cancelScheduledValues(now)
    gainNode.gain.setValueAtTime(gainNode.gain.value, now)
    gainNode.gain.linearRampToValueAtTime(value, now + FADE_SECONDS)
  }

  return {
    start(): void {
      if (disposed || running) return
      running = true
      rampTo(volume)
    },
    stop(): void {
      if (disposed || !running) return
      running = false
      rampTo(0)
    },
    setVolume(next: number): void {
      volume = Math.min(1, Math.max(0, next))
      if (running && !disposed) rampTo(volume)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      running = false
      try {
        source.stop()
      } catch {
        // Déjà arrêté : rien à faire.
      }
      source.disconnect()
      gainNode.disconnect()
    },
  }
}
