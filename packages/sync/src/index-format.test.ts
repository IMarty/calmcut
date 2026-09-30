import { describe, expect, it } from 'vitest'
import {
  buildIndexFromCues,
  buildSyncIndex,
  parseSyncIndex,
  SYNC_INDEX_HEADER_BYTES,
  SyncIndexError,
  type SyncEntry,
} from './index-format.js'
import { hashTrigrams } from './trigrams.js'
import { SYNC_INDEX_VERSION } from './version.js'

const entries: SyncEntry[] = [
  { hash: 0xdeadbeef, cueStart: 120.5 },
  { hash: 0x00000001, cueStart: 3.14 },
  { hash: 0xdeadbeef, cueStart: 4331.2 },
  { hash: 0x7fffffff, cueStart: 0 },
]

describe('aller-retour build → parse', () => {
  const index = parseSyncIndex(buildSyncIndex(entries))

  it('annonce la version courante et le bon nombre de paires', () => {
    expect(index.version).toBe(SYNC_INDEX_VERSION)
    expect(index.size).toBe(4)
  })

  it('retrouve toutes les occurrences d’un trigramme, dans l’ordre', () => {
    expect(index.lookup(0xdeadbeef)).toEqual([120.5, 4331.2])
  })

  it('gère un instant à zéro', () => {
    expect(index.lookup(0x7fffffff)).toEqual([0])
  })

  it('renvoie un tableau vide pour un trigramme inconnu', () => {
    expect(index.lookup(0x12345678)).toEqual([])
  })

  it('arrondit à la centiseconde', () => {
    const rounded = parseSyncIndex(buildSyncIndex([{ hash: 7, cueStart: 12.3456 }]))
    expect(rounded.lookup(7)).toEqual([12.35])
  })

  it('déduplique les paires identiques', () => {
    const duped = parseSyncIndex(
      buildSyncIndex([
        { hash: 9, cueStart: 5 },
        { hash: 9, cueStart: 5 },
        { hash: 9, cueStart: 6 },
      ]),
    )
    expect(duped.size).toBe(2)
    expect(duped.lookup(9)).toEqual([5, 6])
  })

  it('produit un fichier de taille prévisible', () => {
    expect(buildSyncIndex(entries).byteLength).toBe(SYNC_INDEX_HEADER_BYTES + 4 * 8)
  })

  it('accepte un index vide', () => {
    const empty = parseSyncIndex(buildSyncIndex([]))
    expect(empty.size).toBe(0)
    expect(empty.lookup(1)).toEqual([])
  })
})

describe('recherche dichotomique', () => {
  it('reste exacte sur un index de grande taille', () => {
    const many: SyncEntry[] = []
    for (let i = 0; i < 5000; i += 1) many.push({ hash: (i * 2654435761) >>> 0, cueStart: i / 10 })
    const index = parseSyncIndex(buildSyncIndex(many))

    expect(index.size).toBe(5000)
    for (const probe of [0, 1, 2499, 4999]) {
      const entry = many[probe] as SyncEntry
      expect(index.lookup(entry.hash)).toEqual([entry.cueStart])
    }
  })
})

describe('refus d’un index illisible', () => {
  const expectCode = (fn: () => unknown, code: string) => {
    try {
      fn()
    } catch (error) {
      expect(error).toBeInstanceOf(SyncIndexError)
      expect((error as SyncIndexError).code).toBe(code)
      return
    }
    throw new Error('aucune erreur levée')
  }

  it('refuse un fichier trop court pour porter un en-tête', () => {
    expectCode(() => parseSyncIndex(new ArrayBuffer(8)), 'truncated')
  })

  it('refuse un fichier qui n’est pas un index CalmCut', () => {
    const buffer = new ArrayBuffer(SYNC_INDEX_HEADER_BYTES)
    new DataView(buffer).setUint32(0, 0x504b0304, false) // un zip
    expectCode(() => parseSyncIndex(buffer), 'bad-magic')
  })

  it('refuse une version inconnue plutôt que d’interpréter les octets au hasard', () => {
    const buffer = buildSyncIndex(entries)
    new DataView(buffer).setUint16(4, SYNC_INDEX_VERSION + 1, true)
    expectCode(() => parseSyncIndex(buffer), 'unsupported-version')
  })

  it('refuse un fichier tronqué en cours de paires', () => {
    const full = buildSyncIndex(entries)
    expectCode(() => parseSyncIndex(full.slice(0, full.byteLength - 4)), 'truncated')
  })

  it('refuse un instant hors de l’intervalle représentable', () => {
    expectCode(() => buildSyncIndex([{ hash: 1, cueStart: -1 }]), 'time-out-of-range')
    expectCode(() => buildSyncIndex([{ hash: 1, cueStart: 1e9 }]), 'time-out-of-range')
  })
})

describe('construction depuis des sous-titres', () => {
  const cues = [
    { text: 'There are rats in the walls', start: 100 },
    { text: '[squeaking]', start: 104 },
    { text: 'We should leave right now', start: 106.25 },
  ]
  const salt = 'title-abc'
  const buffer = buildIndexFromCues(cues, salt)
  const index = parseSyncIndex(buffer)

  it('indexe chaque trigramme à l’instant de sa réplique', () => {
    const [first] = hashTrigrams(cues[0]!.text, salt)
    expect(index.lookup(first as number)).toEqual([100])
  })

  it('ignore une réplique purement sonore', () => {
    expect(index.size).toBe(
      hashTrigrams(cues[0]!.text, salt).length + hashTrigrams(cues[2]!.text, salt).length,
    )
  })

  it('ne conserve aucun mot des sous-titres dans le binaire', () => {
    const bytes = new Uint8Array(buffer)
    const haystack = String.fromCharCode(...bytes)
    for (const word of ['rats', 'walls', 'leave', 'squeaking', 'There']) {
      expect(haystack).not.toContain(word)
    }
  })

  it('produit des index incompatibles pour deux titres différents', () => {
    const other = parseSyncIndex(buildIndexFromCues(cues, 'title-xyz'))
    const [first] = hashTrigrams(cues[0]!.text, salt)
    expect(other.lookup(first as number)).toEqual([])
  })
})
