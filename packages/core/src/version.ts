/**
 * Version du format public d'un titre (`{ v: 1, … }`, cf. docs/api.md).
 * Le compagnon et l'extension refusent un document dont la version est inconnue.
 */
export const TIMELINE_FORMAT_VERSION = 1 as const
export type TimelineFormatVersion = typeof TIMELINE_FORMAT_VERSION
