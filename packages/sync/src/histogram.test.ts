import { describe, expect, it } from 'vitest'
import { estimateOffset, hearSegments, type HeardTrigram } from './histogram.js'
import { buildIndexFromCues, parseSyncIndex, type SubtitleCue } from './index-format.js'

const SALT = 'title-histogram'

const cues: SubtitleCue[] = [
  { text: 'le gardien a trouve la porte du fond', start: 100 },
  { text: 'ma soeur refuse de voir ce vieux carnet', start: 106 },
  { text: 'cet homme attendait les traces dans la neige', start: 112 },
  { text: 'la voisine a compris une lettre sans timbre', start: 118 },
]

const index = parseSyncIndex(buildIndexFromCues(cues, SALT))

/** Ce que le client entend si le film a démarré `offset` secondes avant l'horloge locale. */
const heardAt = (offset: number, which: readonly number[] = [0, 1, 2]) =>
  hearSegments(
    which.map((i) => ({
      text: (cues[i] as SubtitleCue).text,
      start: (cues[i] as SubtitleCue).start - offset,
    })),
    SALT,
  )

describe('estimateOffset', () => {
  it('retrouve exactement un décalage constant', () => {
    const estimate = estimateOffset(heardAt(90), index)
    expect(estimate?.offset).toBeCloseTo(90, 6)
    expect(estimate?.spread).toBeCloseTo(0, 6)
  })

  it('retrouve un décalage négatif', () => {
    expect(estimateOffset(heardAt(-37.5), index)?.offset).toBeCloseTo(-37.5, 6)
  })

  it('compte les trigrammes concordants, pas les candidats', () => {
    // La première réplique porte 5 trigrammes ; trois répliques en portent bien plus.
    const estimate = estimateOffset(heardAt(90, [0]), index)
    expect(estimate?.support).toBe(hearSegments([{ text: cues[0]!.text, start: 0 }], SALT).length)
  })

  it('ne se laisse pas gonfler par une réplique qui se répète dans le film', () => {
    const repeated: SubtitleCue[] = [
      { text: 'il faut partir tout de suite', start: 50 },
      { text: 'il faut partir tout de suite', start: 200 },
      { text: 'il faut partir tout de suite', start: 900 },
    ]
    const repeatedIndex = parseSyncIndex(buildIndexFromCues(repeated, SALT))
    const heard = hearSegments([{ text: repeated[0]!.text, start: 0 }], SALT)

    const estimate = estimateOffset(heard, repeatedIndex)
    // Trois occurrences dans le film, mais un seul témoignage : le support ne
    // peut pas dépasser le nombre de trigrammes réellement entendus.
    expect(estimate?.support).toBe(heard.length)
  })

  it('renvoie undefined quand rien ne correspond', () => {
    const heard: HeardTrigram[] = [
      { hash: 1, at: 0 },
      { hash: 2, at: 1 },
    ]
    expect(estimateOffset(heard, index)).toBeUndefined()
  })

  it('renvoie undefined sur une entrée vide', () => {
    expect(estimateOffset([], index)).toBeUndefined()
  })

  it('tolère une erreur de segmentation sous la tolérance', () => {
    const heard = hearSegments(
      [
        { text: cues[0]!.text, start: 10 + 0.2 },
        { text: cues[1]!.text, start: 16 - 0.3 },
        { text: cues[2]!.text, start: 22 + 0.1 },
      ],
      SALT,
    )
    const estimate = estimateOffset(heard, index)
    expect(estimate).toBeDefined()
    // La médiane absorbe les erreurs de segmentation : l'estimation reste plus
    // proche de la vérité que la pire des erreurs d'entrée (0,3 s).
    expect(Math.abs((estimate?.offset as number) - 90)).toBeLessThan(0.3)
    expect(estimate?.support).toBeGreaterThanOrEqual(3)
  })

  it('isole le vrai décalage au milieu de correspondances parasites', () => {
    const vrai = heardAt(90)
    const parasites: HeardTrigram[] = [
      { hash: index.lookup.length, at: 0 },
      ...hearSegments([{ text: cues[3]!.text, start: -500 }], SALT),
    ]
    const estimate = estimateOffset([...parasites, ...vrai], index)
    expect(estimate?.offset).toBeCloseTo(90, 6)
  })

  it('élargit le regroupement quand la tolérance augmente', () => {
    const disperse = hearSegments(
      [
        { text: cues[0]!.text, start: 10 },
        { text: cues[1]!.text, start: 16 - 1.4 },
        { text: cues[2]!.text, start: 22 + 1.4 },
      ],
      SALT,
    )
    expect(estimateOffset(disperse, index, { tolerance: 0.5 })?.support).toBeLessThan(
      estimateOffset(disperse, index, { tolerance: 2 })?.support as number,
    )
  })
})

describe('hearSegments', () => {
  it('attribue à chaque trigramme le début de son segment', () => {
    const heard = hearSegments([{ text: 'le gardien a trouve la porte', start: 42 }], SALT)
    expect(heard.length).toBeGreaterThan(0)
    for (const trigram of heard) expect(trigram.at).toBe(42)
  })

  it('ignore un segment trop court pour porter un trigramme', () => {
    expect(hearSegments([{ text: 'oui', start: 0 }], SALT)).toEqual([])
  })

  it('ignore une transcription vide', () => {
    expect(hearSegments([{ text: '', start: 0 }], SALT)).toEqual([])
    expect(hearSegments([], SALT)).toEqual([])
  })
})
