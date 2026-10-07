# Scene Alert — application mobile

> **Statut** : proposition d'architecture. Quatrième surface, absente des jalons du cahier des
> charges — demande un ADR avant d'être engagée.

## Ce que c'est, et ce que ce n'est pas

**Scene Alert est d'abord un outil de capture, pas de protection.**

C'est le point le plus important du document, et celui qu'il faut assumer. Le raisonnement :

- DoesTheDogDie donne du **niveau titre** — « ce film contient des rats » — jamais _quand_ ;
- le micro, ou l'horloge, donne **où on en est**, pas _quand ça arrive_ ;
- il manque donc la moitié, et cette moitié c'est la base de données.

Ce que l'application apporte réellement dès le premier jour :

1. **Prévenir** — « ce film contient des rats, 14 personnes le confirment. Reste sur tes
   gardes. » C'est déjà utile, et ça ne demande aucun horaire.
2. **Capturer** — un appui sur « 🐀 Là ! » produit un horaire exploitable, qui protège la
   personne suivante.

La protection anticipée — le compte à rebours, le bruit blanc — arrive quand la base existe
pour ce film. Vendre l'inverse produirait une application qui déçoit à la première utilisation.

---

## Pourquoi une application native, et pas la PWA

Le fait technique est décisif : **sur iOS, une PWA ne peut pas capter le micro en arrière-plan
ni écran verrouillé.** Pour « le téléphone écoute le film pendant deux heures », c'est
éliminatoire.

Le compagnon web reste la bonne surface sur ordinateur, où l'onglet reste ouvert et visible.
Sur téléphone, il faut du natif.

### Stack : Expo / React Native

Le choix découle d'une décision prise à M0 qui paye exactement maintenant.

`@calmcut/core`, `@calmcut/sync` et `@calmcut/phobias` sont du TypeScript **sans aucune
dépendance runtime et sans supposition d'environnement** — un test de CI l'impose : pas de
`TextEncoder`, pas de `Buffer`, pas de `window`. Ils s'importent dans React Native **tels
quels**.

|                         | Réutilisation                     | Whisper natif                  | Coût       |
| ----------------------- | --------------------------------- | ------------------------------ | ---------- |
| **Expo / React Native** | les 3 paquets, sans modification  | `whisper.rn` (Core ML sur iOS) | **retenu** |
| Flutter                 | nulle — `sync` à réécrire en Dart | bon                            | élevé      |
| Capacitor               | les 3 paquets, mais WebView       | WASM seulement, lent           | moyen      |
| Kotlin + Swift natifs   | nulle — tout en double            | excellent                      | très élevé |

L'encodage UTF-8 du hachage FNV-1a a été écrit à la main précisément pour cette portabilité.
Autant ne pas avoir à s'en servir.

---

## La v1 n'embarque pas Whisper

C'est ma recommandation la plus forte, et elle divise l'effort par dix.

Si le but de la v1 est de **capturer**, la synchronisation automatique est superflue :

1. l'utilisateur choisit le film (recherche TMDB) ;
2. il appuie sur **« le film commence maintenant »** — une horloge démarre, avec pause ;
3. il appuie sur **« 🐀 Là ! »** quand il voit quelque chose.

Cela produit exactement les horaires dont la base a besoin, **sans modèle de 40 Mo, sans
batterie qui fond, sans chauffe, et sans demander le micro** — donc sans le principal motif de
friction en revue d'application.

La précision dépend de l'honnêteté sur les pauses. Et l'API absorbe déjà cette imprécision :
elle retire 2 s de temps de réaction et regroupe les signalements à ±5 s. Cette tolérance a été
conçue pour ce cas.

Whisper devient la **v2**, quand l'objectif passe de capturer à protéger, et il arrive alors
avec le code déjà écrit et testé du compagnon.

---

## Écrans

```
Recherche
  ├─ champ de recherche (TMDB proxifié par notre API)
  └─ résultats : affiche, titre, année

Fiche du film
  ├─ « Contient : 🐀 rats · 🕷️ araignées »        ← DoesTheDogDie, niveau titre
  ├─ « 4 scènes horodatées, 3 vérifiées »          ← notre base, si elle en a
  ├─ mention d'attribution DTDD (obligatoire)
  ├─ [ Commencer une séance ]
  └─ [ Contribuer ]  → file et vote

Séance
  ├─ horloge  01:12:34            (pause / reprise / recaler)
  ├─ « Prochaine scène : 🐀 01:14:20 — dans 1 min 46 »   si la base en a
  ├─ compte à rebours plein écran + bruit blanc           si la base en a
  ├─ [ 🐀 Là ! ]   énorme, toujours accessible
  └─ [ ✋ Fausse alerte ]  pendant une protection

Après le signalement
  ├─ confirmation en moins de 50 ms, UI optimiste
  ├─ annulation possible pendant 10 s
  └─ envoi en arrière-plan, file de réessai si hors ligne

Contribuer
  ├─ film du jour, et son avancement
  ├─ vote pour le prochain film à traiter
  ├─ proposer un film absent
  └─ « tu possèdes ce fichier ? lance le scanner »  → lien vers apps/scanner

Réglages
  ├─ phobies actives
  ├─ volume du bruit blanc, voix du compte à rebours
  ├─ délai d'anticipation (5 s par défaut)
  └─ « aucune donnée ne quitte cet appareil sauf tes signalements »
```

L'écran de séance doit tenir **une seule règle** : le bouton de signalement est toujours
atteignable au pouce, sans défilement, même pendant une protection.

---

## Flux de données

```
                    ┌─────────────────────────────┐
   TMDB ────────────►  workers/api  (existe, M3)  │
   DoesTheDogDie ───►                             │
                    │  /v1/lookup                 │
                    │  /v1/titles/:id             │◄──── Scene Alert
                    │  /v1/reports   ◄────────────┼───── « 🐀 Là ! »
                    │  /v1/votes                  │
                    │  /v1/ingest    ◄────────────┼───── apps/scanner (local)
                    └─────────────────────────────┘
```

Rien de neuf côté serveur : les routes existent depuis M3. Il manque, côté API :

- le proxy de recherche TMDB, mis en cache au bord ;
- le proxy DTDD, **si leurs conditions autorisent la mise en cache** — sinon, appel direct
  depuis l'application avec sa propre clé, ce qui change l'architecture ;
- les votes sur la file (`title_request_votes`).

---

## Ce qui ne quitte jamais le téléphone

| Donnée                               | Sort ?                                               |
| ------------------------------------ | ---------------------------------------------------- |
| Audio du micro (v2)                  | **jamais**                                           |
| Transcription (v2)                   | **jamais**                                           |
| Titres consultés                     | seulement en `lookup`, sous jeton d'appareil anonyme |
| Signalements                         | oui — c'est le produit                               |
| Identité, e-mail, contacts, position | **rien de tout ça n'est demandé**                    |

En revue Apple, le manifeste de confidentialité peut déclarer **« aucune donnée collectée »**,
et c'est vrai. C'est une position rare et solide.

---

## Revue des stores, et posture juridique

**Permission micro (v2 seulement)** : Apple examine de près une écoute continue. Le texte
d'explication doit être explicite — « pour se synchroniser sur le film que vous regardez ;
l'audio ne quitte jamais votre appareil ». En v1, sans micro, ce risque n'existe pas.

**Posture sur le contenu** : l'application ne touche jamais au film. Pas de déchiffrement, pas
de modification, pas de rediffusion, pas de capture d'écran. Du bruit blanc joué sur un appareil
**séparé** de celui qui diffuse. C'est matériellement différent des services qui rediffusaient
des films modifiés et se sont fait condamner.

**Attribution DTDD** : obligatoire selon leurs conditions, à afficher sur chaque fiche.

---

## Structure des fichiers

```
apps/scene-alert/
├─ app.config.ts                 # Expo
├─ package.json                  # dépend de @calmcut/{core,sync,phobias,player-actions}
├─ src/
│  ├─ app/                       # expo-router
│  │  ├─ index.tsx               # recherche
│  │  ├─ film/[id].tsx           # fiche
│  │  ├─ session/[id].tsx        # séance
│  │  ├─ contribute.tsx          # file et vote
│  │  └─ settings.tsx
│  ├─ lib/
│  │  ├─ api.ts                  # client de notre API, jeton d'appareil
│  │  ├─ device.ts               # Turnstile → jeton, stockage sécurisé
│  │  ├─ clock.ts                # horloge de séance, pause, dérive
│  │  ├─ queue.ts                # file de réessai hors ligne
│  │  └─ audio.ts                # bruit blanc, compte à rebours vocal
│  └─ components/
│     ├─ ReportButton.tsx        # le bouton, avec undo de 10 s
│     ├─ Countdown.tsx
│     └─ TriggerBadges.tsx
└─ README.md
```

`packages/player-actions` est réutilisé pour l'ordonnancement — `prepareSegments` et
`protectionAt` sont purs et déjà testés. Seules les implémentations audio changent : Web Audio
devient `expo-av`.

---

## Jalons proposés

|        | Contenu                                                                 | Dépend de             |
| ------ | ----------------------------------------------------------------------- | --------------------- |
| **A1** | Recherche, fiche, alerte DTDD niveau titre                              | clé DTDD + conditions |
| **A2** | Séance : horloge, pause, bouton de signalement, file hors ligne         | A1                    |
| **A3** | Protection quand la base a des horaires : compte à rebours, bruit blanc | données réelles       |
| **A4** | File et vote pour le film du jour                                       | `title_request_votes` |
| **A5** | Synchronisation micro (Whisper) — reprend le code du compagnon          | A3                    |

A1 et A2 constituent une application publiable et utile. **A3 n'a d'intérêt que si la base
contient quelque chose** — c'est le pipeline de détection qui l'alimente, pas l'application.

---

## Questions ouvertes

1. **« Scene Alert » remplace-t-il « CalmCut », ou est-ce le nom de la surface mobile ?** Deux
   marques pour un produit se paye en confusion ; un nom unique se paye en cohérence.
2. **Proxy DTDD ou appel direct ?** Dépend entièrement de leurs conditions sur la mise en cache
   et la redistribution.
3. **Stores** : compte développeur Apple à 99 $/an, Google Play à 25 $ une fois. **Dépense — ton
   arbitrage** (principe 3). Un dépôt APK direct et TestFlight permettent de tester sans
   engager le compte Apple.
