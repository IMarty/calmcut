import { describe, expect, it } from 'vitest'
import { detectFromSubtitles, mentionsInSubtitles, type DetectableCue } from './detect.js'

/**
 * Régression sur les faux positifs observés lors d'un test manuel.
 *
 * Neuf détections, neuf faux positifs, pour quatre causes distinctes. Ce fichier
 * les reproduit toutes — et vérifie qu'aucune ne produit plus de protection.
 *
 * **Les répliques sont paraphrasées, pas copiées.** Le principe 1 interdit de
 * conserver du texte de sous-titres, et ce dépôt est public : recopier neuf
 * répliques d'un film serait précisément la fuite qu'on s'interdit. Chaque
 * paraphrase reproduit le piège linguistique, sans reprendre l'œuvre.
 */

const cue = (text: string, start: number): DetectableCue => ({ text, start, end: start + 2 })

describe('piège 1 — homographe : « souris » est aussi un verbe', () => {
  const cues = [
    cue('Pourquoi est-ce que tu souris comme ça ?', 195),
    cue('Je souris parce que tout va bien.', 200),
    cue('Arrête de sourire, ce n’est pas drôle.', 205),
  ]

  it('ne produit aucune scène', () => {
    expect(detectFromSubtitles(cues, ['rats'])).toEqual([])
  })

  it('ne produit même pas de mention', () => {
    expect(mentionsInSubtitles(cues, ['rats'])).toEqual([])
  })
})

describe('piège 2 — frontière de mot ASCII : « raté » contient « rat »', () => {
  const cues = [
    cue('Ai-je raté quelque chose d’important ?', 1248),
    cue('J’ai raté la dernière partie.', 1260),
    cue('Une occasion ratée, voilà tout.', 1270),
    cue('Il a posé le râteau contre le mur.', 1280),
  ]

  it('ne produit aucune scène', () => {
    // `\b` en JavaScript est ASCII : `/\brat\b/` reconnaît « raté », parce que
    // « é » n'est pas un caractère de mot ASCII. Les profils utilisent désormais
    // des frontières Unicode explicites.
    expect(detectFromSubtitles(cues, ['rats'])).toEqual([])
  })

  it('ne produit aucune mention', () => {
    expect(mentionsInSubtitles(cues, ['rats'])).toEqual([])
  })
})

describe('piège 3 — mention : on parle de la bête, elle n’est pas là', () => {
  const cues = [
    cue('Quand je suis au laboratoire avec mes souris, je suis bien.', 730),
    cue('Ça me fait du bien de parler à des souris.', 1004),
    cue('Tu passais tout ce temps seul avec les souris.', 2092),
    cue('Il paraît qu’il y avait une araignée sur son bureau.', 2742),
    cue('Tu as très bien raconté l’histoire de l’araignée.', 2962),
  ]

  it('NE PRODUIT AUCUNE SCÈNE — c’est le cœur de la leçon', () => {
    // Le dialogue parle constamment de choses que la caméra ne montre pas.
    // Protéger sur une mention, c'est protéger presque tout le temps pour rien.
    expect(detectFromSubtitles(cues, ['rats', 'spiders'])).toEqual([])
  })

  it('produit en revanche une mention au niveau du titre', () => {
    // Cette information est vraie et utile — « ce film parle de rats et
    // d'araignées » — mais elle ne dit pas QUAND, donc elle ne protège rien.
    const mentions = mentionsInSubtitles(cues, ['rats', 'spiders'])
    expect(mentions.map((m) => m.phobia).sort()).toEqual(['rats', 'spiders'])
    expect(mentions.find((m) => m.phobia === 'rats')?.count).toBe(3)
    expect(mentions.find((m) => m.phobia === 'spiders')?.count).toBe(2)
  })
})

describe('piège 4 — indication sonore décrivant un humain', () => {
  it('ne retient pas une forme conjuguée avec complément', () => {
    // « [couine avec enthousiasme] » décrit une personne. Les profils n'acceptent
    // que des formes nominales : `couinements`, jamais `couine`.
    const cues = [cue('Oh ! [couine avec enthousiasme] Enfin.', 3810)]
    expect(detectFromSubtitles(cues, ['rats'])).toEqual([])
  })

  it('ne retient pas un rire ou un soupir humain', () => {
    const cues = [cue('[il glousse]', 100), cue('[soupir]', 200), cue('[rires]', 300)]
    expect(detectFromSubtitles(cues, ['rats', 'spiders'])).toEqual([])
  })
})

describe('ce qui doit toujours être détecté', () => {
  it('reconnaît une indication sonore nominale', () => {
    const scenes = detectFromSubtitles([cue('[couinements]', 4300)], ['rats'])
    expect(scenes).toHaveLength(1)
    expect(scenes[0]?.evidence).toBe('sound-cue')
  })

  it('reconnaît une indication sonore anglaise', () => {
    expect(detectFromSubtitles([cue('[rats squeaking]', 4300)], ['rats'])).toHaveLength(1)
    expect(detectFromSubtitles([cue('[scurrying]', 4300)], ['rats'])).toHaveLength(1)
  })

  it('reconnaît la bête nommée entre crochets', () => {
    expect(
      detectFromSubtitles([cue('[une souris traverse la pièce]', 500)], ['rats']),
    ).toHaveLength(1)
  })

  it('reconnaît des grattements dans le mur', () => {
    expect(detectFromSubtitles([cue('[grattements dans le mur]', 700)], ['rats'])).toHaveLength(1)
  })

  it('ne confond pas les phobies', () => {
    const scenes = detectFromSubtitles([cue('[couinements]', 100)], ['spiders'])
    expect(scenes).toEqual([])
  })
})

describe('bilan sur le film testé', () => {
  it('les neuf faux positifs sont tous éliminés, et rien n’est protégé à tort', () => {
    const cues = [
      cue('Pourquoi est-ce que tu souris comme ça ?', 195),
      cue('Quand je suis au laboratoire avec mes souris, je suis bien.', 730),
      cue('Ça me fait du bien de parler à des souris.', 1004),
      cue('Ai-je raté quelque chose d’important ?', 1248),
      cue('J’ai raté la dernière partie.', 1260),
      cue('Tu passais tout ce temps seul avec les souris.', 2092),
      cue('Il paraît qu’il y avait une araignée sur son bureau.', 2742),
      cue('Tu as très bien raconté l’histoire de l’araignée.', 2962),
      cue('Oh ! [couine avec enthousiasme] Enfin.', 3810),
    ]
    expect(detectFromSubtitles(cues, ['rats', 'spiders'])).toEqual([])
  })
})
