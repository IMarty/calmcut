# `apps/web` — site public + compagnon PWA + modération

| Surface                                  | Route               | Jalon |
| ---------------------------------------- | ------------------- | ----- |
| Compagnon en mode démo                   | `/watch/demo`       | ✅ M2 |
| Site public SEO (fiches film, recherche) | `/`, `/films/:slug` | M5    |
| Compagnon branché sur l'API              | `/watch/:slug`      | M5    |
| Modération                               | `/admin/*`          | M7    |

Astro avec des îlots Svelte 5. Une seule application pour trois surfaces, afin de partager le cache
edge, le service worker et le modèle Whisper mis en cache.

## Ce qui tourne aujourd'hui (M2)

`/watch/demo` fonctionne **entièrement dans le navigateur**, sans API ni compte :

1. l'utilisateur charge un `.srt` ou `.vtt` ;
2. `@calmcut/phobias` y repère les scènes, `@calmcut/sync` en construit l'index de synchro ;
3. le micro écoute le film, Whisper transcrit dans un Web Worker, `SyncTracker` verrouille la position ;
4. `@calmcut/player-actions` annonce le compte à rebours puis lance le bruit blanc.

`output: 'static'` : l'adaptateur `@astrojs/cloudflare` et le rendu serveur arrivent à M5, avec les
fiches film.

## Architecture des threads

| Thread                                           | Rôle                                            | Pourquoi là                                                             |
| ------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------- |
| **AudioWorklet** (`public/capture-processor.js`) | capture le micro, assemble des paquets de 0,5 s | thread audio temps réel ; servi tel quel car `addModule` charge une URL |
| **Web Worker** (`src/workers/sync.worker.ts`)    | Whisper + `SyncTracker`                         | la transcription ne doit jamais retarder un compte à rebours            |
| **Thread principal** (`Companion.svelte`)        | affichage, bruit blanc, voix                    | seul endroit où un `AudioContext` peut produire du son                  |

Le thread principal n'attend jamais le Worker : celui-ci envoie un point d'ancrage, et
`mediaTimeFrom` extrapole entre deux messages. Voir `src/lib/protocol.ts`.

Les choix audio — contexte unique à 16 kHz, annulation d'écho désactivée, micro coupé pendant la
protection — sont expliqués dans [`docs/adr/0005`](../../docs/adr/0005-choix-audio-du-compagnon.md).

## Budgets

`bun run size` échoue si un budget est dépassé, et la CI l'exécute.

| Cible                                    | Budget     | Actuel  |
| ---------------------------------------- | ---------- | ------- |
| Shell du compagnon                       | 50 Ko gzip | ~23 Ko  |
| Worker de synchro (hors Transformers.js) | 10 Ko gzip | ~3,5 Ko |
| AudioWorklet de capture                  | 2 Ko gzip  | ~0,9 Ko |

Transformers.js (~154 Ko gzip) et le modèle Whisper ne sont chargés qu'au démarrage de l'écoute,
derrière une barre de progression. Le HTML de la page n'y fait aucune référence.

## Commandes

```bash
bun run --filter '@calmcut/web' dev      # serveur de développement
bun run --filter '@calmcut/web' check    # astro check + svelte-check
bun run --filter '@calmcut/web' build
bun run --filter '@calmcut/web' size
```

Le micro exige un contexte sécurisé : `localhost` convient, une IP de réseau local non.
