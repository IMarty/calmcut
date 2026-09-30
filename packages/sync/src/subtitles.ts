import type { SubtitleCue } from './index-format.js'

/**
 * Lecture de fichiers de sous-titres, pour deux usages :
 *
 * - le **mode démo** du compagnon, où l'utilisateur fournit son propre `.srt` ;
 * - le **batch T1**, qui récupère des sous-titres SDH pour en tirer des segments
 *   et construire l'index de synchro.
 *
 * Dans les deux cas le texte est éphémère : il sert à produire des hashes et des
 * segments, puis il est jeté (principe 1).
 */

/** Une réplique complète, avec sa fin — utile au batch, qui borne ses segments. */
export interface TimedCue extends SubtitleCue {
  /** Secondes. */
  readonly end: number
}

/** `00:01:12,345` (SRT) ou `00:01:12.345` (VTT) ; l'heure est optionnelle en VTT. */
const TIMESTAMP = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/
const TIMING_LINE = new RegExp(`^\\s*${TIMESTAMP.source}\\s*-->\\s*${TIMESTAMP.source}(?:\\s+.*)?$`)

const toSeconds = (
  hours: string | undefined,
  minutes: string,
  seconds: string,
  fraction: string,
): number =>
  Number(hours ?? 0) * 3600 +
  Number(minutes) * 60 +
  Number(seconds) +
  Number(fraction.padEnd(3, '0')) / 1000

/**
 * Lit un fichier SRT ou WebVTT.
 *
 * Volontairement permissif : un fichier de sous-titres trouvé dans la nature est
 * rarement conforme. On saute ce qu'on ne comprend pas plutôt que d'échouer —
 * une réplique perdue coûte quelques trigrammes, un rejet du fichier coûte toute
 * la protection.
 *
 * Les répliques sont renvoyées triées par instant de début.
 */
export const parseSubtitles = (source: string): TimedCue[] => {
  const cues: TimedCue[] = []
  // On normalise les fins de ligne et on retire un éventuel BOM.
  const lines = source.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)

  for (let i = 0; i < lines.length; i += 1) {
    const match = TIMING_LINE.exec(lines[i] as string)
    if (match === null) continue

    const start = toSeconds(match[1], match[2] as string, match[3] as string, match[4] as string)
    const end = toSeconds(match[5], match[6] as string, match[7] as string, match[8] as string)

    const text: string[] = []
    let j = i + 1
    for (; j < lines.length; j += 1) {
      const line = lines[j] as string
      if (line.trim() === '') break
      // Une nouvelle ligne de timing signale une réplique dont le texte manque.
      if (TIMING_LINE.test(line)) {
        j -= 1
        break
      }
      // Un numéro seul suivi d'un timing est l'index de la réplique suivante, pas
      // du texte : certains fichiers omettent la ligne vide de séparation.
      if (/^\d+$/.test(line.trim()) && TIMING_LINE.test(lines[j + 1] ?? '')) {
        j -= 1
        break
      }
      text.push(line)
    }
    i = j

    const joined = text.join(' ').trim()
    if (joined === '' || end < start) continue
    cues.push({ text: joined, start, end })
  }

  return cues.sort((a, b) => a.start - b.start || a.end - b.end)
}
