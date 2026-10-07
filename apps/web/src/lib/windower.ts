/**
 * Accumule le flux du micro et en découpe des fenêtres de 8 s à transcrire.
 *
 * C'est ici que se règle le compromis batterie / réactivité. Whisper est ce qui
 * coûte le plus cher sur l'appareil, donc on ne l'appelle que quand c'est utile :
 * souvent tant qu'on cherche la position, rarement une fois qu'on l'a.
 */

/** Fréquence d'échantillonnage attendue — celle que Whisper exige. */
export const SAMPLE_RATE = 16_000

export interface WindowerOptions {
  /** Durée d'une fenêtre, en secondes. Défaut : 8 (§7.3). */
  readonly windowSeconds?: number
  /** Pas entre deux fenêtres tant qu'on cherche la position. Défaut : 4 s. */
  readonly listeningHop?: number
  readonly sampleRate?: number
}

/** Une fenêtre prête à transcrire. */
export interface AudioWindow {
  readonly pcm: Float32Array
  /** Instant de l'horloge locale où commence la fenêtre, en secondes. */
  readonly startedAt: number
}

const DEFAULTS = { windowSeconds: 8, listeningHop: 4 }

export class AudioWindower {
  readonly #sampleRate: number
  readonly #windowFrames: number
  readonly #hopFrames: number

  #buffer: Float32Array
  /** Nombre d'échantillons valides dans `#buffer`. */
  #filled = 0
  /** Instant local du premier échantillon encore présent dans le tampon. */
  #bufferStartedAt = 0
  /** Position, en échantillons depuis le début du tampon, de la prochaine fenêtre. */
  #nextWindowAt = 0

  constructor(options: WindowerOptions = {}) {
    this.#sampleRate = options.sampleRate ?? SAMPLE_RATE
    const windowSeconds = options.windowSeconds ?? DEFAULTS.windowSeconds
    const hop = options.listeningHop ?? DEFAULTS.listeningHop
    this.#windowFrames = Math.round(windowSeconds * this.#sampleRate)
    this.#hopFrames = Math.round(hop * this.#sampleRate)
    // Deux fenêtres de marge : de quoi absorber une arrivée de chunks irrégulière
    // sans réallouer pendant la lecture.
    this.#buffer = new Float32Array(this.#windowFrames * 3)
  }

  /** Secondes d'audio actuellement en attente. */
  get pendingSeconds(): number {
    return (this.#filled - this.#nextWindowAt) / this.#sampleRate
  }

  /**
   * Ajoute un bloc du micro.
   *
   * `at` est l'instant local du **premier échantillon** du bloc. On s'y fie plutôt
   * que de compter les échantillons : l'horloge de l'`AudioContext` est la seule
   * référence commune entre la capture et la protection, et un bloc perdu ne doit
   * pas décaler tout ce qui suit.
   */
  push(chunk: Float32Array, at: number): void {
    if (chunk.length === 0) return

    if (this.#filled === 0) {
      this.#bufferStartedAt = at
      this.#nextWindowAt = 0
    }

    if (this.#filled + chunk.length > this.#buffer.length) this.#compact(chunk.length)

    this.#buffer.set(chunk, this.#filled)
    this.#filled += chunk.length
  }

  /**
   * Retire la prochaine fenêtre, s'il y a assez d'audio.
   *
   * `locked` change le pas : verrouillé, on ne transcrit que sur demande du suivi,
   * donc l'appelant n'appelle cette méthode que lorsqu'un recalage est souhaitable.
   */
  take(): AudioWindow | undefined {
    if (this.#filled - this.#nextWindowAt < this.#windowFrames) return undefined

    const start = this.#nextWindowAt
    const pcm = this.#buffer.slice(start, start + this.#windowFrames)
    const startedAt = this.#bufferStartedAt + start / this.#sampleRate

    this.#nextWindowAt = start + this.#hopFrames
    if (this.#nextWindowAt > this.#filled) this.#nextWindowAt = this.#filled

    return { pcm, startedAt }
  }

  /**
   * Jette l'audio en attente et repart de la fenêtre suivante.
   *
   * À appeler après un recalage : l'audio déjà entendu n'apprendra rien de plus,
   * et le transcrire consommerait de la batterie pour rien.
   */
  flush(): void {
    this.#filled = 0
    this.#nextWindowAt = 0
  }

  /** Décale ce qui reste utile au début du tampon. */
  #compact(incoming: number): void {
    const keepFrom = this.#nextWindowAt
    const kept = this.#filled - keepFrom

    if (kept + incoming > this.#buffer.length) {
      // L'appelant n'a pas consommé assez vite : on ne garde que la dernière
      // fenêtre. Perdre de l'audio ancien est préférable à faire grossir le
      // tampon sans fin sur un appareil qui joue déjà un film.
      const drop = kept + incoming - this.#buffer.length
      const from = keepFrom + drop
      this.#buffer.copyWithin(0, from, this.#filled)
      this.#bufferStartedAt += from / this.#sampleRate
      this.#filled -= from
      this.#nextWindowAt = 0
      return
    }

    this.#buffer.copyWithin(0, keepFrom, this.#filled)
    this.#bufferStartedAt += keepFrom / this.#sampleRate
    this.#filled = kept
    this.#nextWindowAt = 0
  }
}
