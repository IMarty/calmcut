import { Ajv2020 } from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import schema from '../schema.json' with { type: 'json' }
import { asPhobiaId, asSegmentId } from './ids.js'
import type { Segment, TitleDocument, TimelineSource } from './timeline.js'
import { TIMELINE_FORMAT_VERSION } from './version.js'

const ajv = new Ajv2020({ allErrors: true, strict: true })
const validate = ajv.compile(schema)

const segment: Segment = {
  id: asSegmentId('01JBR000000000000000000000'),
  phobia: asPhobiaId('rats'),
  start: 4331.2,
  end: 4339.8,
  modality: 'subs',
  status: 'confirmed',
  score: 0.82,
}

const source: TimelineSource = {
  kind: 'netflix',
  externalId: '70021642',
  offset: -12.3,
  scale: 1,
}

const document: TitleDocument = {
  v: TIMELINE_FORMAT_VERSION,
  title: { slug: 'ratatouille-2007', name: 'Ratatouille', year: 2007, runtime: 6660 },
  sources: [source],
  segments: [segment],
  sync: { version: 1, url: '/v1/titles/01JBQ/sync' },
}

/** Le schéma est le contrat des clients non-TypeScript : il doit refuser ce que TS refuserait. */
const rejects = (mutate: (doc: Record<string, unknown>) => void): string[] => {
  const copy = JSON.parse(JSON.stringify(document)) as Record<string, unknown>
  mutate(copy)
  expect(validate(copy)).toBe(false)
  return (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ''}`)
}

describe('schéma du document public', () => {
  it('est un schéma valide', () => {
    expect(typeof validate).toBe('function')
  })

  it('accepte un document conforme au type TypeScript', () => {
    expect(validate(document), JSON.stringify(validate.errors)).toBe(true)
  })

  it('accepte un document sans pointeur de synchro', () => {
    const { sync: _sync, ...withoutSync } = document
    expect(validate(withoutSync)).toBe(true)
  })

  it('accepte un segment portant origin et bbox', () => {
    const copy = JSON.parse(JSON.stringify(document)) as { segments: Record<string, unknown>[] }
    copy.segments[0] = {
      ...(copy.segments[0] as Record<string, unknown>),
      origin: 'user',
      bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    }
    expect(validate(copy), JSON.stringify(validate.errors)).toBe(true)
  })
})

describe('le schéma protège les invariants du produit', () => {
  it('interdit creditsStart et creditsEnd dans l’en-tête du titre', () => {
    // §6 : ces colonnes sont internes. Les exposer affaiblirait le filigrane.
    const errors = rejects((doc) => {
      ;(doc.title as Record<string, unknown>).creditsStart = 6100
    })
    expect(errors.join(' ')).toContain('must NOT have additional properties')
  })

  it('refuse une version de format inconnue', () => {
    rejects((doc) => {
      doc.v = 2
    })
  })

  it('refuse un statut de segment hors énumération', () => {
    rejects((doc) => {
      ;(doc.segments as Record<string, unknown>[])[0]!.status = 'maybe'
    })
  })

  it('refuse une modalité inventée', () => {
    rejects((doc) => {
      ;(doc.segments as Record<string, unknown>[])[0]!.modality = 'vibes'
    })
  })

  it('refuse un score hors de [0, 1]', () => {
    rejects((doc) => {
      ;(doc.segments as Record<string, unknown>[])[0]!.score = 1.5
    })
  })

  it('refuse une échelle nulle ou négative, qui rendrait la conversion absurde', () => {
    rejects((doc) => {
      ;(doc.sources as Record<string, unknown>[])[0]!.scale = 0
    })
  })

  it('refuse un identifiant de phobie qui n’est pas un slug', () => {
    rejects((doc) => {
      ;(doc.segments as Record<string, unknown>[])[0]!.phobia = 'Rats & Mice'
    })
  })

  it('refuse un champ inconnu à la racine', () => {
    rejects((doc) => {
      doc.credits = { start: 6100, end: 6660 }
    })
  })

  it('exige les champs obligatoires du titre', () => {
    rejects((doc) => {
      delete (doc.title as Record<string, unknown>).runtime
    })
  })
})
