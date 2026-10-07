# ADR 0005 — Choix audio du compagnon

- **Date** : 2026-09-30
- **Statut** : accepté
- **Jalon** : M2

## Contexte

Le compagnon doit, sur un téléphone posé sur la table du salon, écouter un film qui
sort d'une télévision à trois mètres, s'y synchroniser, et **produire lui-même du son** pendant
les scènes protégées. Trois décisions non évidentes en découlent.

## Décision 1 — Un seul `AudioContext`, à 16 kHz

Whisper exige du 16 kHz mono. Plutôt que de laisser le navigateur ouvrir un contexte à 48 kHz et
de ré-échantillonner en JavaScript, le compagnon crée son contexte directement à
`sampleRate: 16000`. Le navigateur ré-échantillonne alors le micro dans son code natif, et il n'y a
plus une ligne de conversion à écrire, à tester, ni à exécuter pendant le film.

Le même contexte sert à la **sortie** — bruit blanc et voix du compte à rebours. Un bruit limité à
8 kHz masque très bien une bande-son, et il est même moins agressif qu'un bruit pleine bande pour
quelqu'un qui est déjà en alerte.

## Décision 2 — Annulation d'écho et réduction de bruit **désactivées**

Les réglages par défaut de `getUserMedia` sont calibrés pour la visioconférence : quelqu'un qui
parle dans son téléphone. Notre situation est l'inverse.

- `noiseSuppression: false` — la réduction de bruit prendrait des dialogues lointains et étouffés
  pour du bruit de fond, et les supprimerait précisément.
- `echoCancellation: false` — l'annulation d'écho traiterait le son de la télévision comme un
  retour à éliminer, puisqu'il ne vient pas de l'interlocuteur.
- `autoGainControl: true` — celui-là on le garde : il compense la distance à la télévision.

## Décision 3 — Le micro est coupé pendant la protection

Conséquence directe de la décision 2 : sans annulation d'écho, le bruit blanc que le compagnon
émet revient dans son propre micro et polluerait la transcription.

Pendant une protection, l'AudioWorklet cesse d'émettre des paquets. C'est sans coût : verrouillé,
le suivi n'a pas besoin de transcrire, l'horloge locale suffit. À la sortie de la scène, la capture
reprend, et le recalage suivant a lieu comme prévu.

Un casque reste recommandé dans l'accueil — il supprime le problème à la source et masque mieux.

## Conséquences

- Aucun code de ré-échantillonnage à maintenir, et aucune conversion sur le thread principal.
- Le compagnon est plus sensible aux bruits de la pièce qu'une application de visioconférence.
  C'est assumé : l'algorithme de verrouillage exige trois trigrammes concordants et tolère
  l'absence de correspondance, donc un passage bruyant coûte un recalage, pas une désynchronisation.
- La transcription ne tourne pas pendant les scènes protégées, ce qui économise aussi de la batterie
  au moment où l'appareil chauffe le plus.
- L'audio ne quitte jamais l'appareil : micro → AudioWorklet → Worker de transcription, et rien
  d'autre (principe 4).
