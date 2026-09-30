import { describe, expect, it } from 'vitest'
import { hash32 } from './hash.js'
import { hashTrigrams, wordTrigrams } from './trigrams.js'

describe('wordTrigrams', () => {
  it('produit une fenêtre glissante de trois mots', () => {
    expect(wordTrigrams('there are rats in the walls')).toEqual([
      'there are rats',
      'are rats in',
      'rats in the',
      'in the walls',
    ])
  })

  it('ne produit rien sous trois mots', () => {
    expect(wordTrigrams('deux mots')).toEqual([])
    expect(wordTrigrams('')).toEqual([])
  })

  it('produit exactement un trigramme pour trois mots', () => {
    expect(wordTrigrams('trois petits mots')).toEqual(['trois petits mots'])
  })
})

describe('hash32', () => {
  it('est déterministe', () => {
    expect(hash32('rats in the')).toBe(hash32('rats in the'))
  })

  it('reste dans les 32 bits non signés', () => {
    for (const input of ['', 'a', 'les rats sont là', '🐀 dans le mur']) {
      const h = hash32(input)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('correspond aux vecteurs de référence FNV-1a 32 bits', () => {
    expect(hash32('')).toBe(0x811c9dc5)
    expect(hash32('a')).toBe(0xe40c292c)
    expect(hash32('foobar')).toBe(0xbf9cf968)
  })

  it('distingue des entrées proches', () => {
    expect(hash32('rats in the')).not.toBe(hash32('rats in he'))
  })
})

describe('hashTrigrams', () => {
  const line = '[squeaking] JOHN: There are rats in the walls!'

  it('hash le texte normalisé, pas le texte brut', () => {
    expect(hashTrigrams(line, 'salt')).toEqual(hashTrigrams('there are rats in the walls', 'salt'))
  })

  it('donne des hashes différents selon le titre', () => {
    expect(hashTrigrams(line, 'title-a')).not.toEqual(hashTrigrams(line, 'title-b'))
  })

  it('produit autant de hashes que de trigrammes', () => {
    expect(hashTrigrams(line, 'salt')).toHaveLength(4)
  })

  it('ne produit rien pour une réplique purement sonore', () => {
    expect(hashTrigrams('[MUSIQUE]', 'salt')).toEqual([])
  })
})
