/**
 * Langue de la bande-son.
 *
 * C'est le paramètre le plus important du compagnon, et le plus facile à oublier :
 * Whisper à qui l'on ne dit rien transcrit en anglais. Un film français transcrit
 * en anglais ne produit **aucun** trigramme concordant avec des sous-titres
 * français — le verrouillage devient impossible par construction, et l'interface
 * reste indéfiniment « à l'écoute » sans expliquer pourquoi.
 *
 * Trois garde-fous, dans cet ordre :
 *
 * 1. une estimation à partir du texte des sous-titres, qui est la meilleure source
 *    disponible puisque c'est exactement le texte qu'on cherche à retrouver ;
 * 2. un repli sur la langue du navigateur ;
 * 3. **un sélecteur que l'utilisateur peut corriger**, parce qu'une détection
 *    silencieuse qui se trompe est précisément ce qui vient d'arriver.
 */

/** Langues proposées. Whisper en gère bien d'autres ; celles-ci sont testées. */
export const LANGUAGES = [
  { code: 'fr', whisper: 'french', label: 'Français' },
  { code: 'en', whisper: 'english', label: 'English' },
  { code: 'es', whisper: 'spanish', label: 'Español' },
  { code: 'de', whisper: 'german', label: 'Deutsch' },
  { code: 'it', whisper: 'italian', label: 'Italiano' },
  { code: 'pt', whisper: 'portuguese', label: 'Português' },
  { code: 'nl', whisper: 'dutch', label: 'Nederlands' },
  { code: 'ja', whisper: 'japanese', label: '日本語' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]))

/** Nom attendu par Whisper pour un code ISO. */
export const whisperLanguage = (code: string): string =>
  BY_CODE.get(code as LanguageCode)?.whisper ?? 'english'

export const isLanguageCode = (value: string): value is LanguageCode =>
  BY_CODE.has(value as LanguageCode)

/**
 * Mots très fréquents et discriminants, par langue.
 *
 * On compte les occurrences de mots entiers : c'est grossier, mais sur plusieurs
 * centaines de répliques de sous-titres c'est largement suffisant, et cela ne
 * coûte ni dépendance ni téléchargement.
 */
const MARKERS: Record<LanguageCode, readonly string[]> = {
  fr: [
    'le',
    'la',
    'les',
    'de',
    'des',
    'du',
    'et',
    'est',
    'un',
    'une',
    'pas',
    'que',
    'qui',
    'pour',
    'vous',
    'je',
    'il',
    'elle',
    'ne',
    'ce',
  ],
  en: [
    'the',
    'and',
    'is',
    'to',
    'of',
    'you',
    'that',
    'it',
    'not',
    'for',
    'with',
    'this',
    'have',
    'was',
    'are',
    'what',
    'we',
    'he',
    'she',
    'my',
  ],
  es: [
    'el',
    'la',
    'los',
    'las',
    'de',
    'que',
    'no',
    'un',
    'una',
    'por',
    'con',
    'para',
    'esta',
    'como',
    'pero',
    'yo',
    'te',
    'se',
    'muy',
    'esto',
  ],
  de: [
    'der',
    'die',
    'das',
    'und',
    'ist',
    'nicht',
    'ein',
    'eine',
    'ich',
    'du',
    'sie',
    'wir',
    'mit',
    'auf',
    'für',
    'was',
    'aber',
    'sich',
    'dass',
    'noch',
  ],
  it: [
    'il',
    'la',
    'le',
    'di',
    'che',
    'non',
    'un',
    'una',
    'per',
    'con',
    'sono',
    'questo',
    'come',
    'ma',
    'io',
    'mi',
    'ti',
    'si',
    'anche',
    'più',
  ],
  pt: [
    'o',
    'a',
    'os',
    'as',
    'de',
    'que',
    'nao',
    'um',
    'uma',
    'por',
    'com',
    'para',
    'isso',
    'como',
    'mas',
    'eu',
    'te',
    'se',
    'muito',
    'esta',
  ],
  nl: [
    'de',
    'het',
    'een',
    'en',
    'is',
    'niet',
    'van',
    'dat',
    'ik',
    'je',
    'we',
    'met',
    'voor',
    'maar',
    'wat',
    'ook',
    'zijn',
    'heb',
    'naar',
    'als',
  ],
  ja: ['です', 'ます', 'した', 'ない', 'この', 'それ', 'ある', 'いる', 'から', 'まで'],
}

/** Normalisation minimale : minuscules, sans accent, ponctuation en espaces. */
const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')

export interface LanguageGuess {
  readonly code: LanguageCode
  /** 0→1. Faible veut dire « demande à l'utilisateur ». */
  readonly confidence: number
}

/**
 * Estime la langue d'un texte de sous-titres.
 *
 * Renvoie toujours une réponse, éventuellement peu sûre : c'est à l'appelant de
 * décider s'il la présente comme un choix à confirmer.
 */
export const guessLanguage = (text: string): LanguageGuess => {
  const words = normalize(text)
    .split(/\s+/)
    .filter((w) => w !== '')
  if (words.length === 0) return { code: 'en', confidence: 0 }

  const counts = new Map<string, number>()
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)

  let best: LanguageGuess = { code: 'en', confidence: 0 }
  let total = 0
  const scores = new Map<LanguageCode, number>()

  for (const [code, markers] of Object.entries(MARKERS) as [LanguageCode, readonly string[]][]) {
    let score = 0
    for (const marker of markers) score += counts.get(marker) ?? 0
    // Le japonais n'est pas segmenté par espaces : on compte les sous-chaînes.
    if (code === 'ja') {
      const raw = text
      for (const marker of markers) score += raw.split(marker).length - 1
    }
    scores.set(code, score)
    total += score
  }

  for (const [code, score] of scores) {
    const confidence = total === 0 ? 0 : score / total
    if (confidence > best.confidence) best = { code, confidence }
  }

  return best
}

/** Langue du navigateur, si elle fait partie de celles qu'on propose. */
export const browserLanguage = (): LanguageCode | undefined => {
  const raw = typeof navigator === 'undefined' ? undefined : navigator.language
  const code = raw?.split('-')[0]?.toLowerCase()
  return code !== undefined && isLanguageCode(code) ? code : undefined
}
