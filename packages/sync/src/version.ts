/**
 * Version de l'algorithme d'index de synchro.
 *
 * Tout changement de la normalisation, du découpage en trigrammes ou du hachage
 * doit incrémenter cette constante : le compagnon refuse un index dont la version
 * lui est inconnue, et le batch reconstruit les index devenus obsolètes (§4.1).
 */
export const SYNC_INDEX_VERSION = 1 as const
export type SyncIndexVersion = typeof SYNC_INDEX_VERSION
