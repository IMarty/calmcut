# Infrastructure Cloudflare — ce qui se fait à la main

Tout ce qui peut passer par `wrangler` passe par `wrangler`. Ce fichier ne liste que ce qui
**exige** le dashboard ou une décision d'Igor.

> **Règle absolue** : aucune action payante n'est engagée sans validation explicite d'Igor.
> On reste dans les offres gratuites Cloudflare et GitHub (principe 3). Si une limite gratuite
> est atteinte, cela fait l'objet d'une tâche Akiflow, pas d'un upgrade.

## État au 2026-09-30 (fin de M3)

Le code de l'API est prêt et testé, mais **rien n'existe encore côté Cloudflare**. Les
`database_id` de `workers/api/wrangler.jsonc` sont des placeholders, et le déploiement preview
attend les étapes 1 et 2 ci-dessous.

Ce qui est déjà vérifié sans identifiants :

```bash
cd workers/api
bunx wrangler deploy --dry-run --env preview    # valide la configuration et bundle le Worker
```

Le Worker pèse **68 Ko gzip**, très loin de la limite. Les 89 tests d'intégration tournent dans
`workerd` avec un vrai D1 local, donc le SQL des migrations est déjà éprouvé.

## 1. À faire en CLI (jalon M3)

```bash
# Base de données
wrangler d1 create calmcut-db
wrangler d1 create calmcut-db-preview

# Stockage objet : JSON par titre, index de synchro, exports
wrangler r2 bucket create calmcut-data
```

Reporter les `database_id` renvoyés dans `workers/api/wrangler.jsonc` — il y a **trois** endroits :
la section racine, `env.preview` et `env.production`. Puis appliquer les migrations :

```bash
bun run --filter '@calmcut/db' migrate:preview
```

Le binding Rate Limiting utilise `namespace_id: "1001"`. Ce numéro est libre et propre au compte :
il suffit qu'il soit stable, et que deux bindings différents n'utilisent pas le même.

## 2. À faire dans le dashboard — action d'Igor

### 2.1 Turnstile

Créer un widget Turnstile (gratuit) :

1. Dashboard Cloudflare → **Turnstile** → _Add widget_.
2. Nom : `calmcut`, mode **Managed**, domaines : le domaine retenu + `localhost`.
3. Récupérer les deux clés :
   - **site key** → à me communiquer, elle est publique et va dans la configuration du site ;
   - **secret key** → à mettre en secret du Worker, jamais dans le dépôt.

### 2.2 Protection anti-bot et WAF (offre gratuite)

Dashboard Cloudflare → domaine → **Security** :

- **Bot Fight Mode** : activé.
- **AI Scrapers and Crawlers** : bloqué (_Security_ → _Bots_).
- **WAF custom rules** (5 règles en gratuit) :
  | Règle                                   | Expression                                                                                                    | Action            |
  | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------- |
  | Challenge des ASN cloud sur l'API       | `starts_with(http.request.uri.path, "/v1/") and ip.geoip.asnum in {16509 14618 15169 8075 14061 16276 24940}` | Managed Challenge |
  | Bloquer les user-agents vides sur l'API | `starts_with(http.request.uri.path, "/v1/") and http.user_agent eq ""`                                        | Block             |
  | Limiter les méthodes                    | `starts_with(http.request.uri.path, "/v1/") and not http.request.method in {"GET" "POST" "OPTIONS"}`          | Block             |
- **Rate limiting rule** (1 règle en gratuit) : `/v1/*`, 120 requêtes par minute et par IP, blocage
  1 minute. Le quota fin par appareil est appliqué dans le Worker (binding Rate Limiting), pas ici.

### 2.3 Nom de domaine

**Rien n'est acheté sans décision d'Igor.** Le code utilise le placeholder `{{DOMAIN}}`.

Un domaine en `.fr` ou `.org` coûte de l'ordre de 10 à 15 € par an. Cloudflare Registrar le
facture au prix coûtant, mais **le registrar exige que le domaine soit déjà sur un plan payant
pour certaines extensions** : vérifier avant d'acheter.

## 3. Secrets des Workers

```bash
cd workers/api
wrangler secret put JWT_SECRET            # généré : openssl rand -base64 48
wrangler secret put WATERMARK_KEY_v1      # généré : openssl rand -base64 32, rotation trimestrielle
wrangler secret put CANARIES_JSON         # liste des canaris globaux, jamais dans le code
wrangler secret put INGEST_TOKEN          # partagé avec calmcut-batch (secret GitHub côté batch)
wrangler secret put TURNSTILE_SECRET      # secret key du widget
wrangler secret put TMDB_API_KEY
wrangler secret put POSTHOG_KEY
```

Répéter avec `--env preview` et `--env production`. En local, les mêmes valeurs vont dans
`.dev.vars` (ignoré par git), **jamais** dans `wrangler.jsonc`.

## 4. Workers et environnements

| Worker         | Rôle                                      | Déclencheur    |
| -------------- | ----------------------------------------- | -------------- |
| `calmcut-api`  | API publique, ingestion, auth d'appareil  | HTTP           |
| `calmcut-cron` | Agrégation votes → statuts, republication | `*/15 * * * *` |
| `calmcut-web`  | Site Astro + compagnon PWA                | HTTP           |

Chaque `wrangler.jsonc` déclare `env.preview` et `env.production`.

## 5. Secrets et variables GitHub

Dépôt `calmcut` → _Settings_ → _Secrets and variables_ → _Actions_.

**Secrets** (action d'Igor) :

| Secret                  | Où l'obtenir                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Dashboard → _My Profile_ → _API Tokens_ → _Create Token_, droits **Workers Scripts:Edit**, **D1:Edit**, **R2:Edit**, **Workers KV:Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Dashboard → barre latérale de n'importe quel domaine                                                                                     |
| `NPM_TOKEN`             | npmjs.com → _Access Tokens_ → _Granular_, scope `@calmcut`, droit _Read and write_                                                       |

**Variables** — ce sont elles qui activent les workflows, volontairement éteints par défaut :

| Variable                  | Valeur | À activer quand                                         |
| ------------------------- | ------ | ------------------------------------------------------- |
| `DEPLOY_ENABLED`          | `true` | M3, une fois D1, R2 et les secrets Cloudflare en place  |
| `RELEASE_ENABLED`         | `true` | Dès que le scope npm `@calmcut` et `NPM_TOKEN` existent |
| `EXTENSION_BUILD_ENABLED` | `true` | M6                                                      |

Tant qu'une variable vaut autre chose que `true`, le job correspondant est simplement sauté : la CI
reste verte et on ne déploie pas contre une infrastructure inexistante.
