import { asPhobiaId, asSegmentId, type Segment } from '@calmcut/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProtectionRunner, type ProtectionSinks } from './runner.js'
import { prepareSegments, type Protection } from './scheduler.js'

const segments = prepareSegments(
  [
    {
      id: asSegmentId('a'),
      phobia: asPhobiaId('rats'),
      start: 100,
      end: 110,
      modality: 'subs',
      status: 'confirmed',
      score: 0.9,
    } satisfies Segment,
  ],
  ['rats'],
  { marginBefore: 0, marginAfter: 0 },
)

const makeSinks = () => {
  const changes: Protection[] = []
  const sinks = {
    noise: { start: vi.fn(), stop: vi.fn() },
    announcer: {
      countdown: vi.fn(),
      allClear: vi.fn(),
      reset: vi.fn(),
      cancel: vi.fn(),
    },
    vibrate: vi.fn(),
    onChange: (p: Protection) => changes.push(p),
  }
  return { sinks: sinks satisfies ProtectionSinks, changes }
}

describe('déroulement normal d’une scène', () => {
  let ctx: ReturnType<typeof makeSinks>
  let runner: ProtectionRunner

  beforeEach(() => {
    ctx = makeSinks()
    runner = new ProtectionRunner(segments, ctx.sinks)
  })

  it('ne touche à rien loin de la scène', () => {
    runner.update(50)
    expect(ctx.sinks.noise.start).not.toHaveBeenCalled()
    expect(ctx.sinks.announcer.countdown).not.toHaveBeenCalled()
  })

  it('annonce le décompte, puis lance le bruit blanc, puis l’arrête', () => {
    for (const t of [50, 96, 97, 98, 99, 100, 105, 110, 115]) runner.update(t)

    expect(ctx.sinks.announcer.countdown).toHaveBeenCalled()
    expect(ctx.sinks.noise.start).toHaveBeenCalledTimes(1)
    expect(ctx.sinks.noise.stop).toHaveBeenCalledTimes(1)
    expect(ctx.sinks.announcer.allClear).toHaveBeenCalledTimes(1)
  })

  it('lance le bruit blanc une seule fois, même appelé à chaque image', () => {
    for (let t = 99; t < 110; t += 1 / 60) runner.update(t)
    expect(ctx.sinks.noise.start).toHaveBeenCalledTimes(1)
    expect(ctx.sinks.noise.stop).not.toHaveBeenCalled()
  })

  it('vibre une seule fois, à l’entrée dans le compte à rebours', () => {
    for (const t of [96, 97, 98] as const) runner.update(t)
    expect(ctx.sinks.vibrate).toHaveBeenCalledTimes(1)
  })

  it('ne notifie l’interface qu’aux changements d’état', () => {
    for (let t = 90; t < 120; t += 0.5) runner.update(t)
    expect(ctx.changes.map((c) => c.kind)).toEqual(['warning', 'protecting', 'idle'])
  })

  it('remet le compteur d’annonces à zéro à chaque nouvelle scène', () => {
    runner.update(96)
    expect(ctx.sinks.announcer.reset).toHaveBeenCalledTimes(1)
    runner.update(97)
    expect(ctx.sinks.announcer.reset).toHaveBeenCalledTimes(1)
  })
})

describe('perte de la position — asymétrie de sécurité', () => {
  it('maintient la protection en cours', () => {
    const { sinks } = makeSinks()
    const runner = new ProtectionRunner(segments, sinks)
    runner.update(105)
    expect(runner.current.kind).toBe('protecting')

    runner.update(undefined)
    expect(runner.current.kind).toBe('protecting')
    expect(runner.isHolding).toBe(true)
    // Surtout : le bruit blanc ne s'arrête pas.
    expect(sinks.noise.stop).not.toHaveBeenCalled()
  })

  it('escalade un compte à rebours en protection plutôt que de le laisser tomber', () => {
    const { sinks } = makeSinks()
    const runner = new ProtectionRunner(segments, sinks)
    runner.update(97)
    expect(runner.current.kind).toBe('warning')

    runner.update(undefined)
    // On allait entrer dans la scène et on a perdu le fil : on protège.
    expect(runner.current.kind).toBe('protecting')
    expect(sinks.noise.start).toHaveBeenCalledTimes(1)
  })

  it('ne déclenche rien si on était déjà au repos', () => {
    const { sinks } = makeSinks()
    const runner = new ProtectionRunner(segments, sinks)
    runner.update(50)
    runner.update(undefined)
    expect(runner.current.kind).toBe('idle')
    expect(runner.isHolding).toBe(false)
    expect(sinks.noise.start).not.toHaveBeenCalled()
  })

  it('relâche quand la position redevient connue et hors scène', () => {
    const { sinks } = makeSinks()
    const runner = new ProtectionRunner(segments, sinks)
    runner.update(105)
    runner.update(undefined)
    runner.update(200)
    expect(runner.current.kind).toBe('idle')
    expect(runner.isHolding).toBe(false)
    expect(sinks.noise.stop).toHaveBeenCalledTimes(1)
  })

  it('release() met fin à une protection maintenue', () => {
    const { sinks } = makeSinks()
    const runner = new ProtectionRunner(segments, sinks)
    runner.update(105)
    runner.update(undefined)
    runner.release()
    expect(runner.current.kind).toBe('idle')
    expect(runner.isHolding).toBe(false)
    expect(sinks.noise.stop).toHaveBeenCalledTimes(1)
  })

  it('holdOnSignalLoss: false relâche immédiatement — jamais le défaut', () => {
    const { sinks } = makeSinks()
    const runner = new ProtectionRunner(segments, sinks, { holdOnSignalLoss: false })
    runner.update(105)
    runner.update(undefined)
    expect(runner.current.kind).toBe('idle')
    expect(sinks.noise.stop).toHaveBeenCalledTimes(1)
  })
})

describe('annulation et rechargement', () => {
  it('coupe la parole si le compte à rebours disparaît', () => {
    const { sinks } = makeSinks()
    const runner = new ProtectionRunner(segments, sinks)
    runner.update(97)
    runner.setSegments([])
    runner.update(98)
    expect(runner.current.kind).toBe('idle')
    expect(sinks.announcer.cancel).toHaveBeenCalledTimes(1)
  })

  it('applique immédiatement des segments rechargés', () => {
    const { sinks } = makeSinks()
    const runner = new ProtectionRunner([], sinks)
    runner.update(105)
    expect(runner.current.kind).toBe('idle')

    runner.setSegments(segments)
    runner.update(105)
    expect(runner.current.kind).toBe('protecting')
  })

  it('dispose() arrête tout', () => {
    const { sinks } = makeSinks()
    const runner = new ProtectionRunner(segments, sinks)
    runner.update(105)
    runner.dispose()
    expect(sinks.noise.stop).toHaveBeenCalled()
    expect(sinks.announcer.cancel).toHaveBeenCalled()
    expect(runner.current.kind).toBe('idle')
  })
})
