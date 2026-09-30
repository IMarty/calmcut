# API CalmCut

**Jalon d'implémentation : M3.** Ce document fixe le contrat ; `workers/api` l'implémente.

Base : `https://api.{{DOMAIN}}/v1`

## Principes

1. **Aucun endpoint de liste, aucun export.** La seule façon d'obtenir un titre est de le nommer —
   par son `titleId`, ou via `lookup` avec un identifiant de plateforme. Pas de pagination sur les
   segments, pas de `GET /v1/titles`.
2. **Les slugs publics ne sont pas séquentiels.** On ne les énumère pas.
3. **Tout est authentifié par appareil**, sauf la création d'appareil et le résumé SEO public.
4. **Les réponses sont personnalisées par appareil** (filigrane, dépôt privé `calmcut-watermark`), puis
   mises en cache par `(titleId, deviceBucket)`.
5. **Aucun contenu protégé ne transite jamais** : ni audio, ni vidéo, ni texte de sous-titres.
   L'index de synchro ne contient que des hashes irréversibles.

## Authentification

### `POST /v1/device`

Crée un appareil anonyme. Aucun compte, aucune adresse e-mail.

```jsonc
// requête
{ "turnstileToken": "0.abc…" }

// réponse 201
{
  "deviceId": "01JBQ…",          // ULID
  "token": "eyJhbGci…",          // JWT HS256, sub=deviceId, exp=24h, kid
  "expiresAt": "2026-10-01T12:00:00Z"
}
```

`400` si le token Turnstile est invalide ou déjà consommé.

### `POST /v1/device/refresh`

`Authorization: Bearer <jwt>`. Renvoie un nouveau JWT. `401` si le token est expiré depuis plus de
7 jours ou si l'appareil a été révoqué (`revokedAt`).

## Lecture

Toutes ces routes exigent `Authorization: Bearer <jwt>`.

### `GET /v1/lookup?kind=netflix&externalId=70021642`

Résout un identifiant de plateforme vers un `titleId`.

```jsonc
{ "titleId": "01JBQ…" } // 404 si le titre est inconnu
```

**Compte dans le quota de 50 titres distincts par jour.** C'est l'appel qu'un aspirateur devrait
faire en boucle, donc c'est là que le quota mord.

### `GET /v1/titles/:id?phobias=rats,spiders`

Document public du titre (§7.1). Les phobies non demandées ne sont pas renvoyées — inutile de
transmettre des segments que le client n'appliquera pas.

```jsonc
{
  "v": 1,
  "title": { "slug": "ratatouille-2007", "name": "Ratatouille", "year": 2007, "runtime": 6660 },
  "sources": [{ "kind": "netflix", "externalId": "70021642", "offset": -12.3, "scale": 1 }],
  "segments": [
    {
      "id": "01JBR…",
      "phobia": "rats",
      "start": 4331.2,
      "end": 4339.8,
      "modality": "subs",
      "status": "confirmed",
      "score": 0.82,
    },
  ],
  "sync": { "version": 1, "url": "/v1/titles/01JBQ…/sync" },
}
```

`creditsStart` et `creditsEnd` **ne sont jamais présents** : ce sont des colonnes internes dont
l'exposition affaiblirait le filigrane (dépôt privé `calmcut-watermark`).

En-têtes : `Cache-Control: private, max-age=300`, `ETag` calculé sur `(titleId, deviceBucket, kid)`.

### `GET /v1/titles/:id/sync`

Index de synchro binaire (§7.3). `Content-Type: application/octet-stream`.

Format : un en-tête de 16 octets puis un `Uint32Array` de paires.

| Offset | Taille | Contenu                                                                   |
| ------ | ------ | ------------------------------------------------------------------------- |
| 0      | 4      | Magique `CCSY`                                                            |
| 4      | 2      | `SYNC_INDEX_VERSION` (uint16, little-endian)                              |
| 6      | 2      | réservé                                                                   |
| 8      | 4      | nombre de paires (uint32 LE)                                              |
| 12     | 4      | réservé                                                                   |
| 16     | 8 × n  | paires `(hash uint32, cueStart uint32)` — `cueStart` en **centisecondes** |

Le client **refuse** un index dont la version lui est inconnue et retombe en écoute plutôt que de
verrouiller sur des données qu'il ne sait pas interpréter.

### `GET /v1/public/titles/:slug/summary`

**Pas d'authentification** — c'est la route que consomme le rendu SEO du site.

```jsonc
{
  "slug": "ratatouille-2007",
  "name": "Ratatouille",
  "year": 2007,
  "phobias": [{ "phobia": "rats", "count": 4, "verified": true, "firstAround": 4320 }],
}
```

`firstAround` est **arrondi à 5 minutes**. Aucun timestamp précis n'est exposé publiquement (§7.7) :
les pages SEO disent « oui, 4 scènes, vers 1 h 12 », pas les bornes.

## Écriture

### `POST /v1/reports`

```jsonc
{ "titleId": "01JBQ…", "phobia": "rats", "position": 4333.5, "kind": "present" }
```

- La position enregistrée est `position − 2 s` : on signale toujours **après** avoir vu la chose.
- Crée ou rejoint un segment `[t − 3, t + 5]`.
- Les signalements à moins de 5 s l'un de l'autre alimentent le même segment.
- Un seul `present` rend le segment actif pour tout le monde, en `status: 'pending'`.
- `kind: 'false-alarm'` exige **au moins 5 votes pondérés, dont 2 d'appareils de réputation ≥ 2**,
  pour passer un segment en `disabled` (§7.6).

Réponse `202` immédiate : le client affiche un retour en moins de 50 ms et n'attend pas le réseau
(`navigator.sendBeacon` ou file de réessai).

### `POST /v1/votes`

```jsonc
{ "segmentId": "01JBR…", "value": -1 }
```

Un vote par appareil et par segment ; un second vote remplace le premier. Le poids est la réputation
de l'appareil, bornée entre 0,1 et 5.

### `POST /v1/ingest`

Réservé au batch. `Authorization: Bearer <INGEST_TOKEN>` — token de service, pas un JWT d'appareil.

**Idempotent** : rejouer le même lot ne duplique rien. Produit des segments
`origin: 'batch', modality: 'subs', status: 'pending'`.

## Quotas et limites

| Limite                             | Valeur          | Où                           |
| ---------------------------------- | --------------- | ---------------------------- |
| Titres distincts par appareil/jour | 50              | D1 (`quotaDay`, `quotaUsed`) |
| Requêtes par appareil              | 60/min          | binding Rate Limiting        |
| Requêtes par IP                    | 120/min         | règle WAF Cloudflare         |
| Seuil de suspicion                 | 30 titres/heure | bridage, puis `revokedAt`    |

## Codes d'erreur

| Code  | Signification                                                                  |
| ----- | ------------------------------------------------------------------------------ |
| `400` | Requête invalide (Turnstile, phobie inconnue, position hors durée)             |
| `401` | JWT absent, expiré, ou appareil révoqué                                        |
| `403` | Token d'ingestion invalide                                                     |
| `404` | Titre inconnu                                                                  |
| `429` | Quota journalier ou rate limit atteint — l'en-tête `Retry-After` est renseigné |
