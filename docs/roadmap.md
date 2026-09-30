# Feuille de route

Chaque jalon = une branche, une ou plusieurs PR, une CI verte, et un critère d'acceptation
**vérifié** avant de passer au suivant. Le suivi vit dans Akiflow ; ce fichier est la référence
écrite.

| #      | Jalon                                                    | Critère d'acceptation                                                                                                                | État          |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| **M0** | Setup : repos, monorepo Bun, lint/format/tests, CI       | `bun run ci` passe en local et sur GitHub                                                                                            | 🟡 en cours   |
| **M1** | `core`, `sync`, `phobias` complets + tests               | Algorithme de lock validé sur des cas synthétiques (décalage, échelle 25/23,976, pauses, coupures publicitaires)                     | bloqué par M0 |
| **M2** | POC compagnon en mode démo (`.srt` local + micro)        | Igor lance un film avec son `.srt` : la synchro se verrouille en moins de 30 s, le compte à rebours et le bruit blanc sont à l'heure | à faire       |
| **M3** | D1 + Drizzle + API Hono + infra Cloudflare preview       | Tests d'intégration (Miniflare / `wrangler dev`) verts, déploiement preview OK                                                       | à faire       |
| **M4** | `calmcut-batch` : T0 + T1 + index de synchro → ingestion | 20 titres de test ingérés, segments cohérents sur 3 films à rats connus                                                              | à faire       |
| **M5** | Site Astro : fiches SEO, recherche, compagnon, légal     | Lighthouse 100 en perf, ≥ 95 en SEO et accessibilité, budgets JS tenus en CI, aucun timestamp précis dans le HTML public             | à faire       |
| **M6** | Extension WXT : Netflix + YouTube, puis Disney+ et Prime | Segment appliqué à moins de 150 ms d'écart sur un titre de test, `Alt+R` fonctionnel                                                 | à faire       |
| **M7** | Signalements, votes, réputation, cron, modération        | Scénarios asymétriques testés : 1 signalement active, 5 votes pondérés désactivent                                                   | à faire       |
| **M8** | Anti-aspiration : quotas, rate limiting, watermark¹      | Un dump simulé de 200 titres identifie le bon bucket (p < 1e-6)                                                                      | à faire       |
| **M9** | Lancement : README, docs, dons, PostHog, feature flag    | Checklist de lancement validée par Igor                                                                                              | à faire       |

## M0 — ce qui reste

Le code est livré et `bun run ci` est vert en local (54 tests). La moitié distante du critère
d'acceptation n'est pas atteinte : **GitHub Actions ne démarre aucun job**, pour une raison de
facturation du compte (`recent account payments have failed or your spending limit needs to be
increased`). La PR #1 reste ouverte.

Rien n'a été fait pour contourner : augmenter une limite de dépense est une action payante, elle
revient à Igor (principe 3).

## Après M9

### Phase 2 — `apps/scanner`

CLI Bun analysant une médiathèque locale, Plex ou Jellyfin pour produire des segments T2 (audio et
vidéo) sur les fichiers que l'utilisateur possède déjà. Analyse **100 % locale** : seuls des
timestamps remontent.

### Phase 3 — `calmcut-android` (dépôt privé séparé, à ne pas créer avant)

Application native Android / Google TV / Fire TV en Kotlin, avec MediaSession.

Elle devra consommer **exactement** le même format de timeline et le même algorithme d'index de
synchro que le compagnon web. D'où le JSON Schema exporté par `@calmcut/core/schema.json` et le
choix d'un hachage (FNV-1a, encodage UTF-8 fait à la main) trivial à réimplémenter sur la JVM.

### Phase 3 — Mode Exposition progressive (premium)

Flou dégressif et suivi des progrès, pensé pour accompagner une TCC. **Hors périmètre actuel** :
seul le feature flag `exposure-mode` est prévu (M9). Tout le reste de CalmCut reste gratuit.

### Détection IA temps réel

`tabCapture` dans l'extension, YOLO-World / YOLO11n via `onnxruntime-web`. Hors périmètre : seule
l'interface `Detector` de `@calmcut/core` est figée, pour que l'ajout n'impose pas de refonte.

### Licence API commerciale

Piste de financement à long terme, en complément des dons. Rien n'est engagé.

---

¹ Le filigrane et `leak-detect` vivent dans le dépôt privé
[`calmcut-watermark`](https://github.com/IMarty/calmcut-watermark), pas ici. Voir
`docs/adr/0003-separer-le-filigrane-du-monorepo-public.md`.
