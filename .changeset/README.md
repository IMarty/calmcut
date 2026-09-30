# Changesets

Ce dossier pilote le versionnement et la publication des paquets npm publics
(`@calmcut/core`, `@calmcut/sync`, `@calmcut/phobias`).

## Quand ajouter un changeset

Dès qu'une PR modifie un de ces trois paquets :

```bash
bun run changeset
```

Décris le changement **du point de vue du consommateur** : `calmcut-batch` et,
plus tard, le client Android lisent ces paquets et doivent comprendre ce qui
change pour eux.

Les trois paquets sont versionnés **ensemble** (`fixed`) : ils forment un seul
contrat de format, et une version commune évite d'avoir à raisonner sur des
combinaisons de versions entre le batch et les clients.

## Changement du format ou de l'algorithme de synchro

Un changement de la normalisation, du découpage en trigrammes ou du hachage
**doit** incrémenter `SYNC_INDEX_VERSION` dans `packages/sync/src/version.ts`,
et être un changement **major** : les index déjà publiés deviennent illisibles
et le batch doit les reconstruire.

## Publication

Le workflow `release.yml` ouvre une PR « Version Packages » sur `main`. La fusionner
publie sur npm. Rien n'est publié à la main.
