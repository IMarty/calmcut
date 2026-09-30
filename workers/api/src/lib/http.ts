import type { Context } from 'hono'
import type { AppBindings } from './env.js'

/**
 * Réponses d'erreur uniformes.
 *
 * Les messages restent **volontairement pauvres**. §8.2 interdit d'aider à
 * cartographier la base : « titre inconnu » et « quota atteint » ne doivent pas se
 * distinguer par un détail exploitable, et un aspirateur ne doit rien apprendre de
 * nos codes d'erreur qu'il ne sache déjà.
 */

export type ErrorCode =
  'bad-request' | 'unauthorized' | 'forbidden' | 'not-found' | 'quota-exceeded' | 'rate-limited'

const STATUS: Record<ErrorCode, 400 | 401 | 403 | 404 | 429> = {
  'bad-request': 400,
  unauthorized: 401,
  forbidden: 403,
  'not-found': 404,
  'quota-exceeded': 429,
  'rate-limited': 429,
}

export interface ApiError {
  readonly error: ErrorCode
  readonly message: string
}

export const fail = (
  c: Context<AppBindings>,
  code: ErrorCode,
  message: string,
  headers: Record<string, string> = {},
): Response => c.json<ApiError>({ error: code, message }, STATUS[code], headers)

/** Secondes jusqu'au prochain minuit UTC : quand le quota journalier se remet à zéro. */
export const secondsUntilUtcMidnight = (nowMs: number): number => {
  const next = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate() + 1,
  )
  return Math.max(1, Math.ceil((next - nowMs) / 1000))
}

/** Jour UTC au format `YYYY-MM-DD`. Le quota se remet à zéro à minuit UTC, partout. */
export const utcDay = (nowMs: number): string =>
  new Date(nowMs).toISOString().split('T')[0] as string

/** Lit un corps JSON en objet, ou `undefined` si ce n'en est pas un. */
export const readJson = async (
  c: Context<AppBindings>,
): Promise<Record<string, unknown> | undefined> => {
  try {
    const body: unknown = await c.req.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
    return body as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** Un nombre fini dans un intervalle, ou `undefined`. */
export const finiteNumber = (value: unknown, min: number, max: number): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value >= min && value <= max ? value : undefined
}

/** Une chaîne non vide, bornée en longueur. */
export const boundedString = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : undefined
}
