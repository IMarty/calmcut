# `tools/export` — export public ODbL

**Jalon : M9.** `bun run tools:export`

Produit l'export public des données sous ODbL 1.0 : timestamps, labels et statuts.

L'export est **débarrassé de tout marquage propre à un appareil** — on ne publie pas un jeu de
données qui trahirait celui qui l'a téléchargé — mais il **reste identifiable comme venant de
CalmCut**, ce qui permet de repérer une redistribution sans attribution.

Le détail du filigrane est dans le dépôt privé
[`calmcut-watermark`](https://github.com/IMarty/calmcut-watermark) : ce dépôt-ci ne décrit pas
comment il est calibré.
