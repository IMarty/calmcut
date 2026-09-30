import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** Paquets publiés sur npm : ils sont lus par `calmcut-batch`, qui est public. */
const PUBLISHED = ['core', 'sync', 'phobias'] as const

/**
 * Paquets qui ne doivent jamais fuiter dans un paquet publié.
 *
 * `watermark` vit dans un dépôt privé séparé (ADR 0003) et n'est donc pas censé être
 * résoluble ici — la règle est maintenue pour que réintroduire le paquet, un jour ou
 * par erreur, échoue bruyamment. `db` expose le schéma interne, dont
 * `creditsStart`/`creditsEnd` qui ne sont jamais publics (§6).
 */
const FORBIDDEN = ['watermark', 'db'] as const

const sourceFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (entry.endsWith('.ts')) out.push(path)
  }
  return out
}

const manifest = (pkg: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(repoRoot, 'packages', pkg, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >

describe.each(PUBLISHED)('garde-fou du paquet publié @calmcut/%s', (pkg) => {
  const files = sourceFiles(join(repoRoot, 'packages', pkg, 'src'))

  it('a des sources à analyser', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(FORBIDDEN)('n’importe jamais @calmcut/%s', (forbidden) => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return (
        source.includes(`@calmcut/${forbidden}`) ||
        new RegExp(`from ['"][^'"]*\\b${forbidden}/`).test(source)
      )
    })
    expect(offenders.map((f) => f.slice(repoRoot.length))).toEqual([])
  })

  it('ne déclare aucune dépendance vers un paquet interdit', () => {
    const pkgJson = manifest(pkg)
    const deps = {
      ...((pkgJson.dependencies as Record<string, string> | undefined) ?? {}),
      ...((pkgJson.peerDependencies as Record<string, string> | undefined) ?? {}),
    }
    for (const forbidden of FORBIDDEN) {
      expect(Object.keys(deps)).not.toContain(`@calmcut/${forbidden}`)
    }
  })

  it('est publiable : non privé, accès public, licence AGPL', () => {
    const pkgJson = manifest(pkg)
    expect(pkgJson.private).toBe(false)
    expect((pkgJson.publishConfig as { access?: string } | undefined)?.access).toBe('public')
    expect(pkgJson.license).toBe('AGPL-3.0-or-later')
  })
})

describe('@calmcut/sync', () => {
  it('n’a aucune dépendance runtime — il doit être réimplémentable ailleurs (§4.1)', () => {
    const pkgJson = manifest('sync')
    expect(pkgJson.dependencies ?? {}).toEqual({})
  })

  it('ne suppose aucun environnement d’exécution', () => {
    // Les commentaires ont le droit de nommer ces globales — pour expliquer
    // pourquoi elles sont évitées. Seul le code est vérifié.
    const stripComments = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

    const forbiddenGlobals = [
      'TextEncoder',
      'TextDecoder',
      'Buffer',
      'process',
      'window',
      'document',
    ]
    for (const file of sourceFiles(join(repoRoot, 'packages', 'sync', 'src'))) {
      if (file.endsWith('.test.ts')) continue
      const code = stripComments(readFileSync(file, 'utf8'))
      for (const global of forbiddenGlobals) {
        expect(code, `${file.slice(repoRoot.length)} utilise ${global}`).not.toMatch(
          new RegExp(`\\b${global}\\b`),
        )
      }
    }
  })
})
