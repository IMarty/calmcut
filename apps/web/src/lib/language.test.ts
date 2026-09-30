import { describe, expect, it } from 'vitest'
import { guessLanguage, isLanguageCode, LANGUAGES, whisperLanguage } from './language.js'

const FR = `
Il y a quelque chose dans le mur du grenier.
Tu l'entends ? Depuis une heure, je n'arrive pas à dormir.
Ce n'est pas le vent, et ce n'est pas la maison qui craque.
Je descends voir. Ne me suis pas, reste ici avec la lampe.
La porte du fond est fermée, mais elle n'était pas fermée hier.
`

const EN = `
There is something in the wall of the attic.
Can you hear it? For an hour now, I have not been able to sleep.
It is not the wind, and it is not the house settling.
I am going down to look. Do not follow me, stay here with the lamp.
The door at the back is closed, but it was not closed yesterday.
`

const ES = `
Hay algo en la pared del desván.
¿Lo oyes? Desde hace una hora no puedo dormir.
No es el viento, y no es la casa que cruje.
Voy a bajar a ver. No me sigas, quédate aquí con la lámpara.
La puerta del fondo está cerrada, pero no estaba cerrada ayer.
`

const DE = `
Da ist etwas in der Wand auf dem Dachboden.
Hörst du das? Seit einer Stunde kann ich nicht schlafen.
Das ist nicht der Wind, und das ist nicht das Haus.
Ich gehe nach unten und schaue. Folge mir nicht, bleib hier mit der Lampe.
Die Tür hinten ist zu, aber sie war gestern nicht zu.
`

describe('guessLanguage', () => {
  it('reconnaît le français', () => {
    expect(guessLanguage(FR).code).toBe('fr')
  })

  it('reconnaît l’anglais', () => {
    expect(guessLanguage(EN).code).toBe('en')
  })

  it('reconnaît l’espagnol', () => {
    expect(guessLanguage(ES).code).toBe('es')
  })

  it('reconnaît l’allemand', () => {
    expect(guessLanguage(DE).code).toBe('de')
  })

  it('ne confond pas français et anglais', () => {
    // C'est exactement la confusion qui a fait échouer le premier test du POC.
    const fr = guessLanguage(FR)
    const en = guessLanguage(EN)
    expect(fr.code).toBe('fr')
    expect(en.code).toBe('en')
    expect(fr.confidence).toBeGreaterThan(0.4)
    expect(en.confidence).toBeGreaterThan(0.4)
  })

  it('reste insensible aux accents et à la ponctuation', () => {
    const stripped = FR.normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      .replace(/[^\p{L}\s]/gu, ' ')
    expect(guessLanguage(stripped).code).toBe('fr')
  })

  it('annonce une confiance faible sur un texte sans marqueur', () => {
    const guess = guessLanguage('01JBQ 4331 4339 xyzzy')
    expect(guess.confidence).toBeLessThan(0.5)
  })

  it('ne jette pas sur une entrée vide', () => {
    expect(guessLanguage('').confidence).toBe(0)
    expect(guessLanguage('   ').confidence).toBe(0)
  })
})

describe('correspondance avec Whisper', () => {
  it('traduit un code ISO en nom attendu par Whisper', () => {
    expect(whisperLanguage('fr')).toBe('french')
    expect(whisperLanguage('en')).toBe('english')
    expect(whisperLanguage('ja')).toBe('japanese')
  })

  it('retombe sur l’anglais pour un code inconnu — jamais undefined', () => {
    // Un `language` absent est exactement ce qui a fait transcrire un film
    // français en anglais : on préfère une valeur explicite, même imparfaite.
    expect(whisperLanguage('xx')).toBe('english')
    expect(whisperLanguage('')).toBe('english')
  })

  it('déclare un nom Whisper pour chaque langue proposée', () => {
    for (const language of LANGUAGES) {
      expect(whisperLanguage(language.code)).toBe(language.whisper)
      expect(isLanguageCode(language.code)).toBe(true)
    }
  })

  it('rejette ce qui n’est pas un code proposé', () => {
    expect(isLanguageCode('kl')).toBe(false)
    expect(isLanguageCode('FR')).toBe(false)
  })
})
