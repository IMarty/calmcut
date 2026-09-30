# Mise en route — guide pas à pas pour Igor

Tout ce que je ne peux pas faire moi-même, dans l'ordre où le faire. Coche au fur et à mesure.

**Règle de sécurité, une seule :** ne me colle jamais une clé **secrète** en clair. Les clés
publiques (site key Turnstile, clé publique PostHog), oui. Les secrètes, tu les saisis toi-même
là où c'est indiqué, et tu me dis juste « c'est fait ».

| Étape                                                                        | Durée  | Ce que ça débloque                    | Coût                          |
| ---------------------------------------------------------------------------- | ------ | ------------------------------------- | ----------------------------- |
| [1. Fusionner la PR #5](#étape-1--fusionner-la-pr-5)                         | 2 min  | **remet M1, M2 et M3 sur `main`**     | —                             |
| [2. Supprimer 2 dépôts parasites](#étape-2--supprimer-deux-dépôts-parasites) | 2 min  | hygiène                               | —                             |
| [3. Tester le POC](#étape-3--tester-le-poc-le-plus-important)                | 30 min | **valide M2, décide de la viabilité** | —                             |
| [4. Cloudflare](#étape-4--cloudflare)                                        | 20 min | **termine M3**                        | gratuit                       |
| [5. Secrets GitHub](#étape-5--secrets-et-variables-github)                   | 10 min | le déploiement automatique            | —                             |
| [6. Clés TMDB et OpenSubtitles](#étape-6--clés-dapi-pour-le-batch)           | 15 min | **M4**                                | gratuit                       |
| [7. npm](#étape-7--npm)                                                      | 5 min  | publication des 3 paquets             | gratuit                       |
| [8. Plus tard](#étape-8--plus-tard)                                          | —      | M9                                    | **le domaine coûte ~12 €/an** |

Si tu ne fais qu'une chose aujourd'hui : **l'étape 3**. C'est elle qui dit si le produit
fonctionne. Tout le reste peut attendre.

---

## Étape 1 — Fusionner la PR #5

**Ce qui s'est passé avec les quatre premières :** elles étaient empilées, tu les as fusionnées en
cinquante secondes, et GitHub ne recible une PR sur `main` qu'**après** la suppression de sa
branche de base. Il n'en a pas eu le temps : #2 est allée dans `m0/socle`, #3 dans `m1/sync-lock`,
#4 dans `m2/companion-poc`. Ces branches ont été supprimées, et seul **M0** est arrivé sur `main`.

Rien n'était perdu, et ce n'est pas ta faute : empiler quatre PR sans t'avertir de ce délai était
une erreur de ma part. **[La PR #5](https://github.com/IMarty/calmcut/pull/5) remet tout sur
`main`**, et elle est seule — donc sans piège.

1. Ouvre **<https://github.com/IMarty/calmcut/pull/5>**
2. Bandeau vert en bas → flèche à droite du bouton → **« Squash and merge »**
3. **« Confirm squash and merge »**, puis **« Delete branch »**

Vérifie ensuite que ces quatre fichiers existent bien sur
**<https://github.com/IMarty/calmcut>** :

```
packages/sync/src/tracker.ts
apps/web/src/components/Companion.svelte
workers/api/src/app.ts
packages/db/src/schema.ts
```

> **Pour la suite :** je n'empilerai plus de PR. Une par jalon, fusionnée avant que j'ouvre la
> suivante.

- [ ] PR #5 fusionnée, les quatre fichiers sont là

---

## Étape 2 — Supprimer deux dépôts parasites

Deux dépôts que j'ai créés et que je n'ai pas le droit de supprimer (le jeton `gh` n'a pas la
permission `delete_repo`).

**`ci-billing-check`** — un dépôt jetable créé pour vérifier qu'un dépôt public débloquait bien
GitHub Actions. Il ne contient rien d'utile. Je l'ai repassé en privé en attendant.

**`calmcut-private-origin`** — l'ancien dépôt privé, remplacé par le dépôt public. Il contient
l'historique d'où le filigrane a été extrait. **Rien n'y est unique** : tout est soit dans
`calmcut` (public), soit dans `calmcut-watermark` (privé).

Pour chacun :

1. Ouvre **<https://github.com/IMarty/ci-billing-check/settings>**
2. Descends tout en bas, zone rouge **« Danger Zone »**
3. Clique **« Delete this repository »**
4. Tape le nom complet demandé : `IMarty/ci-billing-check`
5. Confirme

Puis la même chose pour **<https://github.com/IMarty/calmcut-private-origin/settings>**.

> **Alternative, si tu préfères que je m'en charge :** tape dans notre conversation
> `! gh auth refresh -h github.com -s delete_repo`, suis l'authentification dans le navigateur,
> et dis-moi. Je les supprimerai.

- [ ] Les deux dépôts sont supprimés

---

## Étape 3 — Tester le POC _(le plus important)_

C'est le **critère d'acceptation de M2**, et je ne peux pas l'exécuter : il faut une vraie
télévision, un vrai micro et une vraie pièce.

> **Deuxième essai.** Le premier a échoué pour une raison entièrement de mon fait : je ne
> transmettais jamais la langue à la reconnaissance vocale, qui transcrivait donc en anglais.
> Un film français transcrit en anglais ne peut correspondre à aucune réplique française — le
> verrouillage était impossible par construction, et l'interface se contentait d'afficher
> « à l'écoute » sans rien expliquer.
>
> Corrigé : la langue est désormais **obligatoire** dans le code (le compilateur refuse de
> l'omettre), déduite des sous-titres, et **corrigeable dans l'interface**. Un panneau de
> diagnostic dit maintenant précisément où ça bloque, pour qu'un échec ne soit plus muet.

### Ce qu'il te faut

- Un film, et **le fichier `.srt` qui correspond à la version que tu vas regarder**. C'est le
  point critique : un `.srt` d'une autre édition est décalé de plusieurs secondes et le test ne
  voudra rien dire.
- Idéalement un film avec des scènes de rats ou d'araignées, pour voir la détection travailler.
  Sinon, n'importe quel film : vérifie au moins le verrouillage.
- Un casque, de préférence. Le bruit blanc masque mieux, et le micro entend mieux.

### Lancer

```bash
cd ~/Playground/CalmCut
bun install
bun run --filter '@calmcut/web' dev
```

Ouvre **<http://localhost:4321/watch/demo>**

> ⚠️ Le micro exige un contexte sécurisé. `localhost` fonctionne. Une adresse IP du réseau local
> **non** : pour essayer depuis ton téléphone il faudrait du HTTPS, ce qui viendra avec le
> déploiement.

### Protocole

1. **Charge le `.srt`** avec le sélecteur de fichier. Une liste dépliée affiche **les horaires
   de chaque scène repérée** (`01:12:11 → 01:12:20`, avec l'emoji de la phobie et la durée).
   **Sers-t'en pour aller vite** : avance le film juste avant l'une d'elles plutôt que
   d'attendre.
2. **VÉRIFIE LA LANGUE.** Un menu « Langue parlée dans le film » apparaît sous le nom du
   fichier, prérempli d'après les sous-titres. **C'est le réglage le plus important de tout le
   compagnon** : une mauvaise langue rend la synchronisation _impossible_, parce que la
   reconnaissance vocale produit alors un texte qui ne peut correspondre à aucune réplique.
3. Choisis la **qualité** : « Rapide » (39 Mo) suffit souvent en anglais ; **« Précise »
   (145 Mo) est nettement plus fiable en français** et dans les autres langues.
4. Coche les phobies.
5. Clique **« Commencer à écouter »**. Le modèle se télécharge une fois, avec une barre de
   progression. Accepte l'accès au micro.
6. **Lance le film. Démarre un chrono.**
7. **Combien de temps jusqu'à ce que l'écran affiche une position `HH:MM:SS` ?**
   → l'objectif est **moins de 30 secondes**.
8. **Ouvre le panneau « Diagnostic »** en bas de l'écran. Il se déplie tout seul au premier
   relevé. Il te dit exactement où ça bloque :

   | Ce que tu lis                  | Ce que ça veut dire                                                                           |
   | ------------------------------ | --------------------------------------------------------------------------------------------- |
   | « Trigrammes extraits : 0 »    | le micro n'entend pas assez le film — monte le son, rapproche l'appareil                      |
   | « Trigrammes concordants : 0 » | **la langue est probablement fausse**, ou le `.srt` ne correspond pas à cette version du film |
   | Concordants entre 1 et 2       | ça accroche mais pas assez — essaie la qualité « Précise »                                    |
   | Concordants ≥ 3                | ça verrouille                                                                                 |

   La **dernière transcription** y est affichée : c'est le moyen le plus direct de voir si la
   reconnaissance vocale fait son travail. Elle reste sur ton appareil et n'est envoyée nulle part.

9. **La position affichée correspond-elle à la position réelle du film ?** À combien près ?
   Une fois synchronisé, l'écran annonce aussi **« Prochaine scène : 🐀 01:12:11 — dans 4 min »**.
10. Avance juste avant une scène. **Le compte à rebours arrive-t-il avant la scène ?**
11. **Mets le film en pause 20 secondes**, puis reprends. Le compagnon se recale-t-il ?
12. **Avance de 10 minutes** dans le film. Se recale-t-il ?

### Ce que tu me renvoies

```
Langue proposée automatiquement : ___   (bonne ? oui / non)
Qualité utilisée            : Rapide / Précise
Temps jusqu'au verrouillage : ___ s
Écart de position observé   : ___ s
WebGPU ou WASM              : ___        (affiché en bas de l'écran)
Compte à rebours avant la scène : OUI / NON / en retard de ___ s
Après une pause de 20 s     : se recale en ___ s / ne se recale pas
Après un saut de 10 min     : se recale en ___ s / ne se recale pas

DIAGNOSTIC au moment où ça ne marche pas (s'il y a lieu) :
  répliques entendues   : ___
  trigrammes extraits   : ___
  trigrammes concordants: ___
  dernière transcription: ___
```

Et surtout : **tout ce qui t'a paru désagréable, effrayant ou pénible.** Un compte à rebours
trop brusque, un bruit blanc trop fort, une voix qui surprend — c'est au moins aussi important
que les chiffres. On construit un outil pour des gens déjà en alerte.

### Si ça ne verrouille toujours pas

Le panneau de diagnostic répond à la question à ma place. Dans l'ordre de probabilité :

1. **La langue.** Vérifie le menu. C'est ce qui a fait échouer le premier essai.
2. **Le `.srt` ne correspond pas à ta version du film.** Version longue, édition différente,
   autre découpage : les horaires sont décalés et rien ne concorde.
3. **La qualité « Rapide » est trop faible pour ta langue.** Passe en « Précise ».
4. **Le micro n'entend pas assez.** Si « trigrammes extraits » reste à 0, c'est ça.

Le bouton **« Se resynchroniser »** force un nouvel essai sans tout relancer.

- [ ] Test effectué, résultats envoyés

---

## Étape 4 — Cloudflare

Tout est **gratuit**. C'est la moitié manquante du critère de M3.

### 4.1 Se connecter et récupérer l'identifiant de compte

```bash
cd ~/Playground/CalmCut/workers/api
bunx wrangler login
```

Un onglet s'ouvre, tu autorises, tu reviens au terminal.

Puis :

```bash
bunx wrangler whoami
```

Ça affiche un tableau avec ton **Account ID** (32 caractères hexadécimaux). **Note-le**, il sert
deux fois. Ce n'est pas un secret, tu peux me le donner.

- [ ] `wrangler login` fait, Account ID noté

### 4.2 Créer les deux bases et le bucket

```bash
cd ~/Playground/CalmCut/workers/api
bunx wrangler d1 create calmcut-db-preview
bunx wrangler d1 create calmcut-db
bunx wrangler r2 bucket create calmcut-data
```

Chaque `d1 create` affiche un bloc contenant `database_id = "..."`. **Copie les deux
identifiants.**

> Si R2 demande d'activer le service la première fois, accepte : le palier gratuit couvre
> largement nos besoins (10 Go de stockage, un million d'opérations par mois).

- [ ] Les deux bases et le bucket sont créés, les deux `database_id` sont notés

### 4.3 Reporter les identifiants dans la configuration

Ouvre **`workers/api/wrangler.jsonc`** dans ton éditeur. Cherche `PLACEHOLDER_A_REMPLACER` — il
apparaît **trois fois** :

| Emplacement dans le fichier                   | Valeur à mettre                            |
| --------------------------------------------- | ------------------------------------------ |
| Section racine (`d1_databases`, tout en haut) | l'id de **`calmcut-db-preview`**           |
| `env.preview`                                 | l'id de **`calmcut-db-preview`** (le même) |
| `env.production`                              | l'id de **`calmcut-db`**                   |

Les `database_id` ne sont **pas** des secrets : ils sont inutilisables sans ton API token, et
c'est pour ça qu'ils vivent dans un fichier versionné.

Vérifie que rien n'est cassé :

```bash
cd ~/Playground/CalmCut/workers/api
bunx wrangler deploy --dry-run --env preview
```

Ça doit finir par `--dry-run: exiting now.` sans erreur.

- [ ] Les trois placeholders sont remplacés, le dry-run passe

### 4.4 Appliquer les migrations

```bash
cd ~/Playground/CalmCut
bun run --filter '@calmcut/db' migrate:preview
```

Ça crée les dix tables dans la base preview. Wrangler demande confirmation, réponds oui.

- [ ] Migrations appliquées

### 4.5 Créer le widget Turnstile

Turnstile est le anti-robot de Cloudflare. C'est lui qui empêche de créer des milliers
d'appareils pour contourner le quota.

1. Va sur **<https://dash.cloudflare.com>**
2. Dans le menu de gauche, clique **« Turnstile »**
3. Clique **« Add widget »**
4. Remplis :
   - **Widget name** : `calmcut`
   - **Hostnames** : ajoute `localhost` (et le domaine plus tard, quand il existera)
   - **Widget Mode** : **Managed**
5. Clique **« Create »**
6. La page affiche deux clés :
   - **Site Key** → **publique**, tu peux me la donner telle quelle
   - **Secret Key** → **secrète**, garde-la sous les yeux pour l'étape suivante

- [ ] Widget créé, Site Key notée

### 4.6 Enregistrer les secrets du Worker

Chaque commande te demande la valeur, tu la colles, tu appuies sur Entrée. Rien n'apparaît à
l'écran et rien n'est écrit dans le dépôt.

D'abord, génère les deux secrets qui n'existent pas encore :

```bash
openssl rand -base64 48    # → pour JWT_SECRET
openssl rand -base64 32    # → pour INGEST_TOKEN, garde-le, le batch en aura besoin à M4
```

Puis :

```bash
cd ~/Playground/CalmCut/workers/api

bunx wrangler secret put JWT_SECRET --env preview
bunx wrangler secret put INGEST_TOKEN --env preview
bunx wrangler secret put TURNSTILE_SECRET --env preview
```

`TURNSTILE_SECRET` est la **Secret Key** de l'étape 4.5.

> `TMDB_API_KEY` et `POSTHOG_KEY` viendront aux étapes 6 et 8. L'API fonctionne sans eux.

- [ ] Les trois secrets sont enregistrés

### 4.7 Protéger l'API dans le tableau de bord

Ces réglages sont gratuits et ne prennent que quelques clics. Ils n'ont de sens qu'une fois le
domaine branché, donc **tu peux sauter cette section pour l'instant** et y revenir à l'étape 8.

1. **<https://dash.cloudflare.com>** → ton domaine → **Security**
2. **Bots** → active **« Bot Fight Mode »**
3. **Bots** → active le blocage des **« AI Scrapers and Crawlers »**
4. **WAF → Custom rules → Create rule** :
   - Nom : `Challenge ASN cloud sur l'API`
   - Expression (bascule en mode **Edit expression** et colle) :
     ```
     starts_with(http.request.uri.path, "/v1/") and ip.geoip.asnum in {16509 14618 15169 8075 14061 16276 24940}
     ```
   - Action : **Managed Challenge**
5. **WAF → Rate limiting rules → Create rule** :
   - Chemin : `/v1/*`
   - 120 requêtes par minute et par IP
   - Action : **Block**, durée 1 minute

- [ ] (optionnel pour l'instant) Protections activées

---

## Étape 5 — Secrets et variables GitHub

C'est ce qui permet au déploiement automatique de fonctionner.

### 5.1 Créer un API token Cloudflare

1. **<https://dash.cloudflare.com/profile/api-tokens>**
2. **« Create Token »** → tout en bas, **« Create Custom Token »** → **« Get started »**
3. **Token name** : `calmcut-ci`
4. Dans **Permissions**, ajoute quatre lignes avec le bouton **« + Add more »** :

   |         |                    |      |
   | ------- | ------------------ | ---- |
   | Account | Workers Scripts    | Edit |
   | Account | D1                 | Edit |
   | Account | Workers R2 Storage | Edit |
   | Account | Workers KV Storage | Edit |

5. **Account Resources** : `Include` → ton compte
6. **« Continue to summary »** → **« Create Token »**
7. Le token n'est affiché **qu'une fois**. Copie-le tout de suite.

- [ ] Token créé

### 5.2 Enregistrer les secrets

1. **<https://github.com/IMarty/calmcut/settings/secrets/actions>**
2. **« New repository secret »**, deux fois :

   | Name                    | Secret                      |
   | ----------------------- | --------------------------- |
   | `CLOUDFLARE_API_TOKEN`  | le token de l'étape 5.1     |
   | `CLOUDFLARE_ACCOUNT_ID` | l'Account ID de l'étape 4.1 |

- [ ] Les deux secrets sont enregistrés

### 5.3 Activer le déploiement

1. **<https://github.com/IMarty/calmcut/settings/variables/actions>**
2. **« New repository variable »** :

   | Name             | Value  |
   | ---------------- | ------ |
   | `DEPLOY_ENABLED` | `true` |

3. Va sur **<https://github.com/IMarty/calmcut/actions/workflows/deploy.yml>**
4. **« Run workflow »** → environnement **`preview`** → **« Run workflow »**

Le job s'appelle **« migrations D1 · API »**. S'il devient vert, l'API est déployée.

> Le workflow ne déploie que l'API : le site (M5) et le cron (M7) n'existent pas encore, et
> leurs étapes seront ajoutées par les PR de ces jalons. C'était un défaut que j'ai corrigé —
> la version précédente aurait échoué ici.

Récupère l'URL affichée dans les journaux (du type
`https://calmcut-api-preview.TON-SOUS-DOMAINE.workers.dev`) et teste :

```bash
curl https://calmcut-api-preview.TON-SOUS-DOMAINE.workers.dev/health
```

Tu dois voir `{"ok":true,"environment":"preview"}`.

Optionnel mais utile : ajoute une variable `API_HEALTH_URL` avec cette URL `/health`. Les
déploiements suivants vérifieront automatiquement que le Worker répond.

- [ ] Déploiement preview réussi, `/health` répond

**Dis-moi quand cette étape passe : elle termine M3.**

---

## Étape 6 — Clés d'API pour le batch

Nécessaire pour M4. Les deux sont gratuites.

### 6.1 TMDB

1. Crée un compte sur **<https://www.themoviedb.org/signup>** si tu n'en as pas
2. **<https://www.themoviedb.org/settings/api>**
3. Demande une clé — type **Developer**, usage personnel / open source. C'est accepté
   automatiquement.
4. Copie l'**API Read Access Token** (le long, format JWT), pas la clé v3 courte

Enregistre-la :

```bash
cd ~/Playground/CalmCut/workers/api
bunx wrangler secret put TMDB_API_KEY --env preview
```

- [ ] Clé TMDB enregistrée

### 6.2 OpenSubtitles

1. Crée un compte sur **<https://www.opensubtitles.com>**
2. **<https://www.opensubtitles.com/fr/consumers>** → **« New consumer »**
3. Nom : `calmcut`, usage : non commercial
4. Récupère l'**Api-Key**

**Ne l'enregistre pas encore** : elle servira dans le dépôt `calmcut-batch`, que je créerai à
M4. Garde-la de côté et dis-moi juste que tu l'as.

**Regarde les quotas** de ton palier (ils sont affichés sur la page) et dis-les-moi : ils
déterminent combien de titres le batch peut traiter par jour, donc à quel rythme la base peut
grandir. C'est une contrainte de conception, pas un détail.

- [ ] Clé OpenSubtitles obtenue, quotas relevés

---

## Étape 7 — npm

Pour publier `@calmcut/core`, `@calmcut/sync` et `@calmcut/phobias`. **Trois** paquets, pas
deux — le batch a besoin des profils de phobies pour ses expressions de détection
(voir `docs/adr/0002`).

1. Crée un compte sur **<https://www.npmjs.com/signup>** si nécessaire
2. **<https://www.npmjs.com/org/create>** → crée l'organisation **`calmcut`** en formule
   **gratuite** (« Unlimited public packages »)
3. **<https://www.npmjs.com/settings/~/tokens>** → **« Generate New Token »** →
   **« Granular Access Token »**
   - Nom : `calmcut-ci`
   - **Packages and scopes** : `@calmcut` → permission **Read and write**
   - Expiration : ce que tu veux
4. Copie le token
5. **<https://github.com/IMarty/calmcut/settings/secrets/actions>** → nouveau secret
   `NPM_TOKEN`
6. **<https://github.com/IMarty/calmcut/settings/variables/actions>** → nouvelle variable
   `RELEASE_ENABLED` = `true`

Au prochain push sur `main`, une PR « chore(release): version des paquets » apparaîtra. La
fusionner publie sur npm.

- [ ] Organisation npm créée, `NPM_TOKEN` et `RELEASE_ENABLED` en place

---

## Étape 8 — Plus tard

### ⚠️ Le nom de domaine — la seule dépense

**Je n'achèterai rien sans ton accord explicite.** Le code utilise le placeholder `{{DOMAIN}}`
partout : rien ne casse tant que ce n'est pas tranché.

Compte **10 à 15 € par an** en `.fr` ou `.org`. Cloudflare Registrar les facture au prix
coûtant, sans marge.

Dis-moi le nom retenu et qui l'achète, et je remplacerai les placeholders.

- [ ] Domaine choisi _(décision, pas urgence)_

### Comptes de dons

Tout CalmCut est gratuit et vit de dons. Crée les trois, envoie-moi les liens, je les mettrai
sur la page `/soutenir` à M9.

- [ ] **Ko-fi** — <https://ko-fi.com>
- [ ] **Liberapay** — <https://liberapay.com>
- [ ] **Open Collective** — <https://opencollective.com>

### PostHog

Analytics respectueuses de la vie privée, palier gratuit. Crée un projet sur
<https://posthog.com>, récupère la **clé de projet publique** (commence par `phc_`) et
donne-la-moi : elle est publique par conception.

- [ ] Projet PostHog créé, clé publique envoyée

### Facturation GitHub

Le message qui bloquait la CI au début (`recent account payments have failed or your spending
limit needs to be increased`) **ne bloque plus CalmCut**, puisque le dépôt est public et que les
minutes y sont gratuites et illimitées.

Mais il bloquera **tout autre dépôt privé** que tu as ou auras. Ça vaut un coup d'œil :
<https://github.com/settings/billing>.

- [ ] Facturation vérifiée

### Horodatage de la conception du filigrane

À faire **avant** toute publication de données, pour qu'une preuve d'antériorité soit opposable.
Deux voies, détaillées dans `docs/design.md` du dépôt privé `calmcut-watermark` :

- **RFC 3161**, gratuit, technique — suffit à prouver qu'un contenu existait à une date
- **Enveloppe e-Soleau INPI**, 15 € pour 10 ans — plus de poids devant un tribunal français

C'est une dépense, donc c'est ton arbitrage.

- [ ] Horodatage fait _(avant M9)_

---

## Récapitulatif de ce que j'attends de toi

Copie-colle ce bloc dans la conversation en le remplissant, même partiellement :

```
Étape 1  PR fusionnées        : oui / non
Étape 2  Dépôts supprimés     : oui / non
Étape 3  RÉSULTATS DU TEST POC :
           verrouillage en ___ s
           écart de position ___ s
           WebGPU / WASM : ___
           compte à rebours avant la scène : oui / non
           ressenti :
Étape 4  Cloudflare           : Account ID = ___
                                Turnstile Site Key = ___
                                secrets enregistrés : oui / non
Étape 5  Déploiement preview  : URL = ___
Étape 6  TMDB : oui / non   OpenSubtitles : oui / non (quotas : ___)
Étape 7  npm                  : oui / non
Étape 8  Domaine envisagé     : ___
```

Rien n'est bloquant pour moi sauf ce qui est marqué. Je peux continuer sur M5 (le site public)
pendant que tu avances : il ne dépend que de l'API, qui est déjà écrite et testée.
