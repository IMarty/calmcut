# CalmCut — guide de travail

CalmCut protège les personnes phobiques (rats, araignées, serpents, aiguilles, clowns,
émétophobie…) pendant qu'elles regardent des films et des séries : une base communautaire de
segments horodatés « scène phobogène », amorcée par de l'IA et vérifiée par la foule, appliquée par
trois clients. Tout est gratuit.

**Produit** : Igor Marty. **Langue** : français pour le code, les commentaires, les commits et la
doc ; anglais pour les identifiants.

---

## État d'avancement

| Jalon  | Objet                                                   | État       |
| ------ | ------------------------------------------------------- | ---------- |
| **M0** | Socle : monorepo, qualité, CI, docs, licences           | ✅ terminé |
| **M1** | `core`, `sync`, `phobias` complets — algorithme de lock | ⏭️ suivant |
| M2→M9  | Voir `docs/roadmap.md`                                  | à faire    |

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

**Ce que M1 doit produire** — dans `packages/sync` : construction de l'index binaire, histogramme
d'offsets, algorithme de verrouillage (§7.3 du cahier des charges), validé sur des timelines
synthétiques (décalage, échelle 25/23,976, pauses, coupures publicitaires). La normalisation, les
trigrammes et le hachage sont déjà faits et testés.

**Décisions prises** (voir `docs/adr/`) : périmètre restreint du socle M0 (0001), publication de
`@calmcut/phobias` sur npm (0002), dépôt public et filigrane séparé (0003).

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
bun run clean

bun run changeset      # obligatoire dès qu'une PR touche core, sync ou phobias
```

Un workspace précis : `bun run --filter '@calmcut/sync' build`.

---

## Structure

```
apps/web          Astro : site SEO + compagnon PWA /watch/:slug + modération /admin/*   (M5)
apps/extension    WXT MV3 : Netflix, Disney+, Prime, YouTube                            (M6)
apps/scanner      CLI d'analyse de médiathèque locale                                   (phase 2)
workers/api       Hono : API publique, ingestion, auth d'appareil                       (M3)
workers/cron      agrégation votes → statuts, republication R2                          (M7)
packages/core     → npm @calmcut/core : types, format timeline, Detector                 ✅
packages/sync     → npm @calmcut/sync : normalisation, index, lock (zéro dépendance)     ✅ partiel
packages/phobias  → npm @calmcut/phobias : profils déclaratifs                            ✅
packages/db       schéma Drizzle + migrations D1 (interne)                               (M3)
packages/watermark → déplacé dans le dépôt privé calmcut-watermark (ADR 0003)
packages/player-actions bruit blanc, compte à rebours, overlays, ducking                 (M2/M6)
tools/            seed, export  (leak-detect est dans calmcut-watermark)
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
- **Les workflows `deploy` et `release` sont éteints par défaut**, derrière les variables de dépôt
  `DEPLOY_ENABLED`, `RELEASE_ENABLED` et `EXTENSION_BUILD_ENABLED`. C'est volontaire : on ne déploie
  pas contre une infrastructure qui n'existe pas. Voir `docs/cloudflare-manual.md`.
