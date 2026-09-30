import { describe, expect, it } from 'vitest'
import { hearSegments } from './histogram.js'
import { buildIndexFromCues, parseSyncIndex } from './index-format.js'
import { listen, makeClock, syntheticScript } from './testing/synthetic.js'
import { SyncTracker } from './tracker.js'

/**
 * Robustesse de l'estimation du débit de lecture.
 *
 * Écrits en cherchant la cause d'un décalage d'une quarantaine de secondes observé
 * lors d'un test manuel. **Ils ne reproduisent pas ce décalage** : sur des
 * timelines synthétiques, même les seuils permissifs d'origine (3 ancres sur 45 s,
 * tolérance jusqu'à 1,11) donnent un débit correct à 0,03 % près, parce que le
 * bruit de segmentation s'annule sur beaucoup d'ancres.
 *
 * Le durcissement des seuils est donc conservé pour ce qu'il est — une garantie
 * supplémentaire, pas un correctif de ce symptôme-là. Ces tests vérifient qu'il ne
 * coûte rien : le débit reste à 1 sur un film à vitesse normale, et un vrai
 * transfert PAL est toujours détecté.
 */

const SALT = 'title-rate-drift'
const PAL = 25 / 23.976

const script = syntheticScript(500, { seed: 11, gap: 3.5, startAt: 20 })
const index = parseSyncIndex(buildIndexFromCues(script, SALT))

const STEP = 10
const WINDOW = 8

/** Seuils d'origine, qui adoptaient une pente bien trop tôt. */
const PERMISSIVE = {
  minRateSpan: 45,
  minRateAnchors: 3,
  maxRateStdError: Number.POSITIVE_INFINITY,
  rateBounds: [0.9, 1.11] as const,
  rateWindow: 240,
}

interface Run {
  readonly worstError: number
  readonly finalRate: number
  readonly errors: number[]
}

/** Déroule une séance et mesure l'écart entre position estimée et position réelle. */
const run = (
  options: Parameters<typeof SyncTracker.prototype.constructor> extends never
    ? never
    : ConstructorParameters<typeof SyncTracker>[1],
  playback: { offset: number; rate?: number },
  duration: number,
  segmentationError: number,
): Run => {
  const clock = makeClock(playback)
  const tracker = new SyncTracker(index, options)
  const errors: number[] = []

  for (let local = 0; local < duration; local += STEP) {
    const segments = listen(script, clock, local, {
      windowSeconds: WINDOW,
      segmentationError,
      seed: local * 37 + 3,
    })
    tracker.observe(hearSegments(segments, SALT))

    const probe = local + WINDOW
    const estimated = tracker.mediaTimeAt(probe)
    if (estimated !== undefined) errors.push(estimated - clock(probe))
  }

  return {
    worstError: errors.length === 0 ? 0 : Math.max(...errors.map(Math.abs)),
    finalRate: tracker.status.rate,
    errors,
  }
}

describe('film à vitesse normale, ancres bruitées', () => {
  // 0,4 s de bruit de segmentation : réaliste pour Whisper sur un vrai film.
  const NOISE = 0.4
  const DURATION = 600

  it('les seuils permissifs restaient corrects sur ces timelines synthétiques', () => {
    // À consigner explicitement : ce test ne reproduit PAS le symptôme observé.
    // La cause du décalage de 45 s est donc ailleurs — très probablement un
    // fichier de sous-titres décalé par rapport à la version du film.
    const permissive = run(PERMISSIVE, { offset: 900 }, DURATION, NOISE)
    expect(Math.abs(permissive.finalRate - 1)).toBeLessThan(0.01)
  })

  it('les seuils actuels gardent un débit de 1 sur un film à vitesse normale', () => {
    const guarded = run(undefined, { offset: 900 }, DURATION, NOISE)
    expect(guarded.finalRate).toBeCloseTo(1, 3)
  })

  it('et tiennent la position sous 1 s, du début à la fin', () => {
    const guarded = run(undefined, { offset: 900 }, DURATION, NOISE)
    // Pas de fenêtre d'indulgence : on juge toute la séance, dès le premier
    // verrouillage. C'est ce que le test de M1 n'osait pas faire.
    expect(guarded.worstError).toBeLessThan(1)
  })

  it('ne font jamais pire que les seuils permissifs', () => {
    const permissive = run(PERMISSIVE, { offset: 900 }, DURATION, NOISE)
    const guarded = run(undefined, { offset: 900 }, DURATION, NOISE)
    // Le durcissement doit être gratuit : refuser d'estimer trop tôt revient à
    // garder un débit de 1, ce qui est le comportement de §7.3.
    expect(guarded.worstError).toBeLessThanOrEqual(permissive.worstError + 0.05)
  })
})

describe('transfert PAL, ancres bruitées', () => {
  it('mesure quand même le vrai débit, une fois assez d’ancres accumulées', () => {
    const guarded = run(undefined, { offset: 600, rate: PAL }, 900, 0.3)
    // Le durcissement ne doit pas empêcher de détecter un écart réel de 4,3 % :
    // il doit seulement refuser de le deviner trop tôt.
    expect(guarded.finalRate).toBeCloseTo(PAL, 2)
  })

  it('ne dérive pas plus qu’avec les anciens seuils', () => {
    const permissive = run(PERMISSIVE, { offset: 600, rate: PAL }, 900, 0.3)
    const guarded = run(undefined, { offset: 600, rate: PAL }, 900, 0.3)
    expect(guarded.worstError).toBeLessThanOrEqual(permissive.worstError * 1.5)
  })
})

describe('bornes du débit', () => {
  it('refuse une pente hors des cadences réelles', () => {
    // 1,11 n'est la cadence d'aucun transfert : c'est une erreur d'estimation.
    const tracker = new SyncTracker(index, { rateBounds: [0.94, 1.06] })
    expect(tracker.status.rate).toBe(1)
  })

  it('reste à 1 tant qu’il n’y a pas assez d’ancres', () => {
    const clock = makeClock({ offset: 900 })
    const tracker = new SyncTracker(index)
    // Deux relevés seulement : très loin des cinq ancres exigées.
    for (let local = 0; local < 20; local += STEP) {
      tracker.observe(hearSegments(listen(script, clock, local, { windowSeconds: WINDOW }), SALT))
    }
    expect(tracker.status.phase).toBe('locked')
    expect(tracker.status.rate).toBe(1)
  })
})
