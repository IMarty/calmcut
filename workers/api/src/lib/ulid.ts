/**
 * ULID : 26 caractères, triable par date de création, imprévisible.
 *
 * Choisi plutôt qu'un entier auto-incrémenté parce qu'un identifiant séquentiel
 * s'énumère. §8.2 interdit tout endpoint de liste ; un `titleId` devinable rendrait
 * cette interdiction décorative.
 */

/** Base32 de Crockford : pas de I, L, O ni U — rien qui se confonde à la lecture. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TIME_CHARS = 10
const RANDOM_CHARS = 16

/** Temps maximal représentable sur 48 bits : an 10889. */
const MAX_TIME = 0xffffffffffff

const encodeTime = (time: number): string => {
  let value = time
  let out = ''
  for (let i = 0; i < TIME_CHARS; i += 1) {
    out = (ALPHABET[value % 32] as string) + out
    value = Math.floor(value / 32)
  }
  return out
}

const encodeRandom = (): string => {
  const bytes = new Uint8Array(RANDOM_CHARS)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) out += ALPHABET[byte % 32] as string
  return out
}

/** Génère un ULID. `now` en millisecondes, pour des tests déterministes. */
export const ulid = (now: number = Date.now()): string => {
  if (now < 0 || now > MAX_TIME) throw new RangeError(`horodatage ULID hors bornes : ${now}`)
  return encodeTime(Math.floor(now)) + encodeRandom()
}

/** Vrai si la chaîne a la forme d'un ULID. Ne garantit pas qu'il existe en base. */
export const isUlid = (value: string): boolean =>
  value.length === 26 && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value)
