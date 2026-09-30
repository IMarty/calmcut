# `packages/watermark` — déplacé

Le filigrane par appareil de CalmCut **ne vit pas dans ce dépôt**. Conception et code sont dans le
dépôt privé **[`calmcut-watermark`](https://github.com/IMarty/calmcut-watermark)**.

## Pourquoi

Ce monorepo est public. Le filigrane est le seul élément de CalmCut dont la valeur diminue s'il est
lu — non pas parce que l'algorithme serait secret (il ne l'est pas, et sa solidité repose sur une
clé HMAC), mais parce que **ses valeurs de calibrage** rendraient son contournement mécanique.

Voir [`docs/adr/0003-separer-le-filigrane-du-monorepo-public.md`](../../docs/adr/0003-separer-le-filigrane-du-monorepo-public.md).

## Ce qu'il faut en savoir ici

Les réponses de l'API sont **personnalisées par appareil** avant d'être mises en cache par
`(titleId, deviceBucket)`. Cela a trois conséquences qui concernent le code de ce dépôt :

1. **`creditsStart` et `creditsEnd` ne sont jamais exposés publiquement** (§6 du cahier des charges).
   Ce sont des colonnes internes.
2. **La clé de cache d'un document de titre inclut le bucket de l'appareil.** Ne jamais mettre en
   cache une réponse de `/v1/titles/:id` sur la seule base du `titleId`.
3. **Aucun paquet publié sur npm ne peut importer `@calmcut/watermark`.** Un test de CI le vérifie
   (`tests/published-packages.test.ts`), et la contrainte subsiste même si le paquet est absent.

Le filigrane n'a **jamais** le droit de dégrader la protection : l'asymétrie de sécurité (un rat qui
passe est grave, une alerte de trop est bénigne) primerait sur toute considération anti-aspiration.
