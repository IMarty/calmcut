import { asPhobiaId, asSegmentId, type Segment } from '@calmcut/core'
import { detectFromSubtitles } from '@calmcut/phobias'
import { prepareSegments, protectionAt } from '@calmcut/player-actions'
import {
  buildIndexFromCues,
  estimateOffset,
  hearSegments,
  parseSubtitles,
  parseSyncIndex,
  SyncTracker,
} from '@calmcut/sync'
import { describe, expect, it } from 'vitest'
import { guessLanguage } from './language.js'

/**
 * La chaîne complète du mode démo, bout en bout, sans navigateur.
 *
 * Ce test manquait, et son absence a coûté un test manuel entier : le compagnon
 * ne transmettait pas la langue à Whisper, le film français était transcrit en
 * anglais, et rien ne pouvait concorder. L'interface affichait « à l'écoute »
 * indéfiniment, sans moyen de savoir où était le problème.
 *
 * Il vérifie donc les deux sens : que ça marche quand la langue est bonne, et que
 * ça ne marche **pas** quand elle est mauvaise — pour que le symptôme soit
 * documenté et reconnaissable.
 */

const SRT = `1
00:01:40,000 --> 00:01:43,000
Il y a quelque chose dans le mur du grenier.

2
00:01:44,000 --> 00:01:47,000
Tu l'entends ? Depuis une heure je n'arrive pas à dormir.

3
00:01:48,000 --> 00:01:51,000
Ce n'est pas le vent, et ce n'est pas la maison qui craque.

4
00:01:52,000 --> 00:01:55,000
Je descends voir. Ne me suis pas, reste ici avec la lampe.

5
00:02:00,000 --> 00:02:03,000
[couinements]

6
00:02:04,000 --> 00:02:07,000
La porte du fond est fermée, mais elle ne l'était pas hier.
`

const SALT = 'demo:film.srt:6'

const cues = parseSubtitles(SRT)
const index = parseSyncIndex(buildIndexFromCues(cues, SALT))

describe('mode démo — de bout en bout', () => {
  it('lit les sous-titres', () => {
    expect(cues).toHaveLength(6)
  })

  it('construit un index non vide', () => {
    // Un index vide est une cause d'échec silencieux : le Worker la signale
    // désormais explicitement.
    expect(index.size).toBeGreaterThan(20)
  })

  it('déduit la bonne langue depuis les sous-titres', () => {
    expect(guessLanguage(cues.map((c) => c.text).join(' ')).code).toBe('fr')
  })

  it('repère la scène phobogène depuis l’indication sonore', () => {
    const scenes = detectFromSubtitles(cues, ['rats'])
    expect(scenes).toHaveLength(1)
    expect(scenes[0]?.evidence).toBe('sound-cue')
  })
})

describe('verrouillage avec la BONNE langue', () => {
  /** Ce que Whisper renvoie s'il transcrit correctement du français. */
  const heardInFrench = (offset: number) =>
    hearSegments(
      [
        { text: 'il y a quelque chose dans le mur du grenier', start: 100 - offset },
        { text: "tu l'entends depuis une heure je n'arrive pas à dormir", start: 104 - offset },
        { text: "ce n'est pas le vent et ce n'est pas la maison qui craque", start: 108 - offset },
      ],
      SALT,
    )

  it('retrouve la position', () => {
    const estimate = estimateOffset(heardInFrench(40), index)
    expect(estimate).toBeDefined()
    expect(estimate?.offset).toBeCloseTo(40, 3)
    expect(estimate?.support).toBeGreaterThanOrEqual(3)
  })

  it('le suivi passe en verrouillé', () => {
    const tracker = new SyncTracker(index)
    const status = tracker.observe(heardInFrench(40))
    expect(status.phase).toBe('locked')
  })

  it('la protection se déclenche à la bonne position', () => {
    const scenes = detectFromSubtitles(cues, ['rats'])
    const segments: Segment[] = scenes.map((scene, i) => ({
      id: asSegmentId(`demo-${i}`),
      phobia: asPhobiaId(scene.phobia),
      start: scene.start,
      end: scene.end,
      modality: 'subs',
      status: 'confirmed',
      score: scene.confidence,
    }))
    const prepared = prepareSegments(segments, ['rats'], { marginBefore: 0, marginAfter: 0 })

    // L'indication sonore est à 120 s, plus 2 s de marge de chaque côté.
    expect(protectionAt(prepared, 110).kind).toBe('idle')
    expect(protectionAt(prepared, 115).kind).toBe('warning')
    expect(protectionAt(prepared, 120).kind).toBe('protecting')
    expect(protectionAt(prepared, 200).kind).toBe('idle')
  })
})

describe('MAUVAISE langue — le symptôme à reconnaître', () => {
  /** Ce que Whisper renvoie quand personne ne lui a dit que le film est français. */
  const heardInEnglish = hearSegments(
    [
      { text: 'there is something in the wall of the attic', start: 60 },
      { text: 'can you hear it for an hour now i cannot sleep', start: 64 },
      { text: 'it is not the wind and it is not the house settling', start: 68 },
    ],
    SALT,
  )

  it('ne produit AUCUNE concordance', () => {
    // C'est la panne de fond : la transcription est bonne, l'index est bon, mais
    // ils ne parlent pas la même langue. Rien ne peut jamais concorder.
    expect(estimateOffset(heardInEnglish, index)).toBeUndefined()
  })

  it('le suivi reste en écoute, indéfiniment', () => {
    const tracker = new SyncTracker(index)
    for (let i = 0; i < 10; i += 1) tracker.observe(heardInEnglish)
    expect(tracker.status.phase).toBe('listening')
    expect(tracker.mediaTimeAt(100)).toBeUndefined()
  })

  it('et n’annonce jamais une position fausse', () => {
    // Le comportement est correct : le suivi préfère se taire que se tromper.
    // Ce qui manquait n'était pas la sûreté, c'était le diagnostic.
    const tracker = new SyncTracker(index)
    tracker.observe(heardInEnglish)
    expect(tracker.status.support).toBe(0)
  })
})
