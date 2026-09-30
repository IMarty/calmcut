import { devices } from '@calmcut/db'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { dbOf } from '../lib/auth.js'
import type { AppBindings } from '../lib/env.js'
import { boundedString, fail, readJson } from '../lib/http.js'
import { REFRESH_GRACE_SECONDS, signDeviceToken, verifyDeviceToken } from '../lib/token.js'

import type { TurnstileVerifier } from '../lib/turnstile.js'
import { ulid } from '../lib/ulid.js'

/**
 * Création et rafraîchissement des jetons d'appareil (§8.1).
 *
 * Un « appareil » n'est pas un compte : pas d'e-mail, pas de mot de passe, rien
 * qui identifie une personne. Un ULID et une réputation, c'est tout (principe 4).
 */
export const deviceRoutes = (makeVerifier: (secret: string) => TurnstileVerifier) => {
  const app = new Hono<AppBindings>()

  app.post('/device', async (c) => {
    const body = await readJson(c)
    const turnstileToken = boundedString(body?.turnstileToken, 2048)
    if (turnstileToken === undefined) return fail(c, 'bad-request', 'turnstileToken manquant')

    const ip = c.req.header('CF-Connecting-IP')
    const verify = makeVerifier(c.env.TURNSTILE_SECRET)
    if (!(await verify(turnstileToken, ip))) {
      return fail(c, 'bad-request', 'vérification anti-robot échouée')
    }

    const nowMs = Date.now()
    const nowS = Math.floor(nowMs / 1000)
    const deviceId = ulid(nowMs)

    await dbOf(c.env)
      .insert(devices)
      .values({ id: deviceId, createdAt: nowS, lastSeenAt: nowS, reputation: 1, quotaUsed: 0 })

    const { token, expiresAt } = await signDeviceToken(deviceId, c.env.JWT_SECRET, nowS)
    return c.json({ deviceId, token, expiresAt: new Date(expiresAt * 1000).toISOString() }, 201, {
      'Cache-Control': 'no-store',
    })
  })

  app.post('/device/refresh', async (c) => {
    const header = c.req.header('Authorization')
    const token = header?.startsWith('Bearer ') === true ? header.slice(7) : undefined
    if (token === undefined) return fail(c, 'unauthorized', 'jeton absent')

    const nowS = Math.floor(Date.now() / 1000)
    // Un jeton périmé depuis moins de sept jours identifie encore son appareil :
    // exiger un nouveau Turnstile à chaque ouverture serait une friction inutile.
    const result = await verifyDeviceToken(token, c.env.JWT_SECRET, nowS, { allowExpired: true })
    if (!result.ok) {
      const message =
        result.reason === 'too-old'
          ? `jeton expiré depuis plus de ${REFRESH_GRACE_SECONDS / 86400} jours`
          : 'jeton invalide'
      return fail(c, 'unauthorized', message)
    }

    const db = dbOf(c.env)
    const rows = await db
      .select({ revokedAt: devices.revokedAt })
      .from(devices)
      .where(eq(devices.id, result.deviceId))
      .limit(1)

    const device = rows[0]
    if (device === undefined || device.revokedAt !== null) {
      return fail(c, 'unauthorized', 'jeton invalide')
    }

    await db.update(devices).set({ lastSeenAt: nowS }).where(eq(devices.id, result.deviceId))

    const fresh = await signDeviceToken(result.deviceId, c.env.JWT_SECRET, nowS)
    return c.json(
      {
        deviceId: result.deviceId,
        token: fresh.token,
        expiresAt: new Date(fresh.expiresAt * 1000).toISOString(),
      },
      200,
      { 'Cache-Control': 'no-store' },
    )
  })

  return app
}
