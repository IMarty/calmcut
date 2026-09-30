import { describe, expect, it } from 'vitest'
import { AudioWindower, SAMPLE_RATE } from './windower.js'

/** Un bloc de micro : `seconds` d'audio non nul, pour distinguer les fenêtres. */
const chunk = (seconds: number, value = 0.5): Float32Array =>
  new Float32Array(Math.round(seconds * SAMPLE_RATE)).fill(value)

describe('découpage en fenêtres', () => {
  it('ne rend rien avant d’avoir 8 s', () => {
    const windower = new AudioWindower()
    windower.push(chunk(7.9), 0)
    expect(windower.take()).toBeUndefined()
  })

  it('rend une fenêtre de 8 s exactement', () => {
    const windower = new AudioWindower()
    windower.push(chunk(8), 0)
    const window = windower.take()
    expect(window?.pcm.length).toBe(8 * SAMPLE_RATE)
    expect(window?.startedAt).toBe(0)
  })

  it('date la fenêtre depuis l’horloge fournie, pas depuis un compteur interne', () => {
    const windower = new AudioWindower()
    windower.push(chunk(8), 42.75)
    expect(windower.take()?.startedAt).toBe(42.75)
  })

  it('assemble plusieurs petits blocs', () => {
    const windower = new AudioWindower()
    for (let i = 0; i < 16; i += 1) windower.push(chunk(0.5), i * 0.5)
    expect(windower.take()?.pcm.length).toBe(8 * SAMPLE_RATE)
  })

  it('avance d’un pas de 4 s entre deux fenêtres, donc elles se chevauchent', () => {
    const windower = new AudioWindower()
    windower.push(chunk(12), 0)

    expect(windower.take()?.startedAt).toBe(0)
    expect(windower.take()?.startedAt).toBe(4)
    // À 12 s d'audio, la fenêtre démarrant à 8 s n'est pas encore complète.
    expect(windower.take()).toBeUndefined()

    windower.push(chunk(4), 12)
    expect(windower.take()?.startedAt).toBe(8)
  })

  it('respecte un pas personnalisé', () => {
    const windower = new AudioWindower({ listeningHop: 8 })
    windower.push(chunk(16), 0)
    expect(windower.take()?.startedAt).toBe(0)
    expect(windower.take()?.startedAt).toBe(8)
  })

  it('préserve le contenu audio de chaque fenêtre', () => {
    const windower = new AudioWindower({ listeningHop: 8 })
    windower.push(chunk(8, 0.25), 0)
    windower.push(chunk(8, 0.75), 8)

    const first = windower.take()
    const second = windower.take()
    expect(first?.pcm[0]).toBeCloseTo(0.25, 6)
    expect(second?.pcm[0]).toBeCloseTo(0.75, 6)
  })
})

describe('gestion du tampon', () => {
  it('ne grossit pas indéfiniment si personne ne consomme', () => {
    const windower = new AudioWindower()
    const seconds = 200
    for (let i = 0; i < seconds; i += 1) windower.push(chunk(1), i)

    // Le tampon est borné à trois fenêtres, soit 24 s : l'audio ancien est jeté
    // plutôt que de laisser le tampon grossir sur un appareil qui joue un film.
    const window = windower.take()
    expect(window).toBeDefined()
    // Ce qui compte : ce qu'on rend est récent, et son horodatage reste vrai.
    expect(window?.startedAt).toBeGreaterThanOrEqual(seconds - 25)
    expect(window?.startedAt).toBeLessThanOrEqual(seconds - 8)
    expect(windower.pendingSeconds).toBeLessThanOrEqual(25)
  })

  it('reste exact sur une longue séance', () => {
    const windower = new AudioWindower({ listeningHop: 8 })
    const starts: number[] = []
    for (let i = 0; i < 60; i += 1) {
      windower.push(chunk(1), i)
      const window = windower.take()
      if (window !== undefined) starts.push(window.startedAt)
    }
    expect(starts).toEqual([0, 8, 16, 24, 32, 40, 48])
  })

  it('flush() jette l’audio en attente', () => {
    const windower = new AudioWindower()
    windower.push(chunk(8), 0)
    windower.flush()
    expect(windower.take()).toBeUndefined()
    expect(windower.pendingSeconds).toBe(0)
  })

  it('repart proprement après un flush', () => {
    const windower = new AudioWindower()
    windower.push(chunk(8), 0)
    windower.flush()
    windower.push(chunk(8), 100)
    expect(windower.take()?.startedAt).toBe(100)
  })

  it('ignore un bloc vide', () => {
    const windower = new AudioWindower()
    windower.push(new Float32Array(0), 0)
    windower.push(chunk(8), 5)
    expect(windower.take()?.startedAt).toBe(5)
  })

  it('rapporte l’audio en attente', () => {
    const windower = new AudioWindower()
    windower.push(chunk(3), 0)
    expect(windower.pendingSeconds).toBeCloseTo(3, 3)
  })
})
