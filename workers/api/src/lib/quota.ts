import { devices, deviceTitleAccess } from '@calmcut/db'
import { and, eq, sql } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/d1'
import { utcDay } from './http.js'

/**
 * Quota de titres distincts par appareil et par jour (§8.2).
 *
 * « Distincts » est le mot important. Un simple compteur d'appels punirait
 * l'utilisateur normal — qui recharge sa fiche, revient au film le lendemain — sans
 * gêner l'aspirateur, dont le coût est justement le nombre de titres différents.
 * D'où la table `device_title_access` : elle dit si ce titre-là est nouveau
 * aujourd'hui, et seul un titre nouveau consomme du quota.
 */

export const DAILY_DISTINCT_TITLES = 50

/** Au-delà, l'appareil est bridé puis révoqué (§8.3). */
export const SUSPICIOUS_TITLES_PER_HOUR = 30

type Db = ReturnType<typeof drizzle>

export type QuotaOutcome =
  | { readonly allowed: true; readonly used: number; readonly fresh: boolean }
  | { readonly allowed: false; readonly used: number }

/**
 * Enregistre la consultation d'un titre et dit si elle est permise.
 *
 * Un titre **déjà consulté aujourd'hui** passe toujours, même quota atteint : une
 * fois le quota dépensé, l'utilisateur doit pouvoir continuer à regarder les films
 * qu'il avait ouverts. Refuser reviendrait à interrompre une protection en cours.
 */
export const consumeTitleQuota = async (
  db: Db,
  deviceId: string,
  titleId: string,
  nowMs: number,
  limit: number = DAILY_DISTINCT_TITLES,
): Promise<QuotaOutcome> => {
  const day = utcDay(nowMs)

  const seen = await db
    .select({ titleId: deviceTitleAccess.titleId })
    .from(deviceTitleAccess)
    .where(
      and(
        eq(deviceTitleAccess.deviceId, deviceId),
        eq(deviceTitleAccess.titleId, titleId),
        eq(deviceTitleAccess.day, day),
      ),
    )
    .limit(1)

  const device = await db
    .select({ quotaDay: devices.quotaDay, quotaUsed: devices.quotaUsed })
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1)

  const row = device[0]
  const used = row !== undefined && row.quotaDay === day ? row.quotaUsed : 0

  if (seen.length > 0) return { allowed: true, used, fresh: false }

  if (used >= limit) return { allowed: false, used }

  await db.insert(deviceTitleAccess).values({ deviceId, titleId, day }).onConflictDoNothing()
  await db
    .update(devices)
    .set({
      quotaDay: day,
      // `CASE` plutôt qu'une lecture puis une écriture : deux requêtes simultanées
      // du même appareil ne doivent pas se marcher dessus sur le compteur.
      quotaUsed: sql`CASE WHEN ${devices.quotaDay} = ${day} THEN ${devices.quotaUsed} + 1 ELSE 1 END`,
      lastSeenAt: Math.floor(nowMs / 1000),
    })
    .where(eq(devices.id, deviceId))

  return { allowed: true, used: used + 1, fresh: true }
}

/** Nombre de titres distincts consultés par l'appareil aujourd'hui. */
export const quotaUsage = async (db: Db, deviceId: string, nowMs: number): Promise<number> => {
  const day = utcDay(nowMs)
  const rows = await db
    .select({ quotaDay: devices.quotaDay, quotaUsed: devices.quotaUsed })
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1)
  const row = rows[0]
  return row !== undefined && row.quotaDay === day ? row.quotaUsed : 0
}
