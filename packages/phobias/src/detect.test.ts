import { describe, expect, it } from 'vitest'
import { detectFromSubtitles, mentionsInSubtitles, type DetectableCue } from './detect.js'

const cue = (text: string, start: number, end = start + 2): DetectableCue => ({ text, start, end })

const NO_MERGE = { mergeWithin: 0, margin: 0 }

describe('occurrences — indications sonores', () => {
  it('détecte une indication sonore SDH', () => {
    const scenes = detectFromSubtitles([cue('[rats squeaking]', 100)], ['rats'], NO_MERGE)
    expect(scenes).toHaveLength(1)
    expect(scenes[0]).toMatchObject({ phobia: 'rats', evidence: 'sound-cue', start: 100, end: 102 })
  })

  it('détecte une indication sonore en français', () => {
    expect(detectFromSubtitles([cue('[couinements]', 50)], ['rats'], NO_MERGE)).toHaveLength(1)
  })

  it('accepte les parenthèses autant que les crochets', () => {
    expect(detectFromSubtitles([cue('(grattements)', 50)], ['rats'], NO_MERGE)).toHaveLength(1)
  })

  it('traite une bête nommée entre crochets comme une occurrence', () => {
    expect(detectFromSubtitles([cue('[des rats]', 50)], ['rats'], NO_MERGE)).toHaveLength(1)
  })

  it('ne prend pas un mot du dialogue pour un bruit', () => {
    // Hors crochets, rien n'est une indication sonore.
    expect(detectFromSubtitles([cue('Tu as entendu ce couinement ?', 50)], ['rats'])).toEqual([])
  })

  it('n’accepte que les formes nominales', () => {
    // Une forme conjuguée décrit souvent une personne.
    expect(detectFromSubtitles([cue('[couine doucement]', 50)], ['rats'])).toEqual([])
    expect(detectFromSubtitles([cue('[couinements]', 50)], ['rats'])).toHaveLength(1)
  })
})

describe('mentions — le dialogue en parle', () => {
  it('ne produisent AUCUNE scène', () => {
    const cues = [
      cue('Il y a des rats dans les murs', 100),
      cue('Il y a des souris dans le grenier', 300),
    ]
    expect(detectFromSubtitles(cues, ['rats'])).toEqual([])
  })

  it('sont remontées au niveau du titre, avec leur nombre', () => {
    const cues = [
      cue('Il y a des rats dans les murs', 100),
      cue('Des souris, encore', 300),
      cue('Rien à signaler', 500),
    ]
    const mentions = mentionsInSubtitles(cues, ['rats'])
    expect(mentions).toHaveLength(1)
    expect(mentions[0]).toMatchObject({ phobia: 'rats', count: 2 })
    expect(mentions[0]?.cues).toEqual([0, 1])
  })

  it('classent les phobies de la plus évoquée à la moins évoquée', () => {
    const cues = [cue('des rats', 10), cue('des rats encore', 20), cue('une araignée', 30)]
    expect(mentionsInSubtitles(cues, ['rats', 'spiders']).map((m) => m.phobia)).toEqual([
      'rats',
      'spiders',
    ])
  })

  it('ignorent un homographe', () => {
    expect(mentionsInSubtitles([cue('Pourquoi tu souris ?', 10)], ['rats'])).toEqual([])
  })

  it('ignorent une frontière de mot accentuée', () => {
    expect(mentionsInSubtitles([cue('J’ai raté le train', 10)], ['rats'])).toEqual([])
  })

  it('ne renvoient rien pour une phobie non demandée', () => {
    expect(mentionsInSubtitles([cue('une araignée', 10)], ['rats'])).toEqual([])
  })
})

describe('marges et fusion', () => {
  it('applique une marge de 2 s par défaut', () => {
    const [scene] = detectFromSubtitles([cue('[rats]', 100, 104)], ['rats'])
    expect(scene).toMatchObject({ start: 98, end: 106 })
  })

  it('ne fait pas passer un début avant le début du film', () => {
    expect(detectFromSubtitles([cue('[rats]', 1, 2)], ['rats'])[0]?.start).toBe(0)
  })

  it('fusionne des occurrences rapprochées', () => {
    const scenes = detectFromSubtitles(
      [cue('[rats]', 100, 102), cue('[couinements]', 105, 107), cue('[grattements]', 110, 112)],
      ['rats'],
    )
    expect(scenes).toHaveLength(1)
    expect(scenes[0]).toMatchObject({ start: 98, end: 114 })
    expect(scenes[0]?.cues).toEqual([0, 1, 2])
  })

  it('renforce la confiance quand plusieurs indices se rejoignent', () => {
    const single = detectFromSubtitles([cue('[rats]', 100, 102)], ['rats'])
    const several = detectFromSubtitles(
      [cue('[rats]', 100, 102), cue('[couinements]', 105, 107)],
      ['rats'],
    )
    expect(several[0]?.confidence).toBeGreaterThan(single[0]?.confidence as number)
  })

  it('ne dépasse jamais 0,95 — seule la foule peut confirmer', () => {
    const many = Array.from({ length: 30 }, (_, i) => cue('[rats squeaking]', 100 + i * 3))
    expect(detectFromSubtitles(many, ['rats'])[0]?.confidence).toBeLessThanOrEqual(0.95)
  })

  it('ne fusionne pas deux occurrences éloignées', () => {
    expect(detectFromSubtitles([cue('[rats]', 100), cue('[rats]', 500)], ['rats'])).toHaveLength(2)
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

describe('indices des répliques déclenchantes', () => {
  it('désigne la réplique qui a déclenché la scène', () => {
    const scenes = detectFromSubtitles(
      [cue('Bonjour', 10), cue('[rats squeaking]', 100), cue('Au revoir', 500)],
      ['rats'],
      NO_MERGE,
    )
    expect(scenes[0]?.cues).toEqual([1])
  })

  it('ne renvoie AUCUN texte — seulement des indices', () => {
    const scenes = detectFromSubtitles([cue('[rats squeaking]', 100)], ['rats'], NO_MERGE)
    // Ce paquet est lu par calmcut-batch, où le texte des sous-titres doit être
    // jeté après traitement (principe 1).
    expect(JSON.stringify(scenes)).not.toContain('squeaking')
  })

  it('vaut aussi pour les mentions', () => {
    const mentions = mentionsInSubtitles([cue('des rats partout', 10)], ['rats'])
    expect(JSON.stringify(mentions)).not.toContain('rats partout')
    expect(mentions[0]?.cues).toEqual([0])
  })
})

describe('sélection des phobies', () => {
  it('ne cherche que les phobies demandées', () => {
    const cues = [cue('[rats squeaking]', 100), cue('[spider skittering]', 300)]
    expect(detectFromSubtitles(cues, ['rats'])).toHaveLength(1)
    expect(detectFromSubtitles(cues, ['rats', 'spiders'])).toHaveLength(2)
  })

  it('accepte une phobie désactivée — le batch prépare avant le client', () => {
    expect(detectFromSubtitles([cue('[sifflements]', 100)], ['snakes'])).toHaveLength(1)
  })

  it('ignore un identifiant inconnu', () => {
    expect(detectFromSubtitles([cue('[rats]', 100)], ['dragons'])).toEqual([])
    expect(detectFromSubtitles([cue('[rats]', 100)], [])).toEqual([])
    expect(mentionsInSubtitles([cue('des rats', 100)], ['dragons'])).toEqual([])
  })

  it('ne renvoie rien sur des sous-titres sans indice', () => {
    const cues = [cue('Bonjour, comment vas-tu ?', 10), cue('[musique]', 20)]
    expect(detectFromSubtitles(cues, ['rats', 'spiders'])).toEqual([])
    expect(mentionsInSubtitles(cues, ['rats', 'spiders'])).toEqual([])
  })
})
