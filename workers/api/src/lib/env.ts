/** Bindings et secrets du Worker. Aucun n'est lu ailleurs qu'ici. */
export interface Env {
  readonly DB: D1Database
  readonly DATA: R2Bucket
  /** 60 requêtes par minute et par appareil (§8.2). */
  readonly DEVICE_LIMIT?: RateLimit

  readonly ENVIRONMENT: string
  readonly PUBLIC_ORIGIN: string

  /** Secrets — `wrangler secret put`, jamais dans le dépôt (principe 8). */
  readonly JWT_SECRET: string
  readonly INGEST_TOKEN: string
  readonly TURNSTILE_SECRET: string
  readonly TMDB_API_KEY?: string
  readonly POSTHOG_KEY?: string
}

/** Le binding Rate Limiting des Workers. */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

/** Variables attachées à la requête par les intergiciels. */
export interface Vars {
  deviceId: string
  reputation: number
}

export type AppBindings = { Bindings: Env; Variables: Vars }
