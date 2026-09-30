import { jwtVerify, SignJWT, type JWTPayload } from 'jose'

/**
 * Jetons d'appareil.
 *
 * HS256 avec `jose` plutôt qu'une implémentation maison : la vérification de JWT
 * est exactement l'endroit où écrire son propre code coûte cher — confusion
 * d'algorithme, `alg: none`, comparaison non constante. `jose` tourne nativement
 * dans les Workers et pèse 400 Ko en source, dont une fraction est retenue au
 * bundling.
 */

export const TOKEN_TTL_SECONDS = 24 * 60 * 60
/** Au-delà, un jeton expiré ne peut plus être rafraîchi : il faut refaire un Turnstile. */
export const REFRESH_GRACE_SECONDS = 7 * 24 * 60 * 60

const ISSUER = 'calmcut'
const AUDIENCE = 'calmcut-device'
const ALGORITHM = 'HS256'

export interface DeviceToken {
  readonly token: string
  readonly expiresAt: number
}

const keyOf = (secret: string): Uint8Array => new TextEncoder().encode(secret)

/** Signe un jeton d'appareil. `now` en secondes. */
export const signDeviceToken = async (
  deviceId: string,
  secret: string,
  now: number,
): Promise<DeviceToken> => {
  const expiresAt = now + TOKEN_TTL_SECONDS
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT', kid: 'v1' })
    .setSubject(deviceId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(keyOf(secret))
  return { token, expiresAt }
}

export type TokenFailure = 'malformed' | 'bad-signature' | 'expired' | 'too-old'

export type TokenResult =
  | { readonly ok: true; readonly deviceId: string; readonly expired: false }
  /** Expiré mais dans le délai de grâce : rafraîchissable, pas utilisable. */
  | { readonly ok: true; readonly deviceId: string; readonly expired: true }
  | { readonly ok: false; readonly reason: TokenFailure }

/**
 * Vérifie un jeton.
 *
 * `allowExpired` sert à `POST /v1/device/refresh` : un jeton périmé depuis moins de
 * sept jours identifie encore son appareil, et exiger un nouveau Turnstile à
 * chaque ouverture d'application serait une friction inutile. Il ne donne jamais
 * accès aux autres routes pour autant.
 */
export const verifyDeviceToken = async (
  token: string,
  secret: string,
  now: number,
  options: { readonly allowExpired?: boolean } = {},
): Promise<TokenResult> => {
  try {
    const { payload } = await jwtVerify(token, keyOf(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      // On fixe l'algorithme : sans cela, un jeton annonçant `alg: none` ou un
      // algorithme asymétrique pourrait être accepté.
      algorithms: [ALGORITHM],
      currentDate: new Date(now * 1000),
    })
    const deviceId = payload.sub
    if (typeof deviceId !== 'string' || deviceId === '') return { ok: false, reason: 'malformed' }
    return { ok: true, deviceId, expired: false }
  } catch (error) {
    if (!isExpiredError(error)) return { ok: false, reason: classify(error) }
    if (options.allowExpired !== true) return { ok: false, reason: 'expired' }

    // Jeton expiré : on relit la charge utile sans vérifier la date, mais **avec**
    // vérification de signature — sinon n'importe qui forgerait un rafraîchissement.
    try {
      const { payload } = await jwtVerify(token, keyOf(secret), {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: [ALGORITHM],
        clockTolerance: REFRESH_GRACE_SECONDS,
        currentDate: new Date(now * 1000),
      })
      const deviceId = payload.sub
      if (typeof deviceId !== 'string' || deviceId === '') return { ok: false, reason: 'malformed' }
      return { ok: true, deviceId, expired: true }
    } catch {
      return { ok: false, reason: 'too-old' }
    }
  }
}

const isExpiredError = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ERR_JWT_EXPIRED'

const classify = (error: unknown): TokenFailure => {
  if (!(error instanceof Error) || !('code' in error)) return 'malformed'
  return error.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' ? 'bad-signature' : 'malformed'
}

export type { JWTPayload }
