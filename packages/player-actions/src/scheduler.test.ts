import { asPhobiaId, asSegmentId, type Segment, type SegmentStatus } from '@calmcut/core'
import { describe, expect, it } from 'vitest'
import { nextTransitionAfter, prepareSegments, protectionAt } from './scheduler.js'

const segment = (
  id: string,
  phobia: string,
  start: number,
  end: number,
  status: SegmentStatus = 'confirmed',
): Segment => ({
  id: asSegmentId(id),
  phobia: asPhobiaId(phobia),
  start,
  end,
  modality: 'subs',
  status,
  score: 0.8,
})

const NO_MARGIN = { marginBefore: 0, marginAfter: 0 }

describe('prepareSegments', () => {
  it('ne garde que les phobies choisies', () => {
    const prepared = prepareSegments(
      [segment('a', 'rats', 100, 110), segment('b', 'spiders', 200, 210)],
      ['rats'],
      NO_MARGIN,
    )
    expect(prepared.map((s) => s.id)).toEqual(['a'])
  })

  it('applique les marges de sécurité', () => {
    const [prepared] = prepareSegments([segment('a', 'rats', 100, 110)], ['rats'])
    expect(prepared).toMatchObject({ start: 98, end: 112 })
  })

  it('ne fait pas passer un début avant le début du film', () => {
    const [prepared] = prepareSegments([segment('a', 'rats', 1, 5)], ['rats'])
    expect(prepared?.start).toBe(0)
  })

  it('trie par instant de début', () => {
    const prepared = prepareSegments(
      [segment('b', 'rats', 300, 310), segment('a', 'rats', 100, 110)],
      ['rats'],
      NO_MARGIN,
    )
    expect(prepared.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('applique tous les statuts sauf disabled', () => {
    const statuses: SegmentStatus[] = ['pending', 'confirmed', 'verified', 'disputed', 'disabled']
    const prepared = prepareSegments(
      statuses.map((s, i) => segment(s, 'rats', i * 100, i * 100 + 10, s)),
      ['rats'],
      NO_MARGIN,
    )
    // Un faux négatif est grave, un faux positif est bénin : on protège au moindre doute.
    expect(prepared.map((s) => s.id)).toEqual(['pending', 'confirmed', 'verified', 'disputed'])
  })
})

describe('fusion des segments proches', () => {
  it('fusionne deux segments qui se chevauchent après application des marges', () => {
    // 100→110 et 113→120 ne se chevauchent pas, mais avec ±2 s de marge oui.
    const prepared = prepareSegments(
      [segment('a', 'rats', 100, 110), segment('b', 'rats', 113, 120)],
      ['rats'],
    )
    expect(prepared).toHaveLength(1)
    expect(prepared[0]).toMatchObject({ id: 'a', start: 98, end: 122 })
  })

  it('fusionne des segments de phobies différentes', () => {
    const prepared = prepareSegments(
      [segment('a', 'rats', 100, 110), segment('b', 'spiders', 105, 115)],
      ['rats', 'spiders'],
      NO_MARGIN,
    )
    expect(prepared).toHaveLength(1)
    expect(prepared[0]).toMatchObject({ phobia: 'rats', end: 115 })
  })

  it('absorbe un segment entièrement contenu dans un autre', () => {
    const prepared = prepareSegments(
      [segment('a', 'rats', 100, 200), segment('b', 'rats', 120, 130)],
      ['rats'],
      NO_MARGIN,
    )
    expect(prepared).toHaveLength(1)
    expect(prepared[0]?.end).toBe(200)
  })

  it('ne fusionne pas deux segments franchement séparés', () => {
    const prepared = prepareSegments(
      [segment('a', 'rats', 100, 110), segment('b', 'rats', 500, 510)],
      ['rats'],
    )
    expect(prepared).toHaveLength(2)
  })

  it('évite qu’un compte à rebours tombe pendant une protection en cours', () => {
    const prepared = prepareSegments(
      [segment('a', 'rats', 100, 110), segment('b', 'rats', 113, 120)],
      ['rats'],
    )
    // Sans fusion, à t = 106 on serait à la fois « protecting » sur a et
    // « warning » sur b. Après fusion, un seul état existe.
    expect(protectionAt(prepared, 106).kind).toBe('protecting')
    expect(protectionAt(prepared, 121).kind).toBe('protecting')
    expect(protectionAt(prepared, 123).kind).toBe('idle')
  })
})

describe('protectionAt', () => {
  const prepared = prepareSegments(
    [segment('a', 'rats', 100, 110), segment('b', 'rats', 500, 505)],
    ['rats'],
    NO_MARGIN,
  )

  it('ne fait rien loin de toute scène', () => {
    expect(protectionAt(prepared, 0).kind).toBe('idle')
    expect(protectionAt(prepared, 90).kind).toBe('idle')
    expect(protectionAt(prepared, 300).kind).toBe('idle')
  })

  it('déclenche le compte à rebours 5 s avant, pas plus tôt', () => {
    expect(protectionAt(prepared, 94.9).kind).toBe('idle')
    expect(protectionAt(prepared, 95).kind).toBe('warning')
    expect(protectionAt(prepared, 99).kind).toBe('warning')
  })

  it('annonce le temps restant, qui décroît vers zéro', () => {
    const at96 = protectionAt(prepared, 96)
    const at99 = protectionAt(prepared, 99)
    expect(at96.kind === 'warning' && at96.remaining).toBeCloseTo(4, 6)
    expect(at99.kind === 'warning' && at99.remaining).toBeCloseTo(1, 6)
  })

  it('protège pendant toute la scène, bornes comprises', () => {
    expect(protectionAt(prepared, 100).kind).toBe('protecting')
    expect(protectionAt(prepared, 105).kind).toBe('protecting')
    expect(protectionAt(prepared, 109.99).kind).toBe('protecting')
  })

  it('relâche exactement à la fin', () => {
    expect(protectionAt(prepared, 110).kind).toBe('idle')
  })

  it('respecte un délai de préavis personnalisé', () => {
    expect(protectionAt(prepared, 92, { warningLead: 10 }).kind).toBe('warning')
    expect(protectionAt(prepared, 92, { warningLead: 3 }).kind).toBe('idle')
  })

  it('ne fait rien sur une liste vide', () => {
    expect(protectionAt([], 100).kind).toBe('idle')
  })

  it('trouve le bon segment parmi beaucoup, sans parcours linéaire', () => {
    const many = prepareSegments(
      Array.from({ length: 2000 }, (_, i) => segment(`s${i}`, 'rats', i * 100, i * 100 + 10)),
      ['rats'],
      NO_MARGIN,
    )
    // Le dernier segment couvre [199 900 ; 199 910], son préavis [199 895 ; 199 900[.
    expect(protectionAt(many, 199_890).kind).toBe('idle')
    expect(protectionAt(many, 199_896).kind).toBe('warning')
    expect(protectionAt(many, 199_905).kind).toBe('protecting')
    expect(protectionAt(many, 199_910).kind).toBe('idle')
    // Et au tout début, le premier segment reste trouvable.
    expect(protectionAt(many, 5).kind).toBe('protecting')
  })
})

describe('nextTransitionAfter', () => {
  const prepared = prepareSegments(
    [segment('a', 'rats', 100, 110), segment('b', 'rats', 500, 505)],
    ['rats'],
    NO_MARGIN,
  )

  it('annonce le prochain instant intéressant', () => {
    expect(nextTransitionAfter(prepared, 0)).toBe(95)
    expect(nextTransitionAfter(prepared, 95)).toBe(100)
    expect(nextTransitionAfter(prepared, 100)).toBe(110)
    expect(nextTransitionAfter(prepared, 110)).toBe(495)
  })

  it('renvoie undefined après la dernière scène', () => {
    expect(nextTransitionAfter(prepared, 505)).toBeUndefined()
  })
})
