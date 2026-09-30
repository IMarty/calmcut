import { describe, expect, it } from 'vitest'
import { detectFromSubtitles, type DetectableCue } from './detect.js'

const cue = (text: string, start: number, end = start + 2): DetectableCue => ({ text, start, end })

const NO_MERGE = { mergeWithin: 0, margin: 0 }

describe('indications sonores', () => {
  it('détecte une indication sonore SDH', () => {
    const scenes = detectFromSubtitles([cue('[rats squeaking]', 100)], ['rats'], NO_MERGE)
    expect(scenes).toHaveLength(1)
    expect(scenes[0]).toMatchObject({ phobia: 'rats', evidence: 'sound-cue', start: 100, end: 102 })
  })

  it('détecte une indication sonore en français', () => {
    const scenes = detectFromSubtitles([cue('[couinements]', 50)], ['rats'], NO_MERGE)
    expect(scenes[0]?.evidence).toBe('sound-cue')
  })

  it('accepte les parenthèses autant que les crochets', () => {
    const scenes = detectFromSubtitles([cue('(grattements)', 50)], ['rats'], NO_MERGE)
    expect(scenes[0]?.evidence).toBe('sound-cue')
  })

  it('traite une bête nommée entre crochets comme une indication sonore', () => {
    const scenes = detectFromSubtitles([cue('[des rats]', 50)], ['rats'], NO_MERGE)
    expect(scenes[0]?.evidence).toBe('sound-cue')
  })

  it('ne prend pas un mot du dialogue pour un bruit', () => {
    // « squeak » parlé n'est pas un rat qui couine.
    const scenes = detectFromSubtitles([cue('Did you hear that squeak?', 50)], ['rats'], NO_MERGE)
    expect(scenes).toHaveLength(0)
  })
})

describe('mots-clés du dialogue', () => {
  it('détecte une mention, avec une confiance plus faible', () => {
    const scenes = detectFromSubtitles(
      [cue('[rats squeaking]', 100), cue('There are rats in the walls', 300)],
      ['rats'],
      NO_MERGE,
    )
    const sound = scenes.find((s) => s.evidence === 'sound-cue')
    const keyword = scenes.find((s) => s.evidence === 'keyword')
    expect(keyword).toBeDefined()
    // Parler d'un rat n'est pas en voir un : la protection reste, la confiance baisse.
    expect(keyword?.confidence).toBeLessThan(sound?.confidence as number)
  })

  it('détecte en français comme en anglais', () => {
    const scenes = detectFromSubtitles(
      [cue('Il y a des souris dans le grenier', 10)],
      ['rats'],
      NO_MERGE,
    )
    expect(scenes).toHaveLength(1)
  })

  it('ne se déclenche pas sur un mot qui contient seulement la racine', () => {
    const scenes = detectFromSubtitles(
      [cue('On mange une ratatouille', 10), cue('Elle a souri', 20)],
      ['rats'],
      NO_MERGE,
    )
    expect(scenes).toHaveLength(0)
  })
})

describe('marges et fusion', () => {
  it('applique une marge de 2 s par défaut', () => {
    const [scene] = detectFromSubtitles([cue('[rats]', 100, 104)], ['rats'])
    expect(scene).toMatchObject({ start: 98, end: 106 })
  })

  it('ne fait pas passer un début avant le début du film', () => {
    const [scene] = detectFromSubtitles([cue('[rats]', 1, 2)], ['rats'])
    expect(scene?.start).toBe(0)
  })

  it('fusionne des détections rapprochées en une seule scène', () => {
    const scenes = detectFromSubtitles(
      [cue('[rats]', 100, 102), cue('[squeaking]', 105, 107), cue('[scurrying]', 110, 112)],
      ['rats'],
    )
    expect(scenes).toHaveLength(1)
    expect(scenes[0]).toMatchObject({ start: 98, end: 114 })
  })

  it('renforce la confiance quand plusieurs indices se rejoignent', () => {
    const single = detectFromSubtitles([cue('[rats]', 100, 102)], ['rats'])
    const several = detectFromSubtitles(
      [cue('[rats]', 100, 102), cue('[squeaking]', 105, 107)],
      ['rats'],
    )
    expect(several[0]?.confidence).toBeGreaterThan(single[0]?.confidence as number)
  })

  it('ne dépasse jamais 0,95 — seule la foule peut confirmer', () => {
    const many = Array.from({ length: 30 }, (_, i) => cue('[rats squeaking]', 100 + i * 3))
    const scenes = detectFromSubtitles(many, ['rats'])
    expect(scenes[0]?.confidence).toBeLessThanOrEqual(0.95)
  })

  it('ne fusionne pas deux scènes éloignées', () => {
    const scenes = detectFromSubtitles([cue('[rats]', 100), cue('[rats]', 500)], ['rats'])
    expect(scenes).toHaveLength(2)
  })

  it('ne fusionne pas des phobies différentes', () => {
    const scenes = detectFromSubtitles(
      [cue('[rats squeaking]', 100), cue('[spider skittering]', 103)],
      ['rats', 'spiders'],
    )
    expect(scenes).toHaveLength(2)
    expect(scenes.map((s) => s.phobia).sort()).toEqual(['rats', 'spiders'])
  })
})

describe('sélection des phobies', () => {
  it('ne cherche que les phobies demandées', () => {
    const cues = [cue('[rats squeaking]', 100), cue('[spider skittering]', 300)]
    expect(detectFromSubtitles(cues, ['rats'])).toHaveLength(1)
    expect(detectFromSubtitles(cues, ['rats', 'spiders'])).toHaveLength(2)
  })

  it('accepte une phobie désactivée — le batch prépare les données avant le client', () => {
    const scenes = detectFromSubtitles([cue('[hissing]', 100)], ['snakes'])
    expect(scenes).toHaveLength(1)
  })

  it('ignore un identifiant inconnu', () => {
    expect(detectFromSubtitles([cue('[rats]', 100)], ['dragons'])).toEqual([])
    expect(detectFromSubtitles([cue('[rats]', 100)], [])).toEqual([])
  })

  it('ne renvoie rien sur des sous-titres sans indice', () => {
    const scenes = detectFromSubtitles(
      [cue('Bonjour, comment vas-tu ?', 10), cue('[musique]', 20)],
      ['rats', 'spiders'],
    )
    expect(scenes).toEqual([])
  })
})
