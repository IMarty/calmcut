# `@calmcut/player-actions`

Ce qui se passe quand une scène approche. Partagé entre le compagnon web et, à M6, l'extension —
pour qu'une protection se comporte identiquement sur les deux surfaces.

Paquet interne, jamais publié sur npm.

## Deux couches

**`scheduler.ts` est pur** : pas d'audio, pas de DOM, pas d'horloge interne. On lui donne une
position dans le film, il répond `idle`, `warning` ou `protecting`. C'est ce qui permet de tester la
question qui compte — _l'alerte tombe-t-elle avant la scène ?_ — sans navigateur.

- `prepareSegments` filtre sur les phobies choisies, applique les marges, puis **fusionne les
  segments qui se chevauchent**. Sans la fusion, deux scènes proches déclencheraient un second
  compte à rebours pendant la première protection.
- `protectionAt` répond en **O(log n)** : l'extension l'appellera sur chaque image de la vidéo.

**`runner.ts` relie** l'ordonnanceur aux actions, par injection — donc testable avec des doublures.
`white-noise.ts` et `announcer.ts` sont les implémentations navigateur.

## Asymétrie de sécurité

Quand la position devient inconnue — le suivi a perdu son verrou — l'exécuteur **ne relâche pas**.
S'il protégeait, il continue. S'il était en compte à rebours, il **passe directement en protection**.

Un bruit blanc qui dure trop longtemps est un désagrément. Un bruit blanc qui s'arrête au mauvais
moment laisse passer la scène (principe 5). C'est `release()` qui met fin à une protection
maintenue, quand le suivi se reverrouille ou quand l'utilisateur signale une fausse alerte.

## Détails qui ont l'air cosmétiques et ne le sont pas

- Les **fondus de 300 ms** du bruit blanc : un démarrage sec est une agression sensorielle de plus
  pour quelqu'un qui est déjà en alerte.
- Le tampon de bruit est **rebouclé** plutôt que généré en continu, avec un fondu à ses deux
  extrémités pour éviter le clic à chaque boucle. La lecture d'un tampon est gérée par le thread
  audio et ne coûte rien au thread principal.
- L'**annonce vocale** compte autant que le visuel : l'utilisateur regarde l'écran du film, pas son
  téléphone. Mais la protection ne dépend jamais de la voix — `speechSynthesis` absent donne un
  `silentAnnouncer`, et tout le reste fonctionne.
