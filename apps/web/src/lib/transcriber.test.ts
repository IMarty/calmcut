import { describe, expect, it } from 'vitest'
import { sanitizeChunks, type WhisperChunk } from './transcriber.js'

/**
 * Whisper travaille sur des fenêtres de 30 secondes et complète par du silence ce
 * qu'on ne lui donne pas. Il lui arrive alors de placer du texte dans ce silence,
 * bien après la fin de l'audio réel.
 *
 * Accepter un tel horodatage décale l'ancre d'autant, et la position estimée
 * devient fausse de plusieurs dizaines de secondes — ce qui décale toutes les
 * protections. C'est le genre d'erreur qui fait passer le rat.
 */

const chunk = (text: string, start: number | undefined): WhisperChunk => ({
  text,
  timestamp: [start, undefined],
})

const WINDOW = 8

describe('sanitizeChunks', () => {
  it('garde les segments qui tombent dans l’audio fourni', () => {
    const segments = sanitizeChunks(
      [chunk('premiere replique', 0), chunk('deuxieme replique', 3.5), chunk('troisieme', 7.9)],
      WINDOW,
    )
    expect(segments.map((s) => s.start)).toEqual([0, 3.5, 7.9])
  })

  it('REJETTE un segment placé après la fin de l’audio', () => {
    // Une fenêtre de 8 s ne peut pas contenir une réplique à 25 s : Whisper a
    // halluciné dans le silence de remplissage.
    const segments = sanitizeChunks([chunk('hallucination', 25)], WINDOW)
    expect(segments).toEqual([])
  })

  it('rejette un segment avant le début', () => {
    expect(sanitizeChunks([chunk('impossible', -3)], WINDOW)).toEqual([])
  })

  it('ne garde que les segments valides d’un lot mixte', () => {
    const segments = sanitizeChunks(
      [
        chunk('bonne replique', 2),
        chunk('hallucination tardive', 22),
        chunk('autre bonne replique', 6),
        chunk('encore une hallucination', 29.5),
      ],
      WINDOW,
    )
    expect(segments.map((s) => s.text)).toEqual(['bonne replique', 'autre bonne replique'])
  })

  it('tolère l’arrondi de Whisper aux bornes', () => {
    // Whisper arrondit au 1/50ᵉ de seconde : un segment à 8,1 s sur une fenêtre
    // de 8 s est un arrondi, pas une hallucination.
    const segments = sanitizeChunks([chunk('juste a la fin', 8.1)], WINDOW)
    expect(segments).toHaveLength(1)
    expect(segments[0]?.start).toBeLessThanOrEqual(WINDOW)
  })

  it('ramène un horodatage limite dans l’intervalle', () => {
    const segments = sanitizeChunks([chunk('limite', -0.1)], WINDOW)
    expect(segments[0]?.start).toBe(0)
  })

  it('ignore un segment sans texte', () => {
    expect(sanitizeChunks([chunk('', 2), chunk('   ', 3)], WINDOW)).toEqual([])
  })

  it('ignore un segment sans horodatage exploitable', () => {
    expect(sanitizeChunks([chunk('du texte', undefined)], WINDOW)).toEqual([])
    expect(sanitizeChunks([{ text: 'du texte', timestamp: [] }], WINDOW)).toEqual([])
    expect(sanitizeChunks([{ text: 'du texte' }], WINDOW)).toEqual([])
  })

  it('ignore un horodatage non fini', () => {
    expect(sanitizeChunks([chunk('du texte', Number.NaN)], WINDOW)).toEqual([])
    expect(sanitizeChunks([chunk('du texte', Number.POSITIVE_INFINITY)], WINDOW)).toEqual([])
  })

  it('accepte une liste vide', () => {
    expect(sanitizeChunks([], WINDOW)).toEqual([])
  })
})
