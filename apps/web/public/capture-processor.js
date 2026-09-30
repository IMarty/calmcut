/**
 * AudioWorklet de capture du micro.
 *
 * Tourne sur le thread audio, servi tel quel (pas de build) car
 * `audioWorklet.addModule` charge une URL.
 *
 * Son seul rôle est d'accumuler les blocs de 128 échantillons en paquets d'environ
 * une demi-seconde, puis de les transférer sans copie. Poster chaque bloc de 128
 * échantillons réveillerait le thread principal 125 fois par seconde pour rien.
 */

/** Échantillons par paquet : 8192 à 16 kHz, soit 0,512 s. */
const CHUNK = 8192

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(CHUNK)
    this.filled = 0
    /** Instant local du premier échantillon du paquet en cours. */
    this.startedAt = 0
    this.muted = false

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'mute') {
        this.muted = Boolean(event.data.value)
        // On repart d'un paquet vide : mélanger de l'avant et de l'après-coupure
        // produirait un paquet dont l'horodatage serait faux.
        this.filled = 0
      }
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true

    const channel = input[0]
    if (!channel || this.muted) return true

    if (this.filled === 0) this.startedAt = currentTime

    let offset = 0
    while (offset < channel.length) {
      const room = CHUNK - this.filled
      const take = Math.min(room, channel.length - offset)
      this.buffer.set(channel.subarray(offset, offset + take), this.filled)
      this.filled += take
      offset += take

      if (this.filled === CHUNK) {
        const pcm = this.buffer.slice(0)
        this.port.postMessage({ pcm, at: this.startedAt }, [pcm.buffer])
        this.filled = 0
        // Le prochain paquet commence là où celui-ci s'arrête.
        this.startedAt = currentTime + offset / sampleRate
      }
    }

    return true
  }
}

registerProcessor('capture-processor', CaptureProcessor)
