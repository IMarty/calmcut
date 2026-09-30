import { segments, titles } from '@calmcut/db'
import { and, eq, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { dbOf } from '../lib/auth.js'
import type { AppBindings } from '../lib/env.js'
import { boundedString, fail } from '../lib/http.js'

/**
 * Résumé public d'un titre, pour le rendu SEO du site (§7.7).
 *
 * **Sans authentification** — c'est le site qui l'appelle au rendu, pas un client.
 * Donc aucun timestamp précis n'en sort : la page dit « oui, 4 scènes, vers 1 h 12 »,
 * jamais les bornes. Un aspirateur qui interrogerait cette route n'obtiendrait rien
 * d'utilisable, et c'est le but.
 */

/** Les positions publiques sont arrondies à cinq minutes. */
const ROUNDING = 300

export const publicRoutes = () => {
  const app = new Hono<AppBindings>()

  app.get('/public/titles/:slug/summary', async (c) => {
    const slug = boundedString(c.req.param('slug'), 200)
    if (slug === undefined || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return fail(c, 'bad-request', 'slug invalide')
    }

    const db = dbOf(c.env)
    const titleRows = await db
      .select({
        id: titles.id,
        publicSlug: titles.publicSlug,
        name: titles.name,
        year: titles.year,
      })
      .from(titles)
      .where(eq(titles.publicSlug, slug))
      .limit(1)

    const title = titleRows[0]
    if (title === undefined) return fail(c, 'not-found', 'titre inconnu')

    const rows = await db
      .select({
        phobiaId: segments.phobiaId,
        start: segments.start,
        status: segments.status,
      })
      .from(segments)
      .where(and(eq(segments.titleId, title.id), ne(segments.status, 'disabled')))

    const byPhobia = new Map<string, { count: number; first: number; verified: boolean }>()
    for (const row of rows) {
      const entry = byPhobia.get(row.phobiaId)
      if (entry === undefined) {
        byPhobia.set(row.phobiaId, {
          count: 1,
          first: row.start,
          verified: row.status === 'verified',
        })
        continue
      }
      entry.count += 1
      entry.first = Math.min(entry.first, row.start)
      // « Vérifié » dès qu'une scène l'est : c'est la question que se pose le
      // visiteur, « est-ce que quelqu'un a confirmé ? ».
      entry.verified = entry.verified || row.status === 'verified'
    }

    const phobias = [...byPhobia.entries()]
      .map(([phobia, entry]) => ({
        phobia,
        count: entry.count,
        verified: entry.verified,
        // Arrondi à cinq minutes : assez pour rassurer, trop grossier pour aspirer.
        firstAround: Math.round(entry.first / ROUNDING) * ROUNDING,
      }))
      .sort((a, b) => a.firstAround - b.firstAround)

    return c.json(
      { slug: title.publicSlug, name: title.name, year: title.year, phobias },
      200,
      // Public et fortement cachable : c'est ce qui permet au site de tenir son
      // budget de LCP sans requête à la base à chaque visite.
      { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    )
  })

  return app
}
