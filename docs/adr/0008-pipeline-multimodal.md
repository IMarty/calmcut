# ADR 0008 — Le pipeline multimodal remplace les sous-titres comme moteur de peuplement

- **Date** : 2026-10-01
- **Statut** : accepté
- **Écart assumé** : §7.2 fait de T1 (sous-titres) la source principale de segments, et place
  `apps/scanner` en phase 2.

## Contexte

Un test manuel sur un vrai film a produit **neuf détections et neuf faux positifs**. L'ADR 0007
a corrigé l'implémentation — mention ≠ occurrence — mais laissait une question ouverte : avec
des indications sonores seules, combien de segments un `.srt` produit-il réellement ?

Sur le film testé : **zéro**. Et c'est la bonne réponse, pas un bug. Un fichier de sous-titres
ne dit presque jamais quand une bête est à l'écran.

Le cahier des charges suppose pourtant que T1 peuple la base. Cette hypothèse est fausse.

## Décision

**Cinq modalités, chacune couvrant l'angle mort des autres**, spécifiées dans
[`docs/detection-pipeline.md`](../detection-pipeline.md) :

| Passe               | Outil                           | Répond à                              |
| ------------------- | ------------------------------- | ------------------------------------- |
| Dynamique sonore    | `ffmpeg ebur128`                | jump scares                           |
| Changements de plan | `ffmpeg select=scene`           | bornes précises                       |
| Événements audio    | YAMNet / AudioSet               | ce qui s'entend, y compris hors champ |
| Vision              | YOLO-World, 2 fps en deux temps | ce qui est visible                    |
| Dialogue            | LLM local                       | ce qui est raconté                    |

Avec une **fusion par concordance** : le nombre de modalités qui s'accordent règle le score et
la priorité de relecture, jamais le fait de protéger — l'asymétrie du principe 5 reste intacte.

`apps/scanner` devient **prioritaire**, et T1 un appoint.

## Deux propriétés qui rendent ceci possible

**YOLO-World applique _prompt-then-detect_** : les embeddings de texte sont calculés hors ligne
et reparamétrés dans les poids. Tester quarante triggers coûte donc presque autant que tester
un seul — on peut passer toute la liste visuelle de DoesTheDogDie d'un coup.

**L'audio voit ce que la vision ne peut pas voir.** Un rat qui couine derrière une cloison est
un moment phobogène avec rien à l'écran. C'est la modalité qui justifie à elle seule le
croisement.

## Le principe d'exécution, non négociable

**CalmCut n'analyse rien. CalmCut distribue un outil et reçoit des horaires.**

L'analyse exige les pixels et le son. Les envoyer sur nos serveurs, ou sur un GPU loué par nous,
serait une transmission de contenu protégé à un tiers — ce que le principe 1 interdit. Donc :

- le scanner tourne chez la personne qui possède déjà le fichier ;
- la relecture des candidats, vignettes comprises, est locale ;
- seuls `(début, fin, trigger, confiance, modalités)` sont transmis.

Cette contrainte a un effet secondaire heureux : **le coût du pipeline pour le projet est nul.**

## Conséquences

- Le coût par film est de l'ordre de **0,25 $** si l'on loue un GPU, **0 $** en local. Le poste
  dominant est la seule passe vision.
- La file de traitement réutilise `title_requests`, déjà en base depuis M3. Il manque une table
  de votes.
- **DoesTheDogDie devient la source d'amorçage** : son indicateur de titre ne donne aucun
  horaire mais dit quels films valent la file, ce qui divise le travail de la foule par cent.
- **M5 (site SEO) et M6 (extension) passent après.** Un site qui affiche une base vide ne sert
  personne.
- Le gaslighting et la moitié narrative de la taxonomie DTDD restent **purement humains**. Un
  LLM peut les signaler comme candidats, jamais en juger : l'accord entre annotateurs humains y
  est faible, et un faux positif y coûte socialement là où un faux rat ne coûte rien.

## Alternatives écartées

- **Audiodescription comme source.** Décrit ce qui est montré, donc idéale sur le papier. Mais
  aucun service ne sert ce texte à la demande pour des films commerciaux : c'est une piste
  audio embarquée dans les lecteurs. Les corpus de recherche existants sont sous licence de
  recherche et couvrent quelques centaines de titres.
- **Analyse d'images dans l'extension navigateur.** Impossible : sur les plateformes DRM,
  `canvas.drawImage` renvoie du noir. Ce n'est pas une question de performance.
- **Plugin C pour VLC.** Donnerait accès aux images décodées, mais l'ABI des modules VLC est
  instable entre versions et il faudrait compiler par plateforme. `ffmpeg` obtient le même
  résultat sans plugin, et l'analyse est de toute façon une passe hors ligne.
