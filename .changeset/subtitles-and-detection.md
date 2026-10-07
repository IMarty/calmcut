---
'@calmcut/core': minor
'@calmcut/sync': minor
'@calmcut/phobias': minor
---

Lecture de sous-titres et détection de scènes

`@calmcut/sync` expose `parseSubtitles(source)`, qui lit le SRT et le WebVTT. Volontairement
permissif : un fichier trouvé dans la nature est rarement conforme, et une réplique perdue coûte
quelques trigrammes là où un rejet du fichier coûte toute la protection.

`@calmcut/phobias` expose `detectFromSubtitles(cues, phobiaIds)`, qui applique les profils de
phobies à des sous-titres et renvoie des scènes horodatées — marges appliquées, chevauchements
fusionnés. Les indications sonores SDH (`[couinements]`) portent une confiance plus élevée que les
mentions dans le dialogue : parler d'un rat n'est pas en voir un.

Les deux servent au mode démo du compagnon **et** à l'étape T1 du batch, qui aura ainsi exactement
le même comportement que les clients.
