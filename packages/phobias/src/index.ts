import type { PhobiaId, PhobiaProfile } from '@calmcut/core'
import { allPhobias } from './profiles.js'

export * from './profiles.js'

const byId = new Map<string, PhobiaProfile>(allPhobias.map((profile) => [profile.id, profile]))

/** Profils proposés aux utilisateurs. */
export const enabledPhobias: readonly PhobiaProfile[] = allPhobias.filter(
  (profile) => profile.enabled,
)

/** Cherche un profil par identifiant, activé ou non. */
export const findPhobia = (id: string): PhobiaProfile | undefined => byId.get(id)

/** Vrai si l'identifiant correspond à une phobie activée. */
export const isEnabledPhobia = (id: string): boolean => byId.get(id)?.enabled === true

/** Filtre une liste d'identifiants reçus d'un client vers les seules phobies activées. */
export const resolveEnabledPhobias = (ids: readonly string[]): readonly PhobiaId[] =>
  ids.filter(isEnabledPhobia).map((id) => byId.get(id)?.id as PhobiaId)
export * from './detect.js'
