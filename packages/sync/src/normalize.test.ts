import { describe, expect, it } from 'vitest'
import { normalizeCueText, words } from './normalize.js'

describe('normalizeCueText', () => {
  it('met en minuscules et retire les accents', () => {
    expect(normalizeCueText('Élodie A ÇÀ Où')).toBe('elodie a ca ou')
  })

  it('retire les indications sonores entre crochets', () => {
    expect(normalizeCueText('[rats squeaking] Get out of here!')).toBe('get out of here')
  })

  it('retire les didascalies entre parenthèses et les balises de style', () => {
    expect(normalizeCueText('<i>(soupir)</i> Je descends.')).toBe('je descends')
  })

  it('retire les balises de positionnement ASS', () => {
    expect(normalizeCueText('{\\an8}Attention derrière toi')).toBe('attention derriere toi')
  })

  it('retire le nom du locuteur en tête de réplique', () => {
    expect(normalizeCueText('JOHN: Where are we going?')).toBe('where are we going')
    expect(normalizeCueText('- MRS SMITH : Par ici.')).toBe('par ici')
  })

  it('normalise la ponctuation et les espaces', () => {
    expect(normalizeCueText("  Qu'est-ce que   c'est ?!  ")).toBe('qu est ce que c est')
  })

  it('renvoie une chaîne vide pour une réplique purement sonore', () => {
    expect(normalizeCueText('[MUSIQUE]')).toBe('')
    expect(normalizeCueText('   ')).toBe('')
  })

  it('produit la même sortie pour un sous-titre et une transcription équivalente', () => {
    const subtitle = '<i>- JOHN:</i> There are rats in the walls!'
    const whisper = 'there are rats in the walls'
    expect(normalizeCueText(subtitle)).toBe(normalizeCueText(whisper))
  })
})

describe('words', () => {
  it('découpe un texte normalisé', () => {
    expect(words('there are rats')).toEqual(['there', 'are', 'rats'])
  })

  it('renvoie un tableau vide pour une chaîne vide', () => {
    expect(words('')).toEqual([])
  })
})
