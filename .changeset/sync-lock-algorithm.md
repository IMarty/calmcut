---
'@calmcut/core': minor
'@calmcut/sync': minor
'@calmcut/phobias': minor
---

Index de synchro et algorithme de verrouillage

`@calmcut/sync` sait désormais construire, lire et exploiter un index de synchro :

- `buildIndexFromCues(cues, titleSalt)` et `buildSyncIndex(entries)` produisent le format binaire
  `CCSY` documenté dans `docs/api.md`. Le texte des sous-titres est haché puis jeté — un index ne
  contient que des entiers.
- `parseSyncIndex(buffer)` relit un index, avec une recherche dichotomique, et **refuse une version
  inconnue** (`SyncIndexError` de code `unsupported-version`) plutôt que d'interpréter les octets au
  hasard.
- `hearSegments(segments, titleSalt)` convertit une transcription Whisper en trigrammes horodatés,
  et `estimateOffset(heard, index)` retrouve la position par histogramme d'offsets.
- `SyncTracker` tient la machine à états complète : écoute → verrouillage → horloge locale, avec
  détection de saut et perte de verrou.

`@calmcut/core` expose son **JSON Schema** à `@calmcut/core/schema.json`, pour les clients qui ne
sont pas en TypeScript. Le schéma interdit `creditsStart` et `creditsEnd` dans l'en-tête public.

Le suivi estime aussi le **débit de lecture**, ce que le cahier des charges ne demandait pas : sans
cela, un transfert PAL (25/23,976) dérive de 1,3 s entre deux recalages. Voir `docs/adr/0004`.
