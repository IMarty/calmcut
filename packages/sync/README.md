# @calmcut/sync

Index de synchro et verrouillage audio↔timeline — brique publiée de [CalmCut](https://github.com/IMarty/calmcut), un outil gratuit qui protège
les personnes phobiques pendant qu'elles regardent des films.

```bash
bun add @calmcut/sync
```

AGPL-3.0-or-later. Documentation du format : [`docs/api.md`](../../docs/api.md).

## Contraintes

- **Zéro dépendance runtime**, et **aucune supposition d'environnement** : pas de `TextEncoder`,
  pas de `Buffer`, pas de `window`. Le paquet doit tourner dans un navigateur, un Web Worker, Bun et
  Node, et rester réimplémentable à l'identique sur la JVM pour le client Android.
- L'encodage UTF-8 du hachage est fait à la main pour cette raison : un hash qui diverge d'un
  runtime à l'autre rendrait tous les index de synchro inutilisables.
- **`SYNC_INDEX_VERSION` est incrémenté à tout changement** de la normalisation, du découpage en
  trigrammes ou du hachage. Un client refuse un index dont la version lui est inconnue.

## Vie privée

Le texte des sous-titres n'est **jamais** conservé. Il est normalisé, découpé en trigrammes de mots,
haché avec un sel propre au titre, puis jeté. Un index ne contient que des entiers 32 bits et des
horaires : il ne permet pas de reconstituer les dialogues.
