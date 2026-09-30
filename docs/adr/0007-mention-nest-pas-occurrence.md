# ADR 0007 — Une mention n'est pas une occurrence

- **Date** : 2026-09-30
- **Statut** : accepté
- **Jalon** : M2 (corrige l'implémentation de §7.2, avec effet sur M4)
- **Origine** : un test manuel sur un vrai film

## Ce qui s'est passé

Le mode démo a analysé les sous-titres d'un film et proposé **neuf scènes**. Les neuf
étaient des faux positifs. Aucun rat, aucune araignée à l'écran à ces moments-là.

Quatre causes, de nature différente :

| Réplique (paraphrasée)                                         | Cause                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| « pourquoi tu **souris** autant ? »                            | **homographe** : forme du verbe _sourire_                                   |
| « ai-je **raté** quelque chose ? »                             | **bug** : `\b` en JavaScript est ASCII, donc `/\brat\b/` reconnaît « raté » |
| « mes **souris** de laboratoire », « parler à des **souris** » | **mention** : le dialogue en parle, rien n'est à l'écran                    |
| « **[couine** avec enthousiasme] »                             | indication sonore décrivant un **humain**                                   |

Les deux premières sont des défauts d'implémentation. La troisième est une erreur de
conception, et c'est la seule qui compte vraiment.

## Le problème de fond

Le code confondait deux choses qui n'ont presque rien à voir.

- **Une mention** : le dialogue évoque la chose. C'est fréquent, et cela n'indique
  pratiquement jamais qu'elle soit visible. Un film dont un personnage est chercheur en
  laboratoire parlera de souris toutes les dix minutes sans jamais en montrer une.
- **Une occurrence** : une indication sonore SDH atteste d'un bruit _présent_.
  `[couinements]`. C'est rare, et c'est exploitable.

Or le principe 5 dit de protéger au moindre doute. Appliqué à une mention, il protège
presque tout le temps, pour rien. **L'asymétrie est juste pour un signalement humain —
quelqu'un a vu un rat — et fausse pour un mot-clé automatique dont le taux de faux
positifs approche 100 %.** Un utilisateur qui reçoit neuf fausses alertes désinstalle
l'outil ; il n'aura plus aucune protection du tout.

## Décision

**Seules les indications sonores produisent des segments protégés.**

```
sous-titres → detectFromSubtitles()  → occurrences → segments protégés
            → mentionsInSubtitles()  → mentions    → indicateur de titre, aucune protection
```

Les mentions restent une information vraie et utile — « ce film évoque les rats » —
exactement l'indicateur au niveau du titre que §7.2 décrit pour T0. Elles alimentent les
fiches SEO et la priorisation des titres à soumettre à la foule. Elles ne déclenchent rien.

Trois règles en découlent pour les profils :

1. **Frontières de mot Unicode.** `(?<![\p{L}\p{N}_])` et non `\b`. C'est la seule façon
   d'exiger une vraie frontière dans une langue accentuée. Le helper `word()` évite d'y
   penser à chaque motif.
2. **Indications sonores nominales.** `couinements`, jamais `couine` : le sous-titrage SDH
   écrit un bruit sous forme nominale, et une forme conjuguée décrit souvent une personne.
3. **Exclusions explicites** pour les homographes.

## Ce que cela coûte

Sur le film testé, le nombre de scènes proposées passe de neuf à **zéro**. C'est la bonne
réponse : ce fichier de sous-titres ne dit effectivement pas quand une bête est à l'écran.

C'est aussi une information importante sur le produit. **Les sous-titres seuls ne suffisent
pas.** Le timing viendra :

- des **signalements de la foule** (§7.6) — un seul suffit à protéger tout le monde, et là
  l'asymétrie est à sa place ;
- de la **détection audio et vidéo** (T2/T3), qui observe ce qui est présent ;
- de l'**audiodescription**, quand elle existe : c'est la seule piste textuelle qui décrit
  ce qui est _montré_ plutôt que ce qui est _dit_. Voir `docs/roadmap.md`.

Le mode démo permet désormais d'**ajouter une scène à la main**, pour que la chaîne de
protection reste testable quand les sous-titres ne signalent rien.

## Conséquences pour M4

Le batch T1 devra pousser deux choses distinctes :

- des segments `pending` issus des seules indications sonores — peu nombreux ;
- un indicateur de titre par phobie, issu des mentions, qui ne crée aucun segment.

Sans cette séparation, le batch aurait rempli la base de faux positifs à grande échelle,
et la foule aurait passé son temps à les désactiver — cinq votes pondérés chacun, là où
l'asymétrie rend la désactivation volontairement coûteuse.

## Ce que je retiens sur la méthode

Les tests unitaires de la détection passaient tous. Ils vérifiaient que les motifs
reconnaissaient ce qu'on leur donnait — jamais qu'ils ne reconnaissaient _pas_ le reste.
Un test sur du vrai texte, même paraphrasé, aurait montré le problème immédiatement.

`packages/phobias/src/regression.test.ts` reproduit désormais les quatre pièges. Les
répliques y sont **paraphrasées et non recopiées** : ce dépôt est public, et le principe 1
interdit d'y conserver du texte de sous-titres.
