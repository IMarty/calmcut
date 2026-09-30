/**
 * Vérification Turnstile.
 *
 * Injectable : les tests d'intégration ne doivent pas dépendre d'un appel réseau
 * vers Cloudflare, et surtout pas d'un secret.
 */

export interface TurnstileVerifier {
  (token: string, remoteIp: string | undefined): Promise<boolean>
}

const ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Vérificateur réel. */
export const createTurnstileVerifier = (secret: string): TurnstileVerifier => {
  return async (token, remoteIp) => {
    if (token === '') return false

    const body = new FormData()
    body.append('secret', secret)
    body.append('response', token)
    if (remoteIp !== undefined) body.append('remoteip', remoteIp)

    try {
      const response = await fetch(ENDPOINT, { method: 'POST', body })
      if (!response.ok) return false
      const result = await response.json<{ success?: unknown }>()
      return result.success === true
    } catch {
      // Turnstile injoignable : on refuse. Créer un appareil est la porte d'entrée
      // de toute écriture, mieux vaut la fermer que de l'ouvrir en grand.
      return false
    }
  }
}

/**
 * Vérificateur permissif, réservé au développement local.
 *
 * Il n'accepte que les jetons de test documentés par Cloudflare, jamais n'importe
 * quelle chaîne : un `always-pass` accidentellement déployé serait une porte ouverte.
 */
export const createDevVerifier = (): TurnstileVerifier => {
  const accepted = new Set(['XXXX.DUMMY.TOKEN.XXXX', 'dev'])
  return (token) => Promise.resolve(accepted.has(token))
}
