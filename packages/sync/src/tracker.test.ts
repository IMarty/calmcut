import { describe, expect, it } from 'vitest'
import { hearSegments, type HeardTrigram } from './histogram.js'
import { buildIndexFromCues, parseSyncIndex, type SubtitleCue } from './index-format.js'
import { listen, makeClock, syntheticScript, type PlaybackOptions } from './testing/synthetic.js'
import { SyncTracker, type UnlockReason } from './tracker.js'

const SALT = 'title-tracker'
const PAL = 25 / 23.976

const script = syntheticScript(400, { seed: 7, gap: 3.5, startAt: 20 })
const index = parseSyncIndex(buildIndexFromCues(script, SALT))

/** Le compagnon écoute 8 s, puis se tait — ici toutes les 10 s d'horloge locale. */
const STEP = 10
const WINDOW = 8

interface RunResult {
  /** Instant local du premier verrouillage, en secondes. */
  readonly lockedAt: number | undefined
  /** Écart entre la position estimée et la position réelle, à chaque instant sondé. */
  readonly errors: { local: number; error: number }[]
  /** Motifs de déverrouillage rencontrés au fil de la séance, dans l'ordre. */
  readonly unlocks: UnlockReason[]
  readonly tracker: SyncTracker
}

/**
 * Déroule une séance : le client écoute une fenêtre sur dix, le film avance selon
 * `playback`, et on compare en permanence la position estimée à la vérité.
 */
const run = (
  playback: PlaybackOptions,
  duration: number,
  options: { readonly wordErrorRate?: number; readonly silentFrom?: number } = {},
): RunResult => {
  const clock = makeClock(playback)
  const tracker = new SyncTracker(index)
  const errors: RunResult['errors'] = []
  const unlocks: UnlockReason[] = []
  let lockedAt: number | undefined
  let wasLocked = false

  for (let local = 0; local < duration; local += STEP) {
    const silent = options.silentFrom !== undefined && local >= options.silentFrom
    const segments = silent
      ? []
      : listen(script, clock, local, {
          windowSeconds: WINDOW,
          seed: local * 31 + 5,
          ...(options.wordErrorRate !== undefined ? { wordErrorRate: options.wordErrorRate } : {}),
        })

    const status = tracker.observe(hearSegments(segments, SALT))
    if (wasLocked && status.phase === 'listening' && status.lastUnlockReason !== undefined) {
      unlocks.push(status.lastUnlockReason)
    }
    wasLocked = status.phase === 'locked'

    const probe = local + WINDOW
    const estimated = tracker.mediaTimeAt(probe)
    if (estimated !== undefined) {
      if (lockedAt === undefined) lockedAt = local + WINDOW
      errors.push({ local: probe, error: estimated - clock(probe) })
    }
  }

  return { lockedAt, errors, unlocks, tracker }
}

const worstError = (result: RunResult, after = 0): number =>
  Math.max(...result.errors.filter((e) => e.local >= after).map((e) => Math.abs(e.error)))

describe('verrouillage sur un décalage constant', () => {
  const result = run({ offset: 1800 }, 300)

  it('se verrouille en moins de 30 s', () => {
    expect(result.lockedAt).toBeDefined()
    expect(result.lockedAt as number).toBeLessThan(30)
  })

  it('reste verrouillé toute la séance', () => {
    expect(result.tracker.status.phase).toBe('locked')
  })

  it('tient la position à moins de 0,5 s', () => {
    expect(worstError(result)).toBeLessThan(0.5)
  })
})

describe('facteur d’échelle 25/23,976 (transfert PAL)', () => {
  const result = run({ offset: 600, rate: PAL }, 600)

  it('se verrouille malgré la dérive', () => {
    expect(result.lockedAt).toBeDefined()
    expect(result.lockedAt as number).toBeLessThan(30)
  })

  it('mesure le débit réel au lieu de supposer 1', () => {
    expect(result.tracker.status.rate).toBeCloseTo(PAL, 2)
  })

  it('tient la position à moins de 0,5 s une fois le débit estimé', () => {
    // Avant la première estimation de débit, la dérive attendue est de 4,3 %
    // du temps écoulé depuis le dernier recalage : c'est la raison d'être de
    // l'estimation. On juge donc le régime établi.
    expect(worstError(result, 120)).toBeLessThan(0.5)
  })

  it('serait bien moins précis sans estimation de débit', () => {
    const clock = makeClock({ offset: 600, rate: PAL })
    const naive = new SyncTracker(index, { rateBounds: [1, 1] })
    let worst = 0
    for (let local = 0; local < 600; local += STEP) {
      naive.observe(hearSegments(listen(script, clock, local, { windowSeconds: WINDOW }), SALT))
      const probe = local + WINDOW
      const estimated = naive.mediaTimeAt(probe)
      if (estimated !== undefined) worst = Math.max(worst, Math.abs(estimated - clock(probe)))
    }
    expect(worst).toBeGreaterThan(worstError(result, 120))
  })
})

describe('pause au milieu du film', () => {
  const result = run({ offset: 900, interruptions: [{ at: 200, duration: 45 }] }, 600)

  it('retrouve la bonne position après la pause', () => {
    const after = result.errors.filter((e) => e.local > 320)
    expect(after.length).toBeGreaterThan(5)
    expect(Math.max(...after.map((e) => Math.abs(e.error)))).toBeLessThan(0.5)
  })

  it('finit la séance verrouillé', () => {
    expect(result.tracker.status.phase).toBe('locked')
  })
})

describe('coupure publicitaire', () => {
  const result = run(
    {
      offset: 300,
      interruptions: [
        { at: 150, duration: 120 },
        { at: 400, duration: 90 },
      ],
    },
    900,
  )

  it('se recale après chaque coupure', () => {
    const after = result.errors.filter((e) => e.local > 560)
    expect(after.length).toBeGreaterThan(5)
    expect(Math.max(...after.map((e) => Math.abs(e.error)))).toBeLessThan(0.5)
  })

  it('lâche le verrou pendant la coupure plutôt que d’annoncer une position fausse', () => {
    // Une coupure longue est vécue comme une perte de signal : plus aucun dialogue
    // du film n'est audible pendant plus de trois relevés. Le suivi préfère
    // admettre qu'il ne sait plus où il en est.
    expect(result.unlocks).toContain('lost')
  })
})

describe('pause courte', () => {
  // Assez courte pour que le suivi n'ait pas le temps de perdre le signal : au
  // retour, la position a sauté et c'est le contrôle de saut qui doit réagir.
  const result = run({ offset: 900, interruptions: [{ at: 200, duration: 15 }] }, 500)

  it('détecte un saut plutôt qu’une perte de signal', () => {
    expect(result.unlocks).toContain('jump')
    expect(result.unlocks).not.toContain('lost')
  })

  it('se recale et retrouve la bonne position', () => {
    const after = result.errors.filter((e) => e.local > 260)
    expect(after.length).toBeGreaterThan(5)
    expect(Math.max(...after.map((e) => Math.abs(e.error)))).toBeLessThan(0.5)
  })
})

describe('transcription imparfaite', () => {
  it('reste verrouillé avec 15 % de mots mal entendus', () => {
    const result = run({ offset: 600 }, 400, { wordErrorRate: 0.15 })
    expect(result.lockedAt).toBeDefined()
    expect(result.tracker.status.phase).toBe('locked')
    expect(worstError(result)).toBeLessThan(0.5)
  })

  it('à 30 % d’erreurs, perd parfois le verrou mais n’annonce jamais une position fausse', () => {
    const result = run({ offset: 600 }, 600, { wordErrorRate: 0.3 })
    expect(result.lockedAt).toBeDefined()
    // C'est la garantie qui compte : le suivi a le droit de dire « je ne sais
    // pas », jamais de se tromper — une position fausse décale les protections
    // et fait passer le rat.
    expect(worstError(result)).toBeLessThan(0.5)
  })

  it('refuse de verrouiller quand tout est inaudible', () => {
    const result = run({ offset: 600 }, 200, { wordErrorRate: 1 })
    expect(result.lockedAt).toBeUndefined()
    expect(result.tracker.status.phase).toBe('listening')
  })
})

describe('perte du signal', () => {
  it('garde le verrou sur deux relevés muets, le lâche au troisième', () => {
    const tracker = new SyncTracker(index)
    const clock = makeClock({ offset: 500 })
    tracker.observe(hearSegments(listen(script, clock, 0, { windowSeconds: WINDOW }), SALT))
    expect(tracker.status.phase).toBe('locked')

    tracker.observe([])
    expect(tracker.status.phase).toBe('locked')
    tracker.observe([])
    expect(tracker.status.phase).toBe('locked')
    tracker.observe([])
    expect(tracker.status.phase).toBe('listening')
    expect(tracker.status.lastUnlockReason).toBe('lost')
  })

  it('n’estime plus de position une fois le verrou perdu', () => {
    const result = run({ offset: 500 }, 200, { silentFrom: 60 })
    expect(result.tracker.status.phase).toBe('listening')
    expect(result.tracker.mediaTimeAt(200)).toBeUndefined()
  })
})

describe('gestion du recalage', () => {
  it('réclame un recalage tant qu’il n’est pas verrouillé', () => {
    expect(new SyncTracker(index).needsResync(0)).toBe(true)
  })

  it('ne réclame un recalage qu’au bout de 30 s', () => {
    const tracker = new SyncTracker(index)
    const clock = makeClock({ offset: 500 })
    tracker.observe(hearSegments(listen(script, clock, 0, { windowSeconds: WINDOW }), SALT))

    const anchored = tracker.status.anchoredAt as number
    expect(tracker.needsResync(anchored + 29)).toBe(false)
    expect(tracker.needsResync(anchored + 31)).toBe(true)
  })

  it('reset() repasse en écoute sans motif de perte', () => {
    const tracker = new SyncTracker(index)
    const clock = makeClock({ offset: 500 })
    tracker.observe(hearSegments(listen(script, clock, 0, { windowSeconds: WINDOW }), SALT))
    tracker.reset()
    expect(tracker.status.phase).toBe('listening')
    expect(tracker.status.lastUnlockReason).toBeUndefined()
    expect(tracker.mediaTimeAt(0)).toBeUndefined()
  })
})

describe('exigence de concordance', () => {
  it('ne verrouille pas sur deux trigrammes concordants', () => {
    const cues: SubtitleCue[] = [{ text: 'un deux trois quatre', start: 100 }]
    const small = parseSyncIndex(buildIndexFromCues(cues, SALT))
    const tracker = new SyncTracker(small)

    // « un deux trois quatre » ne porte que deux trigrammes.
    const heard: readonly HeardTrigram[] = hearSegments([{ text: cues[0]!.text, start: 10 }], SALT)
    expect(heard).toHaveLength(2)
    expect(tracker.observe(heard).phase).toBe('listening')
  })
})
