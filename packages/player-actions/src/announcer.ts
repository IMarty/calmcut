/**
 * Annonce vocale du compte à rebours.
 *
 * Le visuel ne suffit pas : l'utilisateur regarde l'écran du film, pas son
 * téléphone. La voix est ce qui lui donne le temps de détourner les yeux.
 */

export interface Announcer {
  /**
   * Annonce le décompte. Appelable à chaque image : ne parle qu'une fois par
   * seconde entière, et jamais deux fois pour le même chiffre.
   */
  countdown(secondsLeft: number): void
  /** Annonce la fin de la scène. */
  allClear(): void
  /** Oublie ce qui a déjà été annoncé, pour la scène suivante. */
  reset(): void
  /** Coupe la parole en cours. */
  cancel(): void
}

export interface AnnouncerOptions {
  /** Langue de la synthèse vocale. Défaut : `fr-FR`. */
  readonly lang?: string
  /** Volume de la voix, entre 0 et 1. Défaut : 1. */
  readonly volume?: number
  /** À partir de combien de secondes restantes on commence à parler. Défaut : 5. */
  readonly from?: number
}

/** Un annonceur qui ne parle pas — pour les tests et pour `prefers-reduced-motion`. */
export const silentAnnouncer: Announcer = {
  countdown(): void {},
  allClear(): void {},
  reset(): void {},
  cancel(): void {},
}

/**
 * Annonceur fondé sur `speechSynthesis`.
 *
 * `speechSynthesis` est absent ou muet dans certains contextes (Workers, Safari
 * avant interaction, WebView). L'appelant reçoit alors `silentAnnouncer` : le
 * compte à rebours visuel reste, et la protection fonctionne quand même — elle ne
 * dépend jamais de la voix.
 */
export const createAnnouncer = (options: AnnouncerOptions = {}): Announcer => {
  const synth = typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis
  if (synth === undefined) return silentAnnouncer

  const lang = options.lang ?? 'fr-FR'
  const volume = options.volume ?? 1
  const from = options.from ?? 5
  let lastSpoken: number | undefined

  const say = (text: string): void => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.volume = volume
    // Un peu plus vite que la normale : un décompte doit tenir dans sa seconde.
    utterance.rate = 1.15
    synth.speak(utterance)
  }

  return {
    countdown(secondsLeft: number): void {
      const whole = Math.ceil(secondsLeft)
      if (whole < 1 || whole > from) return
      if (lastSpoken === whole) return
      lastSpoken = whole
      say(whole === from ? `Attention, scène dans ${whole}` : String(whole))
    },
    allClear(): void {
      if (lastSpoken === 0) return
      lastSpoken = 0
      say("C'est passé")
    },
    reset(): void {
      lastSpoken = undefined
    },
    cancel(): void {
      synth.cancel()
    },
  }
}
