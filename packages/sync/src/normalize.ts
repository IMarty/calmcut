/** Indications sonores et didascalies : `[rats squeaking]`, `(soupir)`, `{\an8}`. */
const BRACKETED = /\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g
/** Balises de style des sous-titres : `<i>`, `</b>`. */
const TAGS = /<[^>]*>/g
/** Nom de locuteur en tête de réplique : `JOHN:`, `- MRS SMITH :`. */
const SPEAKER = /(?:^|\n)\s*-?\s*[^\s:]{1,20}(?:\s+[^\s:]{1,20}){0,2}\s*:/g
/** Diacritiques combinants laissés par la décomposition NFD. */
const COMBINING_MARKS = /\p{Mn}/gu
/** Tout ce qui n'est ni lettre, ni chiffre, ni espace. */
const NON_WORD = /[^\p{L}\p{N}\s]/gu
const WHITESPACE = /\s+/g

/**
 * Normalise une réplique de sous-titre ou une transcription Whisper vers une
 * forme comparable : minuscules, sans accent, sans ponctuation, sans indication
 * sonore ni nom de locuteur.
 *
 * Le résultat n'est jamais conservé : il n'existe que le temps de produire des
 * hashes (principe 1 — aucun texte de sous-titre stocké).
 */
export const normalizeCueText = (raw: string): string =>
  raw
    .replace(TAGS, ' ')
    .replace(BRACKETED, ' ')
    .replace(SPEAKER, ' ')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_WORD, ' ')
    .replace(WHITESPACE, ' ')
    .trim()

/** Découpe un texte normalisé en mots. Renvoie un tableau vide si le texte est vide. */
export const words = (normalized: string): string[] =>
  normalized.length === 0 ? [] : normalized.split(' ')
