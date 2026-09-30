# `apps/extension` — extension navigateur MV3

**Jalon : M6** (Netflix et YouTube d'abord, puis Disney+ et Prime Video).

Construite avec WXT, buildée pour Chrome/Edge et Firefox.

- **content scripts en TypeScript vanilla, sans framework, ≤ 10 Ko gzip.** Pendant la lecture,
  aucun travail sur le thread principal en dehors d'une boucle `requestVideoFrameCallback` /
  `timeupdate` faisant une recherche en O(log n) dans les segments triés ;
- overlays créés une fois dans un Shadow DOM, puis affichés ou masqués — jamais de re-rendu ;
- signalement par `Alt+R`, fausse alerte par `Alt+F` (`chrome.commands`) ;
- popup en Svelte 5.

La détection IA en temps réel (`tabCapture`) est hors périmètre : seule l'interface `Detector`
de `@calmcut/core` est figée.
