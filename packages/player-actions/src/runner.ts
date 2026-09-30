import type { Announcer } from './announcer.js'
import type { NoiseControl } from './white-noise.js'
import {
  protectionAt,
  type ActiveSegment,
  type Protection,
  type SchedulerOptions,
} from './scheduler.js'

/** Ce dont l'exécuteur a besoin pour agir. Injectable, donc testable sans navigateur. */
export interface ProtectionSinks {
  readonly noise: NoiseControl
  readonly announcer: Announcer
  /** Appelé à chaque changement d'état, pour rafraîchir l'interface. */
  readonly onChange?: (protection: Protection) => void
  /** Vibration mobile, quand l'appareil la prend en charge. */
  readonly vibrate?: (pattern: readonly number[]) => void
}

export interface RunnerOptions extends SchedulerOptions {
  /**
   * Faut-il maintenir la protection quand la position devient inconnue ?
   * Défaut : `true`. Voir la note sur l'asymétrie ci-dessous.
   */
  readonly holdOnSignalLoss?: boolean
}

/**
 * Applique la protection au fil du film.
 *
 * **Asymétrie de sécurité.** Quand la position devient inconnue — le suivi a perdu
 * son verrou — l'exécuteur ne relâche pas. S'il protégeait, il continue ; s'il
 * était en compte à rebours, il **passe directement en protection**. Un bruit
 * blanc qui dure trop longtemps est un désagrément ; un bruit blanc qui s'arrête
 * au mauvais moment laisse passer la scène (principe 5).
 *
 * C'est `release()` qui met fin à une protection maintenue — soit parce que le
 * suivi s'est reverrouillé ailleurs, soit parce que l'utilisateur a signalé une
 * fausse alerte.
 */
export class ProtectionRunner {
  #segments: readonly ActiveSegment[]
  readonly #sinks: ProtectionSinks
  readonly #options: RunnerOptions
  #current: Protection = { kind: 'idle' }
  #held = false

  constructor(
    segments: readonly ActiveSegment[],
    sinks: ProtectionSinks,
    options: RunnerOptions = {},
  ) {
    this.#segments = segments
    this.#sinks = sinks
    this.#options = options
  }

  get current(): Protection {
    return this.#current
  }

  /** Vrai quand la protection est maintenue faute de position fiable. */
  get isHolding(): boolean {
    return this.#held
  }

  /** Remplace la liste de segments — par exemple après un signalement. */
  setSegments(segments: readonly ActiveSegment[]): void {
    this.#segments = segments
  }

  /**
   * À appeler à chaque rafraîchissement, avec la position estimée du film.
   * `undefined` signifie « je ne sais plus où j'en suis ».
   */
  update(mediaTime: number | undefined): Protection {
    if (mediaTime === undefined) return this.#onSignalLost()

    this.#held = false
    this.#apply(protectionAt(this.#segments, mediaTime, this.#options))
    return this.#current
  }

  /** Met fin à une protection maintenue, et repasse au repos. */
  release(): Protection {
    this.#held = false
    this.#apply({ kind: 'idle' })
    return this.#current
  }

  /** Arrête tout et coupe la parole. */
  dispose(): void {
    this.#sinks.noise.stop()
    this.#sinks.announcer.cancel()
    this.#held = false
    this.#current = { kind: 'idle' }
  }

  #onSignalLost(): Protection {
    if (this.#options.holdOnSignalLoss === false) {
      this.#held = false
      this.#apply({ kind: 'idle' })
      return this.#current
    }

    if (this.#current.kind === 'idle') return this.#current

    this.#held = true
    if (this.#current.kind === 'warning') {
      // On allait entrer dans la scène et on a perdu le fil : on protège.
      this.#apply({ kind: 'protecting', segment: this.#current.segment, remaining: 0 })
    }
    return this.#current
  }

  #apply(next: Protection): void {
    const previous = this.#current
    this.#current = next

    if (next.kind === 'warning') {
      if (previous.kind !== 'warning') this.#sinks.announcer.reset()
      this.#sinks.announcer.countdown(next.remaining)
      if (previous.kind === 'idle') this.#sinks.vibrate?.([120, 80, 120])
    }

    if (next.kind === 'protecting' && previous.kind !== 'protecting') {
      this.#sinks.noise.start()
    }

    if (next.kind !== 'protecting' && previous.kind === 'protecting') {
      this.#sinks.noise.stop()
      this.#sinks.announcer.allClear()
    }

    if (next.kind === 'idle' && previous.kind === 'warning') {
      // Le compte à rebours a été annulé — segments rechargés, ou signalement
      // de fausse alerte. On coupe la parole plutôt que de finir le décompte.
      this.#sinks.announcer.cancel()
      this.#sinks.announcer.reset()
    }

    const changed =
      previous.kind !== next.kind ||
      (previous.kind !== 'idle' && next.kind !== 'idle' && previous.segment.id !== next.segment.id)
    if (changed) this.#sinks.onChange?.(next)
  }
}
