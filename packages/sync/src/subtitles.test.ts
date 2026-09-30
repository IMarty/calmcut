import { describe, expect, it } from 'vitest'
import { parseSubtitles } from './subtitles.js'

describe('SRT', () => {
  const srt = `1
00:00:12,000 --> 00:00:14,500
Il y a quelque chose dans le mur.

2
00:01:05,250 --> 00:01:07,000
- Tu l'entends ?
- Depuis une heure.

3
00:02:00,000 --> 00:02:03,000
[grattements]
`

  const cues = parseSubtitles(srt)

  it('lit toutes les répliques', () => {
    expect(cues).toHaveLength(3)
  })

  it('convertit les horaires en secondes', () => {
    expect(cues[0]).toEqual({
      text: 'Il y a quelque chose dans le mur.',
      start: 12,
      end: 14.5,
    })
  })

  it('joint les lignes multiples d’une même réplique', () => {
    expect(cues[1]?.text).toBe("- Tu l'entends ? - Depuis une heure.")
    expect(cues[1]?.start).toBe(65.25)
  })

  it('conserve les indications sonores — c’est le batch qui les exploite', () => {
    expect(cues[2]?.text).toBe('[grattements]')
  })
})

describe('WebVTT', () => {
  const vtt = `WEBVTT

NOTE Un commentaire à ignorer

00:12.000 --> 00:14.500 align:start line:90%
Il y a quelque chose dans le mur.

cue-2
01:05.250 --> 01:07.000
Tu l'entends ?
`

  const cues = parseSubtitles(vtt)

  it('accepte les horaires sans heure et le séparateur décimal point', () => {
    expect(cues).toHaveLength(2)
    expect(cues[0]?.start).toBe(12)
    expect(cues[0]?.end).toBe(14.5)
  })

  it('ignore les réglages de positionnement en fin de ligne', () => {
    expect(cues[0]?.text).toBe('Il y a quelque chose dans le mur.')
  })

  it('ignore l’en-tête, les notes et les identifiants de cue', () => {
    expect(cues.map((c) => c.text)).not.toContain('WEBVTT')
    expect(cues[1]?.text).toBe("Tu l'entends ?")
  })
})

describe('robustesse', () => {
  it('trie les répliques par instant de début', () => {
    const disordered = `1
00:00:30,000 --> 00:00:32,000
Deuxieme

2
00:00:10,000 --> 00:00:12,000
Premiere
`
    expect(parseSubtitles(disordered).map((c) => c.text)).toEqual(['Premiere', 'Deuxieme'])
  })

  it('saute une réplique sans texte plutôt que de la compter', () => {
    const empty = `1
00:00:10,000 --> 00:00:12,000

2
00:00:20,000 --> 00:00:22,000
Du texte
`
    expect(parseSubtitles(empty).map((c) => c.text)).toEqual(['Du texte'])
  })

  it('saute une réplique dont la fin précède le début', () => {
    const backwards = `1
00:00:30,000 --> 00:00:10,000
Impossible

2
00:00:40,000 --> 00:00:42,000
Correct
`
    expect(parseSubtitles(backwards).map((c) => c.text)).toEqual(['Correct'])
  })

  it('retire un BOM en tête de fichier', () => {
    const withBom = `\uFEFF1
00:00:10,000 --> 00:00:12,000
Du texte
`
    expect(parseSubtitles(withBom)).toHaveLength(1)
  })

  it('accepte les fins de ligne Windows et Mac classiques', () => {
    const crlf = '1\r\n00:00:10,000 --> 00:00:12,000\r\nDu texte\r\n'
    const cr = '1\r00:00:10,000 --> 00:00:12,000\rDu texte\r'
    expect(parseSubtitles(crlf)).toHaveLength(1)
    expect(parseSubtitles(cr)).toHaveLength(1)
  })

  it('accepte les horaires longs, au-delà de dix heures', () => {
    const long = `1
10:00:00,000 --> 10:00:02,000
Tres long metrage
`
    expect(parseSubtitles(long)[0]?.start).toBe(36000)
  })

  it('complète une fraction de seconde écrite sur un ou deux chiffres', () => {
    const short = `1
00:00:10,5 --> 00:00:12,25
Du texte
`
    expect(parseSubtitles(short)[0]).toMatchObject({ start: 10.5, end: 12.25 })
  })

  it('ne renvoie rien pour un fichier qui n’est pas des sous-titres', () => {
    expect(parseSubtitles('')).toEqual([])
    expect(parseSubtitles('Ceci est un roman, pas un fichier de sous-titres.')).toEqual([])
    expect(parseSubtitles('{"json": true}')).toEqual([])
  })

  it('n’avale pas la réplique suivante quand le texte manque', () => {
    const missing = `1
00:00:10,000 --> 00:00:12,000
2
00:00:20,000 --> 00:00:22,000
Du texte
`
    const cues = parseSubtitles(missing)
    expect(cues).toHaveLength(1)
    expect(cues[0]).toMatchObject({ text: 'Du texte', start: 20 })
  })
})
