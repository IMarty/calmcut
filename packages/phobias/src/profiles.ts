import { asPhobiaId, type PhobiaProfile } from '@calmcut/core'

/**
 * Profils de phobies, déclaratifs.
 *
 * Trois règles tirées d'un premier essai sur un vrai film, qui avait produit neuf
 * détections et neuf faux positifs :
 *
 * 1. **Les frontières de mot sont explicites et Unicode.** `\b` en JavaScript est
 *    défini sur l'ASCII : toute lettre accentuée compte comme une frontière, donc
 *    `/\brat\b/` reconnaît « raté ». Le helper `word()` évite ce piège.
 * 2. **Les indications sonores sont nominales.** `couinements`, jamais `couine` :
 *    une forme conjuguée décrit souvent une personne. `[couine avec enthousiasme]`
 *    est un humain.
 * 3. **Les homographes sont exclus explicitement.** « Souris » est aussi une forme
 *    du verbe *sourire*.
 *
 * Voir `docs/adr/0007-mention-nest-pas-occurrence.md`.
 */

/**
 * Motif de mot entier, avec des frontières Unicode.
 *
 * `(?<!\p{L})` plutôt que `\b` : c'est la seule façon d'exiger une vraie frontière
 * de mot dans une langue accentuée.
 */
const word = (...alternatives: string[]): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'iu')

/** Motif libre, sans contrainte de frontière — pour les racines de bruits. */
const loose = (...alternatives: string[]): RegExp =>
  new RegExp(`(?:${alternatives.join('|')})`, 'iu')

/**
 * Profils actifs. On démarre volontairement avec deux phobies pour valider la
 * chaîne complète (batch → API → clients) avant d'élargir le catalogue.
 */

export const rats: PhobiaProfile = {
  id: asPhobiaId('rats'),
  emoji: '🐀',
  labels: { fr: 'Rats et souris', en: 'Rats & mice' },
  enabled: true,
  subtitles: {
    keywords: [
      word('rats?', 'mice', 'mouse', 'rodents?', 'vermin'),
      word('rats?', 'souris', 'mulots?', 'rongeurs?', 'vermine'),
    ],
    // Formes NOMINALES : c'est ainsi que le sous-titrage SDH écrit un bruit.
    soundCues: [
      loose('squeaking', 'squeaks', 'scurrying', 'scratching', 'gnawing', 'scuttling'),
      loose('couinements?', 'grattements?', 'trottinements?', 'grignotements?'),
    ],
    excludes: [
      // « souris » = forme du verbe *sourire*. « Pourquoi tu souris ? »
      /(?<![\p{L}])(?:je|tu|on|nous|vous)\s+souris(?![\p{L}])/iu,
      /souri(?:re|res|ant|ante)(?![\p{L}])/iu,
    ],
  },
  audio: { audioSetClasses: ['Rodents, rats, mice'] },
  visual: { prompts: ['rat', 'mouse (animal)', 'rodent'] },
  defaultAction: 'white-noise',
  marginBefore: 2,
  marginAfter: 2,
}

export const spiders: PhobiaProfile = {
  id: asPhobiaId('spiders'),
  emoji: '🕷️',
  labels: { fr: 'Araignées', en: 'Spiders' },
  enabled: true,
  subtitles: {
    keywords: [
      word('spiders?', 'tarantulas?', 'arachnids?', 'cobwebs?'),
      word('araign[ée]es?', 'tarentules?', 'arachnides?'),
    ],
    soundCues: [loose('skittering', 'chittering'), loose('grouillements?', 'cliquetis')],
  },
  audio: { audioSetClasses: ['Insect'] },
  visual: { prompts: ['spider', 'tarantula', 'spider web'] },
  defaultAction: 'white-noise',
  marginBefore: 2,
  marginAfter: 2,
}

/**
 * Profils prévus mais désactivés : ils existent dans le catalogue pour figer
 * leur identifiant et leurs heuristiques, sans être proposés aux utilisateurs
 * avant d'avoir été validés sur de vrais titres.
 */

export const snakes: PhobiaProfile = {
  id: asPhobiaId('snakes'),
  emoji: '🐍',
  labels: { fr: 'Serpents', en: 'Snakes' },
  enabled: false,
  subtitles: {
    keywords: [
      word('snakes?', 'cobras?', 'pythons?', 'vipers?', 'adders?'),
      word('serpents?', 'vip[èe]res?', 'couleuvres?', 'boas?'),
    ],
    soundCues: [loose('hissing'), loose('sifflements?')],
  },
  audio: { audioSetClasses: ['Hiss'] },
  visual: { prompts: ['snake', 'cobra', 'python (snake)'] },
  defaultAction: 'white-noise',
  marginBefore: 2,
  marginAfter: 2,
}

export const insects: PhobiaProfile = {
  id: asPhobiaId('insects'),
  emoji: '🪳',
  labels: { fr: 'Insectes', en: 'Insects' },
  enabled: false,
  subtitles: {
    keywords: [
      word(
        'insects?',
        'cockroach(?:es)?',
        'roach(?:es)?',
        'beetles?',
        'maggots?',
        'larvae',
        'wasps?',
        'hornets?',
      ),
      word(
        'insectes?',
        'cafards?',
        'blattes?',
        'cancrelats?',
        'scarab[ée]es?',
        'asticots?',
        'larves?',
        'gu[êe]pes?',
        'frelons?',
      ),
    ],
    soundCues: [loose('buzzing', 'swarming'), loose('bourdonnements?', 'grouillements?')],
  },
  audio: { audioSetClasses: ['Insect', 'Buzz'] },
  visual: { prompts: ['cockroach', 'beetle', 'swarm of insects'] },
  defaultAction: 'white-noise',
  marginBefore: 2,
  marginAfter: 2,
}

export const needles: PhobiaProfile = {
  id: asPhobiaId('needles'),
  emoji: '💉',
  labels: { fr: 'Aiguilles et piqûres', en: 'Needles & injections' },
  enabled: false,
  subtitles: {
    keywords: [
      word('needles?', 'syringes?', 'injections?', 'vaccines?'),
      word('aiguilles?', 'seringues?', 'piq[ûu]res?', 'injections?', 'perfusions?', 'vaccins?'),
    ],
    soundCues: [],
  },
  visual: { prompts: ['syringe', 'hypodermic needle', 'injection'] },
  defaultAction: 'blur',
  marginBefore: 3,
  marginAfter: 2,
}

export const clowns: PhobiaProfile = {
  id: asPhobiaId('clowns'),
  emoji: '🤡',
  labels: { fr: 'Clowns', en: 'Clowns' },
  enabled: false,
  subtitles: {
    keywords: [
      word('clowns?', 'jesters?', 'harlequins?'),
      word('clowns?', 'bouffons?', 'arlequins?'),
    ],
    soundCues: [loose('circus music'), loose('musique de cirque')],
  },
  visual: { prompts: ['clown', 'clown face', 'circus performer'] },
  defaultAction: 'blackout',
  marginBefore: 3,
  marginAfter: 2,
}

export const blood: PhobiaProfile = {
  id: asPhobiaId('blood'),
  emoji: '🩸',
  labels: { fr: 'Sang et blessures', en: 'Blood & injury' },
  enabled: false,
  subtitles: {
    keywords: [
      word('blood', 'bleeding', 'h(?:a)?emorrhage', 'gore', 'wounds?'),
      word('sang', 'h[ée]morragie', 'blessures?', 'plaies?'),
    ],
    soundCues: [],
  },
  visual: { prompts: ['blood', 'open wound', 'surgery'] },
  defaultAction: 'blur',
  marginBefore: 3,
  marginAfter: 2,
}

export const emetophobia: PhobiaProfile = {
  id: asPhobiaId('emetophobia'),
  emoji: '🤢',
  labels: { fr: 'Vomissements', en: 'Vomiting' },
  enabled: false,
  subtitles: {
    keywords: [
      word('vomit', 'vomiting', 'puke', 'retching', 'nausea'),
      word('vomi', 'vomissements?', 'naus[ée]es?'),
    ],
    soundCues: [
      loose('retching', 'gagging', 'vomiting'),
      loose('haut[- ]le[- ]c[oœ]ur', 'vomissements?'),
    ],
  },
  audio: { audioSetClasses: ['Vomit'] },
  visual: { prompts: ['person vomiting'] },
  defaultAction: 'white-noise',
  marginBefore: 4,
  marginAfter: 3,
}

/** Catalogue complet, dans l'ordre d'affichage. */
export const allPhobias: readonly PhobiaProfile[] = [
  rats,
  spiders,
  snakes,
  insects,
  needles,
  clowns,
  blood,
  emetophobia,
]
