# ADR 0004 — Estimer le débit de lecture, et pas seulement le décalage

- **Date** : 2026-09-30
- **Statut** : accepté
- **Jalon** : M1
- **Écart assumé avec le cahier des charges** : §7.3 décrit un verrouillage sur un **décalage** seul, recalé toutes les 30 s.

## Contexte

L'algorithme de §7.3 estime un offset : `canonique = local + offset`. Une horloge locale prend
ensuite le relais, avec un recalage toutes les 30 s.

Or le critère d'acceptation de M1 exige explicitement que le verrouillage tienne sur une timeline
au **facteur d'échelle 25/23,976** — un transfert PAL, où le film défile 4,3 % plus vite que la
timeline canonique.

Avec un offset seul, l'horloge locale avance à 1× alors que le film avance à 1,0427×. Entre deux
recalages espacés de 30 s, l'écart accumulé atteint **1,3 s**. Le compte à rebours « 🐀 dans 5…1 »
se déclencherait donc 1,3 s trop tard dans le pire cas, et les marges de sécurité de 2 s (§10)
seraient consommées aux deux tiers par une erreur purement mécanique, évitable.

C'est exactement l'asymétrie que le principe 5 interdit de dégrader : le faux négatif — la
protection qui arrive après la scène — est le scénario grave.

## Décision

Le suivi maintient **deux paramètres** : une ancre et un débit.

`position(local) = ancre.canonique + (local − ancre.locale) × débit`

Le débit est estimé par **moindres carrés sur les ancres récentes**, à partir de trois ancres
couvrant au moins 45 s. Il vaut 1 tant qu'il n'a pas été mesuré, et il est borné à [0,9 ; 1,11] —
un intervalle qui couvre les deux sens du transfert 23,976 ↔ 25 et rejette toute estimation
aberrante née d'une correspondance parasite.

Le reste de §7.3 est appliqué tel quel : verrouillage à ≥ 3 trigrammes concordants à ±0,5 s,
recalage toutes les 30 s, retour en écoute après trois échecs consécutifs ou un saut de plus de 3 s.

## Ce que cela change, mesuré

`packages/sync/src/tracker.test.ts` fait tourner la même séance PAL de 10 minutes avec et sans
estimation de débit — la version sans est obtenue en bornant le débit à `[1, 1]`. L'erreur de
position maximale en régime établi passe sous 0,5 s avec estimation, contre nettement plus sans.
Le test compare les deux et échouerait si l'estimation cessait d'apporter quelque chose.

## Alternatives écartées

- **Recaler plus souvent.** Ramener le recalage à 5 s ramènerait la dérive à 0,2 s, mais Whisper
  tournerait six fois plus, sur un appareil qui joue déjà un film. Le coût en batterie et en chaleur
  est réel sur un téléphone posé sur la table du salon.
- **Lire le `scale` de la source.** `title_sources.scale` existe en base (§6) et sert à l'extension,
  qui connaît sa plateforme. Le compagnon, lui, écoute une pièce : il ne sait pas quelle version est
  diffusée, ni sur quel support. Il doit mesurer, pas supposer.
- **Ne rien faire et élargir les marges.** Élargir les marges de sécurité déclenche des protections
  inutiles, donc entraîne des signalements « fausse alerte » sur des segments corrects. On dégraderait
  la base pour compenser une erreur d'horloge.

## Conséquences

- Le suivi met environ 45 s à connaître le débit réel. Avant cela, il se comporte comme §7.3 — donc
  jamais moins bien.
- Une pause ou une coupure publicitaire invalide l'historique d'ancres : le saut est détecté, le
  suivi repasse en écoute, et le débit est réestimé depuis zéro. C'est volontaire — une ancre d'avant
  la coupure ne dit plus rien du débit.
- `@calmcut/sync` expose `SyncTracker`, qui porte cet état. Le compagnon n'a pas à le reproduire, et
  le futur client Android non plus.
