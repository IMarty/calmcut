# ADR 0001 — Périmètre du socle M0

- **Date** : 2026-09-30
- **Statut** : accepté
- **Jalon** : M0

## Contexte

Le cahier des charges décrit une arborescence complète (§5) : trois applications, deux Workers,
six paquets, trois outils. Le jalon M0 n'a pourtant qu'un critère d'acceptation : `bun run ci`
passe en local et sur GitHub.

Créer d'emblée douze workspaces vides pose deux problèmes : la CI valide du code mort, et chaque
emplacement devient un endroit où déposer du code sans que sa forme ait été réfléchie au moment
de son jalon.

## Décision

**Seuls `packages/core`, `packages/sync` et `packages/phobias` sont des workspaces à M0.**

Tous les autres emplacements de §5 existent comme dossiers portant un `README.md` qui énonce leur
périmètre, leurs contraintes et leur jalon cible. Ils deviennent des workspaces au jalon qui les
implémente.

Les trois paquets retenus reçoivent à M0 la partie de leur contenu qui est **entièrement spécifiée
et ne sera pas réécrite** :

- `core` : format public d'un titre (§7.1), conversion de timeline, type `PhobiaProfile`,
  interface `Detector`, constantes de version ;
- `sync` : normalisation de texte, trigrammes de mots, hachage FNV-1a (§7.3) — l'algorithme de
  verrouillage lui-même reste à M1 ;
- `phobias` : catalogue déclaratif complet, rats et araignées activés, le reste en `enabled: false`.

## Conséquences

- La CI de M0 valide du code réel, pas des stubs.
- M1 démarre avec la normalisation et le hachage déjà testés, et n'a plus qu'à construire l'index
  et l'histogramme d'offsets.
- Chaque nouveau workspace demande un petit ajout à `tsconfig.json` et éventuellement à
  `vitest.config.ts`. C'est le prix accepté, et il est faible.
- L'arborescence de §5 reste lisible : un contributeur qui ouvre `workers/cron/` comprend
  immédiatement ce qui doit y aller et quand.
