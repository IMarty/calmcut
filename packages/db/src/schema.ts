import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/**
 * Schéma D1 de CalmCut (§6 du cahier des charges).
 *
 * Aucune colonne ne contient de contenu protégé : ni texte de sous-titres, ni
 * extrait, ni vignette. Un segment est une paire d'horaires et une étiquette.
 */

/** Horodatage en secondes Unix : comparable, triable, et lisible dans un dump SQL. */
const timestamp = (name: string) => integer(name, { mode: 'number' })

export const titles = sqliteTable(
  'titles',
  {
    /** ULID. */
    id: text('id').primaryKey(),
    tmdbId: integer('tmdb_id'),
    imdbId: text('imdb_id'),
    kind: text('kind', { enum: ['movie', 'episode'] }).notNull(),
    name: text('name').notNull(),
    year: integer('year').notNull(),
    /** Durée canonique, en secondes. */
    runtimeCanonical: real('runtime_canonical').notNull(),

    /**
     * Bornes du générique, en secondes.
     *
     * **Jamais exposées publiquement** (§6). Elles sont consommées par le
     * filigrane, dont la conception vit dans le dépôt privé `calmcut-watermark`.
     * Un test d'intégration vérifie qu'aucune réponse de l'API ne les contient.
     */
    creditsStart: real('credits_start'),
    creditsEnd: real('credits_end'),

    /** Slug public, non séquentiel : on n'énumère pas le catalogue (§8.2). */
    publicSlug: text('public_slug').notNull(),

    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('titles_tmdb_id_unique').on(table.tmdbId),
    uniqueIndex('titles_public_slug_unique').on(table.publicSlug),
  ],
)

export const titleSources = sqliteTable(
  'title_sources',
  {
    id: text('id').primaryKey(),
    titleId: text('title_id')
      .notNull()
      .references(() => titles.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['netflix', 'disney', 'prime', 'youtube', 'file', 'canonical'],
    }).notNull(),
    externalId: text('external_id').notNull(),
    /** Secondes. `canonique = local × scale + offset`. */
    offset: real('offset').notNull().default(0),
    scale: real('scale').notNull().default(1),
    confidence: real('confidence').notNull().default(0.5),
    method: text('method', { enum: ['subs-align', 'manual', 'fingerprint'] }).notNull(),
  },
  (table) => [
    // C'est l'index qui sert `GET /v1/lookup` : l'extension n'a que l'identifiant
    // de la plateforme, et doit obtenir le titre en une requête.
    uniqueIndex('title_sources_external_unique').on(table.kind, table.externalId),
    index('title_sources_title_id').on(table.titleId),
  ],
)

/**
 * Catalogue des phobies, en base.
 *
 * La source de vérité reste `@calmcut/phobias` : cette table n'existe que pour
 * garantir l'intégrité référentielle des segments et permettre les jointures.
 * Elle est synchronisée depuis le paquet, jamais éditée à la main.
 */
export const phobias = sqliteTable('phobias', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  emoji: text('emoji').notNull(),
})

export const segments = sqliteTable(
  'segments',
  {
    id: text('id').primaryKey(),
    titleId: text('title_id')
      .notNull()
      .references(() => titles.id, { onDelete: 'cascade' }),
    phobiaId: text('phobia_id')
      .notNull()
      .references(() => phobias.id),
    /** Secondes sur la timeline canonique. */
    start: real('start').notNull(),
    end: real('end').notNull(),
    modality: text('modality', { enum: ['meta', 'subs', 'audio', 'video', 'user'] }).notNull(),
    /** Boîte englobante normalisée, pour un futur floutage ciblé. JSON. */
    bbox: text('bbox', { mode: 'json' }),
    origin: text('origin', { enum: ['batch', 'ai-client', 'user'] }).notNull(),
    /**
     * Tous les statuts sauf `disabled` sont appliqués par les clients.
     * L'asymétrie est volontaire : un faux négatif est grave (§7.6).
     */
    status: text('status', {
      enum: ['pending', 'confirmed', 'verified', 'disputed', 'disabled'],
    })
      .notNull()
      .default('pending'),
    score: real('score').notNull().default(0),
    reportsCount: integer('reports_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    // La requête la plus fréquente de tout le système : les segments d'un titre
    // pour les phobies d'un spectateur.
    index('segments_title_phobia').on(table.titleId, table.phobiaId),
    // Le cron d'agrégation balaie les segments à réévaluer.
    index('segments_status_updated').on(table.status, table.updatedAt),
  ],
)

/** Un appareil anonyme. Pas de compte, pas d'e-mail, pas de profil (principe 4). */
export const devices = sqliteTable(
  'devices',
  {
    /** ULID. */
    id: text('id').primaryKey(),
    /** Bornée entre 0,1 et 5 (§7.6). */
    reputation: real('reputation').notNull().default(1),
    createdAt: timestamp('created_at').notNull(),
    lastSeenAt: timestamp('last_seen_at').notNull(),
    /** Jour du quota courant, au format `YYYY-MM-DD` en UTC. */
    quotaDay: text('quota_day'),
    /** Nombre de titres **distincts** consultés ce jour-là. */
    quotaUsed: integer('quota_used').notNull().default(0),
    /** Non nul quand l'appareil a été révoqué pour comportement d'aspiration (§8.3). */
    revokedAt: timestamp('revoked_at'),
  },
  (table) => [index('devices_last_seen').on(table.lastSeenAt)],
)

/**
 * Quels titres un appareil a consultés, et quel jour.
 *
 * §8.2 impose un quota de 50 titres **distincts** par jour. Un simple compteur ne
 * peut pas dire si un titre est nouveau : cette table le dit, et c'est elle qui
 * décide s'il faut incrémenter `devices.quotaUsed`. Sans elle, recharger dix fois
 * la même fiche consommerait dix titres de quota.
 *
 * Les lignes de la veille sont purgées par le cron.
 */
export const deviceTitleAccess = sqliteTable(
  'device_title_access',
  {
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    titleId: text('title_id')
      .notNull()
      .references(() => titles.id, { onDelete: 'cascade' }),
    /** `YYYY-MM-DD` en UTC. */
    day: text('day').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.titleId, table.day] }),
    index('device_title_access_day').on(table.day),
  ],
)

export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    /** Nul quand le signalement n'a pas encore été rattaché à un segment. */
    segmentId: text('segment_id').references(() => segments.id, { onDelete: 'set null' }),
    titleId: text('title_id')
      .notNull()
      .references(() => titles.id, { onDelete: 'cascade' }),
    phobiaId: text('phobia_id')
      .notNull()
      .references(() => phobias.id),
    /** Position canonique signalée, déjà corrigée des 2 s de réaction (§7.6). */
    position: real('position').notNull(),
    kind: text('kind', { enum: ['present', 'false-alarm'] }).notNull(),
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    sourceKind: text('source_kind', {
      enum: ['netflix', 'disney', 'prime', 'youtube', 'file', 'canonical'],
    }),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('reports_title_phobia').on(table.titleId, table.phobiaId),
    index('reports_segment').on(table.segmentId),
    // Sert à la surveillance : combien de signalements par appareil, et à quel rythme.
    index('reports_device_created').on(table.deviceId, table.createdAt),
  ],
)

export const votes = sqliteTable(
  'votes',
  {
    segmentId: text('segment_id')
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    /** +1 ou −1. */
    value: integer('value').notNull(),
    /** Réputation de l'appareil au moment du vote, figée. */
    weight: real('weight').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  // Un vote par appareil et par segment : un second vote remplace le premier.
  (table) => [primaryKey({ columns: [table.segmentId, table.deviceId] })],
)

export const syncIndexes = sqliteTable('sync_indexes', {
  titleId: text('title_id')
    .primaryKey()
    .references(() => titles.id, { onDelete: 'cascade' }),
  /** `SYNC_INDEX_VERSION` de l'index stocké. */
  version: integer('version').notNull(),
  /** Clé R2 du binaire. Le contenu n'est jamais en base. */
  r2Key: text('r2_key').notNull(),
  cuesCount: integer('cues_count').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})

/** Demandes d'ajout de titre, relancées par le cron (§7.8). */
export const titleRequests = sqliteTable(
  'title_requests',
  {
    id: text('id').primaryKey(),
    tmdbId: integer('tmdb_id').notNull(),
    deviceId: text('device_id').references(() => devices.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['pending', 'dispatched', 'done', 'failed'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('title_requests_tmdb_unique').on(table.tmdbId),
    index('title_requests_status').on(table.status),
  ],
)

export type TitleRow = typeof titles.$inferSelect
export type TitleSourceRow = typeof titleSources.$inferSelect
export type SegmentRow = typeof segments.$inferSelect
export type DeviceRow = typeof devices.$inferSelect
export type ReportRow = typeof reports.$inferSelect
export type VoteRow = typeof votes.$inferSelect
export type SyncIndexRow = typeof syncIndexes.$inferSelect
