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
3. la **langue** est déduite des sous-titres et présentée à l'utilisateur pour correction ;
4. le micro écoute le film, Whisper transcrit dans un Web Worker, `SyncTracker` verrouille la position ;
5. `@calmcut/player-actions` annonce le compte à rebours puis lance le bruit blanc.

### La langue n'est pas un détail

`WhisperOptions.language` et `ToWorker.init.language` sont **obligatoires** : le compilateur
refuse de les omettre. Ce n'est pas du zèle — le premier test manuel du POC a échoué entièrement
pour cette raison. Whisper à qui l'on ne dit rien transcrit en anglais ; un film français
transcrit en anglais ne produit aucun trigramme concordant, et le verrouillage devient impossible
par construction.

`src/lib/demo-chain.test.ts` teste les deux sens : que ça verrouille avec la bonne langue, et que
ça ne verrouille **jamais** avec la mauvaise. Le second cas documente un symptôme qu'on doit
savoir reconnaître.

### L'échec doit être bavard

Le Worker rend compte de **chaque** relevé, même infructueux (message `heard`), et l'interface
l'affiche dans un panneau de diagnostic : nombre de répliques entendues, de trigrammes extraits,
de trigrammes concordants, et la dernière transcription.

Sans cela, un échec de verrouillage est indébogable — l'interface affiche « à l'écoute » sans
dire si le micro n'entend rien, si la transcription est mauvaise, ou si elle est bonne mais ne
concorde pas. C'est ce qui a rendu le premier test manuel inexploitable.

La transcription affichée **ne quitte pas l'appareil** : elle va du Worker à l'écran, et nulle
part ailleurs (principe 4).

### Pourquoi le mode démo affiche des horaires précis

`/watch/demo` liste les horaires exacts de chaque scène, et annonce la prochaine. Cela **ne
contredit pas** §7.7, qui interdit les timestamps précis sur les **pages publiques** : là, les
données viennent de notre base et méritent d'être protégées.

Ici, les scènes sont calculées **dans le navigateur, à partir du fichier de l'utilisateur**. Rien
ne vient de CalmCut, donc il n'y a rien à protéger — et les cacher ne ferait que compliquer
inutilement la vie de quelqu'un qui veut se préparer à ce qui arrive.

La distinction est à tenir quand `/watch/:slug` sera branché sur l'API à M5 : **ce mode-là ne doit
pas afficher les bornes**, seulement les alertes.

Le mode démo affiche aussi **les répliques du `.srt` qui ont déclenché chaque scène**, pour que
l'utilisateur vérifie la correspondance avec le film. Même raisonnement : c'est son fichier, dans
son onglet. Les répliques ne vont **ni en `localStorage` ni sur le réseau**.

`detectFromSubtitles` renvoie pour cela des **indices** de répliques, jamais leur texte :
`@calmcut/phobias` est consommé par `calmcut-batch`, où le texte doit être jeté après traitement.
Faire remonter du texte dans ce type y mettrait un piège permanent — un test le vérifie.

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
