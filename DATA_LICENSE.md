# Licence des données CalmCut

Les **données** produites par CalmCut — segments horodatés, labels de phobie,
statuts, scores et index de synchro — sont mises à disposition sous
**Open Database License (ODbL) 1.0**.

Texte intégral : <https://opendatacommons.org/licenses/odbl/1-0/>

## Ce que cela vous autorise

- **Partager** : copier, distribuer et utiliser la base.
- **Créer** : produire des œuvres à partir de la base.
- **Adapter** : modifier, transformer et enrichir la base.

## À trois conditions

1. **Attribution** — citer CalmCut et la licence ODbL 1.0 partout où vous
   utilisez publiquement la base ou une œuvre qui en dérive.
2. **Partage à l'identique** — si vous redistribuez la base ou une version
   adaptée, le faire sous ODbL 1.0.
3. **Maintien de l'ouverture** — si vous redistribuez la base sous une forme
   techniquement restreinte, fournir aussi une version librement réutilisable.

## Ce qui n'est pas couvert

- **Le code** du dépôt, qui relève de LICENSE (propriétaire, sauf les paquets
  npm sous AGPL-3.0).
- **Les œuvres analysées.** CalmCut ne stocke et ne redistribue aucun contenu
  protégé : ni vidéo, ni audio, ni texte de sous-titres. Un segment est une
  paire de timestamps et un label, pas un extrait.

## Extraction automatisée

La licence ODbL porte sur les **exports publiés** (`bun run tools:export`).

Elle n'autorise pas l'aspiration de l'API : les CGU l'interdisent explicitement,
et la base bénéficie par ailleurs du droit _sui generis_ du producteur de base de
données (art. L341-1 et suivants du Code de la propriété intellectuelle).

Les exports publiés ne trahissent pas qui les a téléchargés, mais ils restent
identifiables comme venant de CalmCut : une redistribution sans attribution se
repère.
