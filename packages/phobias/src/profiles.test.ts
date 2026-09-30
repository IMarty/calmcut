import { describe, expect, it } from 'vitest'
import { allPhobias, enabledPhobias, findPhobia, rats, resolveEnabledPhobias } from './index.js'

describe('catalogue de phobies', () => {
  it('démarre avec rats et araignées activés, et rien d’autre', () => {
    expect(enabledPhobias.map((p) => p.id)).toEqual(['rats', 'spiders'])
  })

  it('prévoit les autres phobies en enabled: false', () => {
    const disabled = allPhobias.filter((p) => !p.enabled).map((p) => p.id)
    expect(disabled).toEqual(['snakes', 'insects', 'needles', 'clowns', 'blood', 'emetophobia'])
  })

  it('n’a pas d’identifiant en doublon', () => {
    const ids = allPhobias.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('utilise des identifiants stables en kebab/snake ASCII', () => {
    for (const profile of allPhobias) expect(profile.id).toMatch(/^[a-z][a-z0-9-]*$/)
  })

  it('déclare des libellés dans les deux locales et des marges positives', () => {
    for (const profile of allPhobias) {
      expect(profile.labels.fr.length).toBeGreaterThan(0)
      expect(profile.labels.en.length).toBeGreaterThan(0)
      expect(profile.marginBefore).toBeGreaterThan(0)
      expect(profile.marginAfter).toBeGreaterThan(0)
    }
  })

  it('déclare au moins un motif de sous-titre exploitable', () => {
    for (const profile of allPhobias) {
      expect(profile.subtitles.keywords.length).toBeGreaterThan(0)
    }
  })
})

describe('heuristiques de sous-titres', () => {
  const matches = (text: string) => rats.subtitles.keywords.some((re) => re.test(text))

  it('reconnaît les rats en anglais et en français', () => {
    expect(matches('There are rats in the walls')).toBe(true)
    expect(matches('Il y a des souris dans le grenier')).toBe(true)
  })

  it('ne se déclenche pas sur un mot qui contient seulement la racine', () => {
    expect(matches('He ate a ratatouille')).toBe(false)
    expect(matches('Elle a souri')).toBe(false)
  })

  it('reconnaît les indications sonores', () => {
    expect(rats.subtitles.soundCues.some((re) => re.test('[rats squeaking]'))).toBe(true)
    expect(rats.subtitles.soundCues.some((re) => re.test('[couinements]'))).toBe(true)
  })
})

describe('résolution des phobies demandées par un client', () => {
  it('ignore les identifiants inconnus et désactivés', () => {
    expect(resolveEnabledPhobias(['rats', 'snakes', 'dragons'])).toEqual(['rats'])
  })

  it('trouve un profil désactivé par identifiant', () => {
    expect(findPhobia('clowns')?.enabled).toBe(false)
    expect(findPhobia('dragons')).toBeUndefined()
  })
})
