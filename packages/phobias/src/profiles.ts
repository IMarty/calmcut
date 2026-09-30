import { asPhobiaId, type PhobiaProfile } from '@calmcut/core'

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
      /\b(rats?|mice|mouse|rodents?|vermin)\b/i,
      /\b(rats?|souris|rongeurs?|mulots?|vermine)\b/i,
    ],
    soundCues: [/squeak/i, /scurry|scratching|scuttl/i, /couine|grattement|trottine/i],
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
      /\b(spiders?|tarantulas?|arachnids?|cobwebs?|webs?)\b/i,
      /\b(araign[ée]es?|tarentules?|arachnides?|toiles?)\b/i,
    ],
    soundCues: [/skitter|chitter/i, /grouillement|cliquetis/i],
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
      /\b(snakes?|serpents?|cobras?|pythons?|vipers?|adders?)\b/i,
      /\b(serpents?|vip[èe]res?|couleuvres?|boas?)\b/i,
    ],
    soundCues: [/hiss/i, /siffle/i],
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
      /\b(insects?|cockroach(es)?|roach(es)?|beetles?|maggots?|larvae|wasps?|hornets?)\b/i,
      /\b(insectes?|cafards?|blattes?|cancrelats?|scarab[ée]es?|asticots?|larves?|gu[êe]pes?|frelons?)\b/i,
    ],
    soundCues: [/buzz|swarm|crawl/i, /bourdonne|grouille/i],
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
      /\b(needles?|syringes?|injections?|inject(ing|ed)?|iv drip|vaccines?|blood draw)\b/i,
      /\b(aiguilles?|seringues?|piq[ûu]res?|injections?|perfusions?|prise de sang|vaccins?)\b/i,
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
    keywords: [/\b(clowns?|jesters?|harlequins?)\b/i, /\b(clowns?|bouffons?|arlequins?)\b/i],
    soundCues: [/circus music/i, /musique de cirque/i],
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
      /\b(blood|bleeding|haemorrhag|hemorrhag|gore|wounds?|amputat)/i,
      /\b(sang|saigne|h[ée]morragie|blessures?|amputat|plaies?)/i,
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
      /\b(vomit|throw(ing)? up|puke|retch|nausea|sick to (my|his|her) stomach)/i,
      /\b(vomi|vomit|d[ée]gobille|naus[ée]e|mal au c[oœ]ur|hauts? le c[oœ]ur)/i,
    ],
    soundCues: [/retching|gagging|vomiting/i, /haut le c[oœ]ur|vomissement/i],
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
