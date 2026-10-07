import { devices } from '@calmcut/db'
import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { signDeviceToken, TOKEN_TTL_SECONDS } from '../src/lib/token.js'
import { createDevice, db, postJson, request, resetDatabase, tokenFor } from './helpers.js'

beforeEach(resetDatabase)

describe('POST /v1/device', () => {
  it('refuse une requête sans jeton Turnstile', async () => {
    const response = await postJson('/v1/device', {})
    expect(response.status).toBe(400)
  })

  it('refuse un jeton Turnstile invalide', async () => {
    const response = await postJson('/v1/device', { turnstileToken: 'nawak' })
    expect(response.status).toBe(400)
  })

  it('crée un appareil et renvoie un jeton', async () => {
    const response = await postJson('/v1/device', { turnstileToken: 'dev' })
    expect(response.status).toBe(201)
    const body = await response.json<Record<string, unknown>>()
    expect(typeof body.deviceId).toBe('string')
    expect(typeof body.token).toBe('string')
    expect(typeof body.expiresAt).toBe('string')
  })

  it('ne demande ni e-mail, ni mot de passe, ni rien de personnel', async () => {
    const response = await postJson('/v1/device', { turnstileToken: 'dev' })
    const body = await response.json<Record<string, unknown>>()
    // Principe 4 : un appareil n'est pas un compte.
    expect(Object.keys(body).sort()).toEqual(['deviceId', 'expiresAt', 'token'])
  })

  it('n’autorise pas la mise en cache du jeton', async () => {
    const response = await postJson('/v1/device', { turnstileToken: 'dev' })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('crée bien la ligne en base, avec une réputation de 1', async () => {
    const { deviceId } = await createDevice()
    const rows = await db().select().from(devices).where(eq(devices.id, deviceId))
    expect(rows[0]?.reputation).toBe(1)
    expect(rows[0]?.revokedAt).toBeNull()
  })
})

describe('accès protégé', () => {
  it('refuse une route sans jeton', async () => {
    const response = await request('/v1/lookup?kind=netflix&externalId=1')
    expect(response.status).toBe(401)
  })

  it('refuse un jeton qui n’en est pas un', async () => {
    const response = await request('/v1/lookup?kind=netflix&externalId=1', { token: 'pas-un-jwt' })
    expect(response.status).toBe(401)
  })

  it('refuse un jeton dont la signature a été modifiée', async () => {
    const { token } = await createDevice()
    const [header, payload, signature] = token.split('.')
    const tampered = `${header}.${payload}.${(signature as string).slice(0, -2)}xy`
    const response = await request('/v1/lookup?kind=netflix&externalId=1', { token: tampered })
    expect(response.status).toBe(401)
  })

  it('refuse un jeton dont la charge utile a été modifiée', async () => {
    const { token } = await createDevice()
    const [header, , signature] = token.split('.')
    const forged = btoa(JSON.stringify({ sub: 'AUTRE-APPAREIL' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    const response = await request('/v1/lookup?kind=netflix&externalId=1', {
      token: `${header}.${forged}.${signature}`,
    })
    expect(response.status).toBe(401)
  })

  it('refuse un jeton non signé (alg: none)', async () => {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
    const payload = btoa(
      JSON.stringify({
        sub: 'FAUX',
        iss: 'calmcut',
        aud: 'calmcut-device',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    )
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
    const response = await request('/v1/lookup?kind=netflix&externalId=1', {
      token: `${header}.${payload}.`,
    })
    expect(response.status).toBe(401)
  })

  it('refuse un jeton signé avec un autre secret', async () => {
    const { deviceId } = await createDevice()
    const foreign = await signDeviceToken(
      deviceId,
      'un-autre-secret',
      Math.floor(Date.now() / 1000),
    )
    const response = await request('/v1/lookup?kind=netflix&externalId=1', { token: foreign.token })
    expect(response.status).toBe(401)
  })

  it('refuse un jeton expiré', async () => {
    const { deviceId } = await createDevice()
    const old = Math.floor(Date.now() / 1000) - TOKEN_TTL_SECONDS - 60
    const response = await request('/v1/lookup?kind=netflix&externalId=1', {
      token: await tokenFor(deviceId, old),
    })
    expect(response.status).toBe(401)
  })

  it('refuse un jeton valide dont l’appareil a été révoqué', async () => {
    const { deviceId, token } = await createDevice()
    await db()
      .update(devices)
      .set({ revokedAt: Math.floor(Date.now() / 1000) })
      .where(eq(devices.id, deviceId))

    const response = await request('/v1/lookup?kind=netflix&externalId=1', { token })
    expect(response.status).toBe(401)
  })

  it('refuse un jeton dont l’appareil n’existe pas en base', async () => {
    const orphan = await signDeviceToken(
      '01JBQ0000000000000000ORPHAN'.slice(0, 26),
      env.JWT_SECRET,
      Math.floor(Date.now() / 1000),
    )
    const response = await request('/v1/lookup?kind=netflix&externalId=1', { token: orphan.token })
    expect(response.status).toBe(401)
  })
})

describe('POST /v1/device/refresh', () => {
  it('renouvelle un jeton encore valide', async () => {
    const { deviceId, token } = await createDevice()
    const response = await postJson('/v1/device/refresh', {}, { token })
    expect(response.status).toBe(200)
    const body = await response.json<{ deviceId: string; token: string }>()
    expect(body.deviceId).toBe(deviceId)
    expect(typeof body.token).toBe('string')
  })

  it('renouvelle un jeton expiré depuis moins de sept jours', async () => {
    const { deviceId } = await createDevice()
    const recentlyExpired = Math.floor(Date.now() / 1000) - TOKEN_TTL_SECONDS - 3600
    const response = await postJson(
      '/v1/device/refresh',
      {},
      { token: await tokenFor(deviceId, recentlyExpired) },
    )
    // Exiger un nouveau Turnstile à chaque ouverture serait une friction inutile.
    expect(response.status).toBe(200)
  })

  it('refuse un jeton expiré depuis plus de sept jours', async () => {
    const { deviceId } = await createDevice()
    const longExpired = Math.floor(Date.now() / 1000) - TOKEN_TTL_SECONDS - 8 * 86_400
    const response = await postJson(
      '/v1/device/refresh',
      {},
      { token: await tokenFor(deviceId, longExpired) },
    )
    expect(response.status).toBe(401)
  })

  it('refuse de renouveler le jeton d’un appareil révoqué', async () => {
    const { deviceId, token } = await createDevice()
    await db()
      .update(devices)
      .set({ revokedAt: Math.floor(Date.now() / 1000) })
      .where(eq(devices.id, deviceId))

    const response = await postJson('/v1/device/refresh', {}, { token })
    expect(response.status).toBe(401)
  })

  it('refuse sans jeton du tout', async () => {
    const response = await postJson('/v1/device/refresh', {})
    expect(response.status).toBe(401)
  })
})
