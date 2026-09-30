# ADR 0002 — Publier `@calmcut/phobias` sur npm

- **Date** : 2026-09-30
- **Statut** : accepté
- **Jalon** : M0 (anticipe un blocage de M4)
- **Écart assumé avec le cahier des charges** : §4.1 ne nomme que `core` et `sync` comme paquets publiés.

## Contexte

`calmcut-batch` est un dépôt **public**, et il doit consommer les paquets npm plutôt qu'une copie
du code (§4.1) — sinon les heuristiques divergent silencieusement entre le batch et les clients.

Or l'étape T1 du batch (§7.2) classe les indications sonores des sous-titres **à partir des regex
par phobie**, qui vivent dans `packages/phobias` (§10). Si ce paquet reste interne, M4 n'a que de
mauvaises options : dupliquer les regex dans le dépôt public, les déplacer dans `core` alors que
`core` est censé porter des contrats et non des données, ou rendre le monorepo accessible au batch.

## Décision

`packages/phobias` est publié sur npm sous **`@calmcut/phobias`**, en AGPL-3.0-or-later, aux mêmes
conditions que `core` et `sync`. Les trois paquets sont versionnés ensemble (`fixed` dans la
configuration Changesets) : ils forment un seul contrat de format.

Le paquet ne contient que de la configuration déclarative — identifiants, libellés, regex,
invites de détection. Aucun secret, aucune logique anti-aspiration, rien qui aide à aspirer la base.

Le garde-fou de CI (`tests/published-packages.test.ts`) couvre les **trois** paquets : aucun n'a le
droit d'importer `watermark` ni `db`.

## Alternatives écartées

- **Mettre les profils dans `core`.** Mélange le contrat de format (stable, versionné avec soin)
  et des données de catalogue (qui bougent à chaque phobie ajoutée). Chaque nouvelle phobie
  deviendrait une version de `core`.
- **Dupliquer les regex dans `calmcut-batch`.** Exactement la divergence que §4.1 cherche à éviter,
  et sur la partie la plus sensible : une regex qui diverge produit des faux négatifs, c'est-à-dire
  le rat qui passe.

## Conséquences

- La tâche Akiflow de création du scope npm `@calmcut` couvre trois paquets, pas deux.
- Ajouter une phobie devient une contribution de configuration qui bénéficie à tout l'écosystème,
  y compris au futur client Android.
- Le catalogue des phobies est public. C'est cohérent : il est de toute façon visible dans
  l'interface, et une regex de détection n'a aucune valeur d'aspiration.
