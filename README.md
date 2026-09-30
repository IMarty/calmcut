<div align="center">

# CalmCut

**Regarder un film sans tomber sur la scène qui vous terrifie.**

</div>

---

Il y a une scène de rats dans ce film. Vous le savez, quelqu'un vous l'a dit, et vous passez
1 h 40 la main sur la télécommande au lieu de regarder le film.

CalmCut sait **quand** elle arrive, et vous prévient : « 🐀 dans 5… 4… 3… » — puis du bruit blanc le
temps que ça passe. Vous reprenez le film là où il en était, sans l'avoir vue.

Ça marche pour les rats, les araignées, et bientôt les serpents, les insectes, les aiguilles, les
clowns, le sang, les vomissements. **C'est gratuit.**

## Trois façons de l'utiliser

|                     |                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🌐 **Le site**      | « Y a-t-il des rats dans _Ratatouille_ ? » — la réponse, avant de lancer le film.                                                                                          |
| 📱 **Le compagnon** | Une page web qui **écoute le film au micro**, se synchronise sur les dialogues, et vous prévient. Marche sur n'importe quel écran : votre télé, celle d'un ami, un cinéma. |
| 🧩 **L'extension**  | Sur Netflix, Disney+, Prime Video et YouTube : l'écran devient noir et le son se coupe tout seul, au bon moment.                                                           |

Partout, deux boutons : **« 🐀 Là ! »** quand on a vu quelque chose, **« ✋ Fausse alerte »** quand la
protection s'est déclenchée pour rien. C'est comme ça que la base grandit.

## Ce que CalmCut ne fait pas

- **Il ne stocke aucun film.** Ni vidéo, ni audio, ni même le texte des sous-titres. La base ne
  contient que des horaires et des étiquettes : « rats, de 1 h 12 min 11 s à 1 h 12 min 20 s ».
- **Il n'envoie pas votre micro sur un serveur.** La reconnaissance vocale tourne **dans votre
  navigateur**. L'audio ne quitte jamais votre appareil.
- **Il ne demande pas de compte.** Pas d'e-mail, pas de mot de passe, pas de profil.

## Pourquoi c'est gratuit

Parce qu'une phobie n'est pas un marché. CalmCut vit de dons (Ko-fi, Liberapay, Open Collective).

Une seule fonctionnalité sera payante, plus tard : le **mode Exposition progressive** — un flou qui
diminue séance après séance, pensé pour accompagner une thérapie. Tout le reste restera gratuit,
pour tout le monde.

## Contribuer

Le plus utile : **utiliser CalmCut et signaler ce qu'il rate**. Un seul signalement suffit à
protéger tout le monde — c'est volontaire, parce qu'un rat qui passe est plus grave qu'une alerte de
trop.

Vous pouvez aussi :

- **proposer une phobie** — les profils sont de la simple configuration
  ([`packages/phobias`](packages/phobias/src/profiles.ts)) ;
- **contribuer au code** — voir [`CLAUDE.md`](CLAUDE.md) pour la stack et les commandes, et
  [`docs/roadmap.md`](docs/roadmap.md) pour ce qui est en cours.

```bash
bun install
bun run ci
```

## Licences

| Quoi                                                 | Licence                                    |
| ---------------------------------------------------- | ------------------------------------------ |
| `@calmcut/core`, `@calmcut/sync`, `@calmcut/phobias` | [AGPL-3.0-or-later](packages/core/LICENSE) |
| Les **données** (segments, horaires, étiquettes)     | [ODbL 1.0](DATA_LICENSE.md)                |
| Le reste du dépôt                                    | [propriétaire](LICENSE)                    |

L'extraction automatisée de l'API est interdite par les CGU. La base est par ailleurs protégée par
le droit _sui generis_ du producteur de base de données (art. L341-1 CPI).

---

<div align="center">
<sub>Construit par <a href="https://github.com/IMarty">Igor Marty</a>.</sub>
</div>
