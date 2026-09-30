import { describe, expect, it } from 'vitest'
import { asPhobiaId, asSegmentId } from './ids.js'
import {
  isActiveStatus,
  segmentsForSource,
  toCanonicalTime,
  toSourceTime,
  type Segment,
  type SegmentStatus,
  type TimelineSource,
} from './timeline.js'

const netflix: TimelineSource = {
  kind: 'netflix',
  externalId: '70021642',
  offset: -12.3,
  scale: 1,
}

const pal: TimelineSource = { kind: 'file', externalId: 'local', offset: 0, scale: 25 / 23.976 }

describe('conversion de timeline', () => {
  it('applique décalage et échelle', () => {
    expect(toCanonicalTime(100, netflix)).toBeCloseTo(87.7, 6)
    expect(toCanonicalTime(100, pal)).toBeCloseTo(104.2709, 4)
  })

  it('est réversible', () => {
    for (const source of [netflix, pal]) {
      expect(toSourceTime(toCanonicalTime(4331.2, source), source)).toBeCloseTo(4331.2, 6)
    }
  })
})

describe('segmentsForSource', () => {
  const segment: Segment = {
    id: asSegmentId('seg_1'),
    phobia: asPhobiaId('rats'),
    start: 4331.2,
    end: 4339.8,
    modality: 'subs',
    status: 'confirmed',
    score: 0.82,
  }

  it('traduit les bornes et préserve la durée à l’échelle près', () => {
    const [translated] = segmentsForSource([segment], netflix)
    expect(translated).toBeDefined()
    expect(translated?.start).toBeCloseTo(4343.5, 6)
    expect(translated?.end).toBeCloseTo(4352.1, 6)
    expect((translated?.end ?? 0) - (translated?.start ?? 0)).toBeCloseTo(8.6, 6)
  })

  it('conserve les autres champs', () => {
    const [translated] = segmentsForSource([segment], pal)
    expect(translated?.id).toBe(segment.id)
    expect(translated?.status).toBe('confirmed')
  })
})

describe('isActiveStatus', () => {
  it('n’exclut que disabled — un faux positif est bénin, un faux négatif est grave', () => {
    const statuses: SegmentStatus[] = ['pending', 'confirmed', 'verified', 'disputed']
    for (const status of statuses) expect(isActiveStatus(status)).toBe(true)
    expect(isActiveStatus('disabled')).toBe(false)
  })
})
