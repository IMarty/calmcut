/**
 * FNV-1a 32 bits sur les octets UTF-8 de l'entrée.
 *
 * L'encodage UTF-8 est fait à la main plutôt qu'avec `TextEncoder` : ce paquet ne
 * suppose aucun environnement d'exécution (navigateur, Worker, Bun, Node, et plus
 * tard la JVM Android), et l'algorithme doit rester assez simple pour être
 * réimplémenté à l'identique dans un autre langage — un hash divergent rendrait
 * tous les index de synchro inutilisables.
 */
export const hash32 = (input: string): number => {
  let h = 0x811c9dc5

  const mix = (byte: number): void => {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }

  // `for…of` itère par point de code : les paires de substitution sont déjà recombinées.
  for (const char of input) {
    const cp = char.codePointAt(0) as number
    if (cp < 0x80) {
      mix(cp)
    } else if (cp < 0x800) {
      mix(0xc0 | (cp >> 6))
      mix(0x80 | (cp & 0x3f))
    } else if (cp < 0x10000) {
      mix(0xe0 | (cp >> 12))
      mix(0x80 | ((cp >> 6) & 0x3f))
      mix(0x80 | (cp & 0x3f))
    } else {
      mix(0xf0 | (cp >> 18))
      mix(0x80 | ((cp >> 12) & 0x3f))
      mix(0x80 | ((cp >> 6) & 0x3f))
      mix(0x80 | (cp & 0x3f))
    }
  }

  return h >>> 0
}
