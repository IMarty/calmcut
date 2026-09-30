# CalmCut — guide de travail

CalmCut protège les personnes phobiques (rats, araignées, serpents, aiguilles, clowns,
émétophobie…) pendant qu'elles regardent des films et des séries : une base communautaire de
segments horodatés « scène phobogène », amorcée par de l'IA et vérifiée par la foule, appliquée par
trois clients. Tout est gratuit.

**Produit** : Igor Marty. **Langue** : français pour le code, les commentaires, les commits et la
doc ; anglais pour les identifiants.

---

## État d'avancement

| Jalon  | Objet                                                   | État              |
| ------ | ------------------------------------------------------- | ----------------- |
| **M0** | Socle : monorepo, qualité, CI, docs, licences           | ✅ terminé        |
| **M1** | `core`, `sync`, `phobias` complets — algorithme de lock | ✅ terminé        |
| **M2** | POC compagnon en mode démo (`.srt` local + micro)       | 🟡 2ᵉ test manuel |
| **M3** | D1 + Drizzle + API Hono + infra Cloudflare preview      | ⏭️ suivant        |
| M4→M9  | Voir `docs/roadmap.md`                                  | à faire           |

**Fait à M0** — monorepo Bun (3 workspaces), TypeScript strict avec project references, ESLint +
Prettier + Vitest, CI GitHub (format, lint, typecheck, tests, build, scan de secrets), Changesets,
licences, quatre documents de conception, trois ADR, garde-fou de CI sur les paquets publiés.

Critère d'acceptation atteint : `bun run ci` est vert en local (54 tests, y compris depuis un état
sans `dist`) **et sur GitHub**.

> **Le dépôt est public.** Les minutes GitHub Actions sont soumises à la limite de dépense du compte
> sur un dépôt privé, ce qui bloquait toute exécution ; elles sont gratuites et illimitées en public.
> Relever la limite aurait été une action payante, donc contraire au principe 3.
>
> En conséquence, **le filigrane vit dans le dépôt privé
> [`calmcut-watermark`](https://github.com/IMarty/calmcut-watermark)** et n'a jamais figuré dans
> l'historique public. Voir `docs/adr/0003`. Règle à tenir : ce dépôt peut dire qu'un filigrane
> existe, jamais comment il est calibré.

**Fait à M1** — `@calmcut/sync` porte la chaîne complète : format binaire `CCSY` (construction,
lecture dichotomique, refus d'une version inconnue), `hearSegments` + `estimateOffset` (histogramme
d'offsets), et `SyncTracker` (machine à états écoute → verrouillage → horloge locale, détection de
saut, perte de verrou). `@calmcut/core` expose son JSON Schema. 119 tests.

Validé sur timelines synthétiques : décalage constant, échelle 25/23,976, pause courte, pause
longue, double coupure publicitaire, transcription dégradée à 15 % et 30 % d'erreurs de mots.

**Fait à M2** — `apps/web` avec `/watch/demo` : chargement d'un `.srt`/`.vtt` local, détection des
scènes, index de synchro, capture micro en AudioWorklet, Whisper tiny (WebGPU, repli WASM) et
`SyncTracker` dans un Web Worker, compte à rebours vocal et bruit blanc. Nouveau paquet
`@calmcut/player-actions`. 202 tests. Budgets tenus et vérifiés en CI : shell à 23 Ko gzip sur 50.

> **⏳ M2 attend un second test humain.** Le premier a échoué : la langue n'était **jamais**
> transmise à Whisper, qui transcrivait donc en anglais un film français. Aucun trigramme ne pouvait
> concorder — le verrouillage était impossible par construction, et l'interface restait muette.
>
> Corrigé : `language` est obligatoire dans les types (le compilateur refuse de l'omettre), déduite
> des sous-titres, corrigeable dans l'interface, et `task: 'transcribe'` est explicite pour que
> Whisper ne traduise pas. Un panneau de diagnostic rend désormais l'échec lisible, et
> `demo-chain.test.ts` teste la chaîne complète dans les deux sens.
>
> **Leçon retenue** : il manquait un test de la chaîne de bout en bout. Trois couches testées
> séparément ne garantissent rien sur leur assemblage.

**Fait à M3** — `packages/db` (schéma Drizzle complet, migration D1 générée), `workers/api` (Hono,
toutes les routes de `docs/api.md`), auth d'appareil par Turnstile + JWT, quota de titres distincts,
ingestion idempotente, `tools/seed`. **89 tests d'intégration dans workerd**, avec un vrai D1 et un
vrai R2 (Miniflare). 291 tests au total.

> **⛔ Le déploiement preview de M3 attend Igor.** Il faut `CLOUDFLARE_ACCOUNT_ID`, un API token, et
> les bases D1 créées — les `database_id` de `wrangler.jsonc` sont des placeholders. Tout le reste du
> critère est atteint : `wrangler deploy --dry-run` valide la configuration des deux environnements
> et le Worker pèse 68 Ko gzip.

**Ce que M4 doit produire** — le dépôt public `calmcut-batch` : T0 (TMDB), T1 (OpenSubtitles →
`parseSubtitles` → `detectFromSubtitles`), construction de l'index, `POST /v1/ingest`. Dépend des
clés TMDB et OpenSubtitles d'Igor.

**Décisions prises** (voir `docs/adr/`) : périmètre restreint du socle M0 (0001), publication de
`@calmcut/phobias` sur npm (0002), dépôt public et filigrane séparé (0003), estimation du débit de
lecture en plus du décalage (0004), choix audio du compagnon (0005), table de quota par titre
distinct (0006).

---

## Principes non négociables

1. **Jamais de contenu protégé stocké ni redistribué.** Ni vidéo, ni audio, ni **texte de
   sous-titres**. La base ne contient que des timestamps, des labels et un index de synchro dérivé
   et non réversible. Les sous-titres sont jetés après traitement dans le batch.
2. **L'IA tourne côté client** (WebGPU/WASM). Le serveur sert des fichiers et encaisse des écritures.
3. **Coût d'infrastructure ≈ 0 €.** On reste dans le gratuit Cloudflare et GitHub. **Toute action
   payante** (Workers Paid, domaine, clé API payante) exige une validation d'Igor via une tâche
   Akiflow. Je ne l'engage jamais moi-même.
4. **Vie privée.** L'audio du micro ne quitte jamais l'appareil. Pas de compte obligatoire.
   Identifiant d'appareil anonyme.
5. **Sécurité asymétrique.** Un faux négatif (le rat passe) est grave ; un faux positif est bénin.
   Ajouter un segment est facile, le désactiver exige un consensus. En cas de doute, on protège.
6. **Anti-aspiration dès la conception.** La conception du filigrane vit dans le dépôt privé
   [`calmcut-watermark`](https://github.com/IMarty/calmcut-watermark), pas ici — voir `docs/adr/0003`.
7. **Accessibilité** : WCAG AA, `prefers-reduced-motion`, tout faisable au clavier, pas de flash.
8. **Secrets** : jamais dans le dépôt. Wrangler secrets et GitHub Secrets uniquement.
9. **Vitesse d'abord**, avec des budgets qui font échouer le build.

## Budgets de performance (vérifiés en CI à partir de M5)

| Surface                           | Budget                                                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fiche film SEO                    | 0 Ko de JS hors îlots, ≤ 15 Ko gzip au total, LCP < 1 s en 4G, HTML servi depuis le cache edge                                                                        |
| Shell du compagnon (hors Whisper) | ≤ 50 Ko de JS gzip, interactif en moins de 1 s                                                                                                                        |
| Content script de l'extension     | ≤ 10 Ko gzip, zéro dépendance, aucun travail sur le thread principal pendant la lecture en dehors d'une boucle `requestVideoFrameCallback` / `timeupdate` en O(log n) |
| Réaction à une action utilisateur | retour visuel en moins de 50 ms (UI optimiste, réseau en arrière-plan)                                                                                                |

---

## Stack

| Couche            | Choix                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| Runtime / paquets | **Bun** (workspaces)                                                          |
| Langage           | TypeScript strict partout                                                     |
| Site web          | **Astro** (`@astrojs/cloudflare`), 0 JS par défaut, îlots seulement           |
| Îlots + compagnon | **Svelte 5** (runes)                                                          |
| Calcul lourd      | **Web Workers** (Whisper, matching) + **AudioWorklet** (capture, bruit blanc) |
| PWA               | `@vite-pwa/astro` (Workbox)                                                   |
| API               | **Hono** sur Cloudflare Workers                                               |
| BDD               | **Cloudflare D1** + **Drizzle ORM**                                           |
| Stockage          | **Cloudflare R2**                                                             |
| Anti-bot          | **Turnstile**, binding Rate Limiting, WAF gratuit                             |
| Cron              | Cron Triggers Workers                                                         |
| Batch T0/T1       | **GitHub Actions** dans le dépôt public `calmcut-batch`                       |
| IA client         | `@huggingface/transformers` (Whisper tiny/base, WebGPU), `onnxruntime-web`    |
| Extension         | **WXT** (MV3) — content scripts en TS vanilla, popup en Svelte 5              |
| Analytics         | **PostHog** (gratuit, sans enregistrement de session sur le compagnon)        |
| Tests             | Vitest (unitaires), Playwright (e2e, audio simulé)                            |
| Perf en CI        | `size-limit`, Lighthouse CI                                                   |

---

## Commandes

```bash
bun install            # dépendances de tout le monorepo

bun run ci             # ce que la CI exécute : format + lint + typecheck + test + build
bun run format         # corrige le formatage
bun run lint:fix       # corrige ce qu'ESLint sait corriger
bun run typecheck      # tsc --build sur tous les projets référencés
bun run test           # Vitest
bun run test:watch
bun run build          # build de chaque workspace
bun run size           # budgets de poids (échoue si dépassement)
bun run seed           # aperçu du jeu de données synthétique (--sql pour le SQL)
bun run ci:clean       # CI depuis un état sans dist — À FAIRE AVANT TOUTE PR
bun run clean:build    # supprime dist, .astro et les tsbuildinfo
bun run clean          # idem + node_modules

bun run changeset      # obligatoire dès qu'une PR touche core, sync ou phobias
```

Un workspace précis : `bun run --filter '@calmcut/sync' build`.

---

## Structure

```
apps/web          Astro + îlots Svelte : /watch/demo ✅ M2 ; site SEO et /watch/:slug (M5)
apps/extension    WXT MV3 : Netflix, Disney+, Prime, YouTube                            (M6)
apps/scanner      CLI d'analyse de médiathèque locale                                   (phase 2)
workers/api       Hono : API publique, ingestion, auth d'appareil                       ✅
workers/cron      agrégation votes → statuts, republication R2                          (M7)
packages/core     → npm @calmcut/core : types, format timeline, Detector                 ✅
packages/sync     → npm @calmcut/sync : normalisation, index, lock (zéro dépendance)     ✅
packages/phobias  → npm @calmcut/phobias : profils déclaratifs                            ✅
packages/db       schéma Drizzle + migrations D1 (interne)                               ✅
packages/watermark → déplacé dans le dépôt privé calmcut-watermark (ADR 0003)
packages/player-actions bruit blanc, compte à rebours, ducking ✅ ; overlays (M6)
tools/            seed ✅, export (M9)  —  leak-detect est dans calmcut-watermark
docs/             adr/, roadmap.md, cloudflare-manual.md, api.md
```

Chaque emplacement pas encore implémenté porte un `README.md` qui énonce son périmètre et son
jalon. **Le lire avant d'y écrire du code.**

### Trois paquets publiés sur npm

`@calmcut/core`, `@calmcut/sync` et `@calmcut/phobias` sont publics (AGPL-3.0-or-later), versionnés
**ensemble** par Changesets. Le dépôt public `calmcut-batch` les consomme depuis npm — jamais une
copie du code — pour que le format et les heuristiques ne divergent pas.

Contraintes vérifiées par `tests/published-packages.test.ts` :

- aucun d'eux n'importe `@calmcut/watermark` ni `@calmcut/db` ;
- `@calmcut/sync` n'a **aucune dépendance runtime** et **ne suppose aucun environnement**
  (pas de `TextEncoder`, pas de `Buffer`, pas de `window`) : il doit tourner dans un navigateur, un
  Worker, Bun, et être réimplémentable en Kotlin pour le futur client Android ;
- `types: []` dans `tsconfig.base.json` empêche les `@types` d'entrer par accident. Un projet qui a
  besoin de types d'environnement les déclare explicitement.

**Tout changement de la normalisation, des trigrammes ou du hachage de `sync` doit incrémenter
`SYNC_INDEX_VERSION`** et sortir en version majeure : les index déjà publiés deviennent illisibles,
le compagnon refuse une version inconnue et le batch doit les reconstruire.

---

## Règles de travail

- **Petites PR.** Conventional Commits. Une description de PR qui dit le **pourquoi**.
- **Pas de dépendance lourde** sans justification dans la PR.
- **Tests obligatoires** sur `core`, `sync` et la logique de votes (et sur `watermark`, dans son
  propre dépôt).
- **ADR court** dans `docs/adr/NNNN-titre.md` dès qu'une décision s'écarte du cahier des charges.
- Jamais de `--force` sur `main`. Jamais de secret en clair. Jamais d'action payante sans validation.
- **Fin de session** : mettre à jour ce fichier (état d'avancement) et les tâches Akiflow.

### Actions humaines en attente

[`docs/mise-en-route.md`](docs/mise-en-route.md) est le guide pas à pas d'Igor, dans l'ordre où
faire les choses. **Le tenir à jour** : quand une étape est franchie, la marquer faite plutôt que
de la laisser traîner. Quand un jalon exige une nouvelle action humaine, l'y ajouter au lieu de
créer un document parallèle.

### Suivi Akiflow

Une tâche par jalon (`M0 — Setup…` → `M9 — Lancement`), 3 à 6 sous-tâches maximum, pas de
micro-tâche, ~10 tâches ouvertes au plus.

Toute action humaine requise — clé API, widget Turnstile, domaine, secret GitHub, test manuel,
validation d'un coût, horodatage — devient une tâche **`👤 Igor — …`** planifiée aujourd'hui, avec
des instructions pas-à-pas et ce que j'attends en retour. Je continue sur ce qui n'est pas bloqué.

Blocage technique de plus d'une session : tâche **`⚠️ Blocage — …`** avec les options et ma
recommandation.

> Le projet Akiflow « CalmCut » n'existe pas encore : les tâches sont dans l'inbox en attendant
> qu'Igor le crée.

---

## Pièges connus

- **TypeScript 7 est installé par défaut par Bun** et `typescript-eslint` le refuse en peer.
  La version est pinée en `~5.9`. Ne pas la remonter sans vérifier `typescript-eslint`.
- **Les tests et les fichiers de config sont hors des projets de build** (ils ne doivent pas être
  émis dans `dist`). ESLint utilise donc `tsconfig.eslint.json`, qui les couvre. Un nouveau fichier
  de config à la racine y est inclus automatiquement par les globs.
- **Vitest et ESLint résolvent `@calmcut/*` vers `src`**, pas vers `dist` — alias dans
  `vitest.config.ts`, `paths` dans `tsconfig.eslint.json`. Sans cela, `lint` et `test` exigeraient
  un `build` préalable et échoueraient sur un checkout propre, où `dist` n'existe pas encore.
  **En ajoutant un paquet, ajouter les deux entrées**, et vérifier avec `rm -rf packages/*/dist
&& bun run ci`.
- **`packages/sync/src/testing/` est exclu du build** (`tsconfig.json` de `sync`) : les générateurs
  de timelines synthétiques servent aux tests et ne sont pas publiés.
- **Ne jamais nommer une variable `window`, `process` ou `Buffer` dans `packages/sync`** : un test
  de neutralité d'environnement échoue sur le nom, commentaires exclus. C'est voulu — ce paquet doit
  tourner en navigateur, en Worker, sous Bun, et être portable sur la JVM.
- **`ajv` est CJS** : sous `moduleResolution: nodenext`, l'import par défaut pointe sur l'espace de
  noms du module. Utiliser l'import nommé (`import { Ajv2020 } from 'ajv/dist/2020.js'`).
- **Vitest est pinné en 4.x** : `@cloudflare/vitest-pool-workers` exige `vitest ^4.1`, et c'est lui
  qui exécute les tests d'intégration **dans workerd**. Ne pas remonter sans vérifier le pool.
- **La date de compatibilité des Workers est `2026-08-22`** : le binaire `workerd` livré avec
  Miniflare refuse toute date plus récente. Elle apparaît dans `wrangler.jsonc` **et** dans
  `workers/api/vitest.config.ts` — les deux doivent rester identiques.
- **`cloudflare:test` se type via le namespace global `Cloudflare.Env`**, pas via `ProvidedEnv`
  comme dans les versions antérieures du pool. Voir `workers/api/test/env.d.ts`.
- **`isolatedStorage` du pool ne remet pas la base à zéro** entre deux tests : chaque test appelle
  `resetDatabase()` et énonce ses propres préconditions.
- **Ne jamais monter un `use('*')` dans une sous-application montée sur `/`** : son intergiciel
  s'appliquerait à toutes les requêtes que personne ne résout, et ferait répondre 403 là où il faut
  404 — ce qui apprendrait à un sondage anonyme quelles routes existent. Intergiciel par route.
- **`apps/web` doit rester sur TypeScript 5.x** : `astro check` refuse TypeScript 7. Une copie
  imbriquée dans `apps/web/node_modules/typescript` peut masquer celle de la racine — la supprimer.
- **Le micro exige un contexte sécurisé.** `localhost` convient pour tester, une IP de réseau local
  non : il faut HTTPS pour essayer depuis un téléphone.
- **La langue de Whisper est obligatoire et typée comme telle.** Ne jamais la rendre optionnelle :
  sans elle, Whisper transcrit en anglais et le verrouillage est impossible sur tout film non
  anglophone. `task: 'transcribe'` doit rester explicite, sinon Whisper peut traduire.
- **Toute nouvelle couche du compagnon doit être couverte par `demo-chain.test.ts`**, qui teste la
  chaîne complète sans navigateur. Des couches testées séparément ne garantissent rien sur leur
  assemblage — c'est ce qui a coûté un test manuel entier.
- **Les workflows `deploy` et `release` sont éteints par défaut**, derrière les variables de dépôt
  `DEPLOY_ENABLED`, `RELEASE_ENABLED` et `EXTENSION_BUILD_ENABLED`. C'est volontaire : on ne déploie
  pas contre une infrastructure qui n'existe pas. Voir `docs/cloudflare-manual.md`.
