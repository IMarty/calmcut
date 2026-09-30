#!/usr/bin/env bun
import { buildSeedData } from '../src/index.js'

/**
 * Aperçu du jeu de données de développement.
 *
 * L'écriture en base passe par `wrangler d1 execute`, pas par ce script : une base
 * D1 locale vit dans `.wrangler/state`, et seul wrangler sait l'adresser proprement.
 * Ce CLI produit donc le SQL, et l'utilisateur décide où l'envoyer.
 *
 *   bun run tools/seed/bin/seed.ts --sql > seed.sql
 *   wrangler d1 execute calmcut-db-preview --local --file=seed.sql
 */

const args = new Set(process.argv.slice(2))
const count = Number(process.argv.find((a) => a.startsWith('--titles='))?.split('=')[1] ?? 12)

const data = buildSeedData({ titleCount: Number.isFinite(count) ? count : 12 })

if (args.has('--sql')) {
  console.log('-- CalmCut : données de développement SYNTHÉTIQUES, aucun contenu réel.')
  console.log(
    "-- Généré par `bun run tools/seed/bin/seed.ts --sql`. Ne pas committer d'export réel.",
  )
  const esc = (value: string) => value.replace(/'/g, "''")
  const now = Math.floor(Date.UTC(2026, 0, 1) / 1000)

  for (const title of data.titles) {
    console.log(
      `INSERT OR IGNORE INTO titles (id, tmdb_id, kind, name, year, runtime_canonical, credits_start, credits_end, public_slug, created_at, updated_at) VALUES ('${title.id}', ${title.tmdbId}, 'movie', '${esc(title.name)}', ${title.year}, ${title.runtime}, ${title.creditsStart}, ${title.creditsEnd}, '${title.slug}', ${now}, ${now});`,
    )
    for (const segment of title.segments) {
      console.log(
        `INSERT OR IGNORE INTO segments (id, title_id, phobia_id, start, end, modality, origin, status, score, reports_count, created_at, updated_at) VALUES ('${segment.id}', '${title.id}', '${segment.phobia}', ${segment.start}, ${segment.end}, 'subs', 'batch', '${segment.status}', 0.6, 0, ${now}, ${now});`,
      )
    }
  }
} else {
  const segments = data.titles.reduce((sum, t) => sum + t.segments.length, 0)
  const cues = data.titles.reduce((sum, t) => sum + t.cues.length, 0)
  console.log(`Jeu de données synthétique :`)
  console.log(`  ${data.titles.length} titres`)
  console.log(`  ${segments} segments`)
  console.log(`  ${cues} répliques générées (jamais de dialogue réel)`)
  console.log(`  ${data.devices.length} appareils`)
  console.log('')
  console.log('Pour produire le SQL : --sql   (voir l’en-tête du script)')
}
