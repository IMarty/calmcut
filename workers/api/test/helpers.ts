import { buildSeedData, seedDatabase, type SeedData } from '@calmcut/seed'
import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { createApp, createDevVerifier } from '../src/app.js'
import { signDeviceToken } from '../src/lib/token.js'

/**
 * Outillage des tests d'intégration.
 *
 * L'application est construite avec le vérificateur Turnstile de développement :
 * il n'accepte que les jetons de test documentés, donc aucun appel réseau et aucun
 * secret ne traverse la suite.
 */

export const app = createApp({ turnstile: () => createDevVerifier() })

export const db = () => drizzle(env.DB)

export const request = async (
  path: string,
  init: RequestInit & { readonly token?: string } = {},
): Promise<Response> => {
  const headers = new Headers(init.headers)
  if (init.token !== undefined) headers.set('Authorization', `Bearer ${init.token}`)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return await app.fetch(new Request(`http://api.test${path}`, { ...init, headers }), env)
}

export const postJson = (
  path: string,
  body: unknown,
  options: { readonly token?: string } = {},
): Promise<Response> =>
  request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    ...(options.token !== undefined ? { token: options.token } : {}),
  })

/** Crée un appareil par la voie normale et renvoie son jeton. */
export const createDevice = async (): Promise<{ deviceId: string; token: string }> => {
  const response = await postJson('/v1/device', { turnstileToken: 'dev' })
  if (response.status !== 201) throw new Error(`création d'appareil échouée : ${response.status}`)
  return await response.json<{ deviceId: string; token: string }>()
}

/** Jeton signé pour un appareil donné, avec un instant arbitraire. */
export const tokenFor = async (deviceId: string, nowS: number): Promise<string> =>
  (await signDeviceToken(deviceId, env.JWT_SECRET, nowS)).token

/**
 * Vide toutes les tables.
 *
 * `isolatedStorage` du pool de test ne remet pas la base à zéro entre deux tests
 * de ce projet : on ne s'en remet donc pas à lui. Chaque test énonce ses propres
 * préconditions, ce qui les rend lisibles isolément et insensibles à leur ordre.
 *
 * L'ordre des suppressions suit les clés étrangères, du plus dépendant au moins.
 */
export const resetDatabase = async (): Promise<void> => {
  const tables = [
    'device_title_access',
    'votes',
    'reports',
    'segments',
    'sync_indexes',
    'title_sources',
    'title_requests',
    'titles',
    'devices',
    'phobias',
  ]
  await env.DB.batch(tables.map((table) => env.DB.prepare(`DELETE FROM ${table}`)))
}

/** Peuple la base avec le jeu de données synthétique de `tools/seed`. */
export const seed = async (options: { titleCount?: number } = {}): Promise<SeedData> => {
  const data = buildSeedData({ titleCount: options.titleCount ?? 3, seed: 7 })
  await seedDatabase(db() as never, data, env.DATA)
  return data
}
