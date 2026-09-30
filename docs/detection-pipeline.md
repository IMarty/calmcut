# Pipeline de détection multimodal

> **Statut** : spécification, pas encore implémentée. Remplace l'hypothèse de §7.2 selon
> laquelle les sous-titres suffisent à peupler la base. Voir
> [`adr/0008-pipeline-multimodal.md`](adr/0008-pipeline-multimodal.md).

## Ce qui a mené là

Un test manuel sur un vrai film a produit **neuf détections et neuf faux positifs**. Deux
leçons, de portée très différente :

1. Les expressions régulières sont un mauvais lecteur de sous-titres. Un LLM lisant le même
   texte écarte les quatre pièges sans effort.
2. Plus grave : **le dialogue dit ce qui est dit, pas ce qui est montré.** Aucun lecteur, même
   parfait, ne trouvera dans un `.srt` le rat qui traverse le plan en silence.

Il faut donc plusieurs modalités, chacune couvrant l'angle mort des autres.

| Modalité            | Répond à               | Aveugle à                       |
| ------------------- | ---------------------- | ------------------------------- |
| Dynamique sonore    | les jump scares        | tout le reste                   |
| Changements de plan | les bornes précises    | le contenu                      |
| Événements audio    | ce qui s'**entend**    | le silencieux                   |
| Vision              | ce qui est **visible** | le hors-champ, le narratif      |
| Dialogue (LLM)      | ce qui **arrive**      | le visuel muet, le timing exact |
| Sous-titres         | l'**horloge**          | —                               |

---

## Principe d'exécution : local d'abord

**CalmCut n'analyse rien. CalmCut distribue un outil et reçoit des horaires.**

Ce n'est pas une préférence, c'est ce qui rend le projet défendable. L'analyse exige les
pixels et le son du film ; envoyer ça sur nos serveurs — ou sur un GPU loué par nous —
constituerait une transmission de contenu protégé à un tiers, ce que le principe 1 interdit.

Conséquences, à tenir sans exception :

- le scanner tourne sur la machine de la personne qui **possède déjà** le fichier ;
- la relecture des candidats, **vignettes comprises**, se fait localement ;
- **seuls** `(début, fin, trigger, confiance, modalités concordantes)` sont transmis ;
- aucune image, aucun extrait audio, aucune vignette, aucun texte de sous-titre ne quitte la
  machine ;
- si un contributeur n'a pas de GPU et choisit d'en louer un, c'est **sa** location et **son**
  téléversement. Nos serveurs n'en voient rien.

D'où découle le coût réel du pipeline pour le projet : **zéro**. La section coûts existe pour
le cas où l'on voudrait faire tourner la file soi-même, et pour dimensionner.

---

## Passe 1 — Dynamique sonore : jump scares

Un jump scare n'est pas un fait de langage, c'est un **événement de dynamique** : du
quasi-silence, puis un transitoire violent.

**Outil** : `ffmpeg` avec le filtre `ebur128` (sonie en LUFS court terme) ou `astats`. Aucun
modèle.

**Signature** :

- sonie court terme en fenêtres de 50 ms
- montée de **≥ 15 LU en moins de 300 ms**
- précédée d'au moins **1,5 s** sous un seuil bas (≈ −35 LUFS relatifs)
- **corroborée par un changement de plan** dans un rayon de 200 ms (passe 2)

Sans la corroboration visuelle, la précision chute : une porte qui claque ou un accord de
musique produisent la même signature. Avec, elle est bonne.

**Coût** : quelques secondes de CPU pour un film entier.

**Protection associée** : pas de bruit blanc. Un jump scare demande un **limiteur de
dynamique** plus un avertissement — on amortit, on ne masque pas. À ajouter à
`@calmcut/player-actions`.

---

## Passe 2 — Changements de plan

**Outil** : `ffmpeg -vf "select='gt(scene,0.4)',showinfo"`.

Sert trois usages :

1. corroborer les jump scares ;
2. **caler les bornes** des segments détectés par les autres passes — une scène commence
   presque toujours sur une coupe ;
3. guider l'échantillonnage : densifier juste après une coupe, là où le contenu change.

**Coût** : une passe de décodage, quelques minutes de CPU.

---

## Passe 3 — Événements audio

Whisper transcrit des **mots** ; un cri n'en produit aucun. La bonne famille d'outils est la
**classification d'événements sonores**.

**Outil** : YAMNet (AudioSet, ~4 Mo, MobileNet). Résolution ~1 s, 521 classes.

**Classes utiles** — et c'est le champ `audio.audioSetClasses` déjà présent dans nos profils
de phobies :

| Trigger      | Classes AudioSet                          |
| ------------ | ----------------------------------------- |
| rats         | `Rodents, rats, mice`, `Squeak`           |
| araignées    | `Insect` (approximatif)                   |
| serpents     | `Hiss`                                    |
| insectes     | `Insect`, `Buzz`, `Bee, wasp, etc.`       |
| vomissements | `Vomit`                                   |
| cris         | `Screaming`, `Shout`, `Yell`              |
| pleurs       | `Crying, sobbing`, `Baby cry, infant cry` |
| armes        | `Gunshot, gunfire`, `Machine gun`         |
| bris         | `Glass`, `Shatter`                        |

**Ce que cette passe débloque, et qui vaut à elle seule le détour** : un rat qui couine
derrière une cloison est un moment phobogène avec **rien à voir**. La vision le rate
intégralement. L'audio le trouve.

**Coût** : ~6 000 inférences pour un film de 100 minutes, soit quelques minutes de CPU.

---

## Passe 4 — Vision

**Outil** : YOLO-World (détection à vocabulaire ouvert), via `onnxruntime` local ou
`onnxruntime-web`.

**Le fait technique qui rend ceci possible** : YOLO-World applique le paradigme
_prompt-then-detect_ — les embeddings de texte sont calculés **hors ligne** et
reparamétrés dans les poids du réseau. **Tester quarante triggers coûte donc presque
exactement autant que tester un seul.** On peut donc passer toute la liste visuelle d'un coup.

**Échantillonnage en deux temps** :

1. **balayage à 2 fps** sur tout le film — 12 000 images pour 100 minutes ;
2. **re-balayage à 10 fps** uniquement dans une fenêtre de ±5 s autour de chaque détection.

La seconde passe cale les bornes et rattrape le rat qui traverse en une demi-seconde, pour un
coût marginal : si 60 fenêtres sont candidates, cela fait 6 000 images de plus, soit +50 %
d'un total qui reste petit.

**Pourquoi pas 24 fps** : une scène phobogène dure des secondes, et on applique déjà ±2 s de
marge. Analyser chaque image, c'est multiplier le coût par douze pour une information que les
marges couvrent déjà.

**Prompts** : les `visual.prompts` des profils de phobies (`'rat'`, `'mouse (animal)'`,
`'rodent'`…), enrichis du sous-ensemble visuel de la taxonomie DTDD.

**Faux positifs attendus, et ils sont bénins** : rat en peluche, araignée tatouée, photo au
mur, hamster. Contrairement à « raté » → « rat », ce sont des **quasi-succès** — la personne
phobique préfère souvent être protégée. Ils passent quand même par la relecture.

**Coût** : voir la section coûts. C'est la seule passe qui demande un GPU pour être rapide.

---

## Passe 5 — Dialogue lu par un LLM

C'est la passe qui couvre la **moitié narrative** de la taxonomie DTDD, que la vision ne peut
pas voir : « un chien meurt », « il y a une fausse couche », « un personnage rechute ». Ces
choses sont _racontées_.

**Entrée** : le `.srt`, découpé en fenêtres chevauchantes (≈ 80 répliques, 20 de recouvrement).

**Sortie — strictement structurée, jamais de prose** :

```jsonc
{
  "detections": [
    {
      "trigger": "dog-dies",
      "startCue": 412, // indices de répliques, pas de texte
      "endCue": 419,
      "confidence": 0.7,
      "reason": "vet-scene", // étiquette d'un vocabulaire fermé, pas du texte libre
    },
  ],
}
```

**Trois exigences non négociables**, tirées des neuf faux positifs :

1. **des indices de répliques, jamais le texte.** Le mécanisme existe déjà : `DetectedScene.cues`.
2. **une justification obligatoire**, pour que le relecteur juge en trois secondes.
3. **tout sort en `pending`.** Un LLM produit des sorties qui _sonnent_ bien plus crédibles que
   mes expressions régulières. C'est un générateur de candidats, pas un juge.

**Limite à connaître** : les sous-titres datent la **réplique**, pas l'**événement**. « Le chien
est mort » peut se dire dans une scène postérieure à la mort. Le LLM est bon sur _quoi_,
médiocre sur _quand_ — d'où l'intérêt du croisement : il dit qu'il y a une scène, la vision et
l'audio la bornent.

### Local ou hébergé — décision en attente

|                                          | Qualité                              | Coût              | Principe 1 et 2                          |
| ---------------------------------------- | ------------------------------------ | ----------------- | ---------------------------------------- |
| **Local** (Qwen / Llama 7–8B via Ollama) | suffisante pour de la classification | nulle             | **respectés** : rien ne sort             |
| **Hébergé** (Claude, GPT)                | meilleure                            | centimes par film | **écart** : le `.srt` part chez un tiers |

Le contributeur a déjà le fichier vidéo sur sa machine ; y faire tourner un modèle local garde
la propriété qui rend le projet défendable. **Recommandation : local**, avec l'option hébergée
ouverte si la qualité déçoit — et dans ce cas un ADR pour acter l'écart.

### Ce qu'on n'automatise pas

Le **gaslighting**, la manipulation, les dynamiques d'emprise. Un LLM peut les signaler comme
candidats ; il ne peut pas en juger. L'accord entre annotateurs **humains** y est faible, et un
faux positif y coûte socialement là où un faux rat ne coûte rien.

Ces catégories restent **purement humaines**, alimentées par le signalement. C'est d'ailleurs
ainsi que DTDD les obtient.

---

## Fusion et score

Chaque passe émet des candidats indépendants. La fusion les recoupe.

```
candidats des 5 passes
  → regroupement temporel (chevauchement, ou écart < 3 s, même trigger)
  → comptage des modalités concordantes
  → score et statut
```

| Modalités concordantes | Score | Statut      | Priorité de relecture |
| ---------------------- | ----- | ----------- | --------------------- |
| 1                      | 0,4   | `pending`   | **haute**             |
| 2                      | 0,7   | `pending`   | moyenne               |
| ≥ 3                    | 0,9   | `confirmed` | basse                 |

**À ne pas confondre avec l'application de la protection.** Tous les statuts sauf `disabled`
sont appliqués par les clients (§7.6) : un candidat à une seule modalité protège quand même.
La fusion règle le **score** et l'**ordre de relecture**, pas le fait de protéger. L'asymétrie
du principe 5 reste intacte.

Les **bornes** viennent toujours de la modalité la plus précise disponible : changements de
plan > vision > audio > dialogue.

---

## Relecture, en local

12 000 images donneront peut-être **50 segments candidats**. C'est relisible en cinq minutes.

L'interface montre, pour chaque candidat : une vignette, les modalités qui ont concordé, la
justification, et le dialogue alentour. Trois boutons : **garder**, **écarter**, **ajuster les
bornes**.

Elle tourne **en local**, servie par le scanner. Les vignettes ne doivent jamais atteindre nos
serveurs — c'est la même règle que pour les images, et elle s'érode en silence si on ne
l'écrit pas.

Sortie : `POST /v1/ingest`, qui existe depuis M3 et est idempotent.

---

## Taxonomie des triggers

On prend la taxonomie **DTDD** comme liste de départ plutôt que d'inventer la nôtre : c'est ce
que les gens cherchent, et ça nous rend comparables. Mais il faut la partager selon ce qui est
détectable.

**Sous-ensemble détectable automatiquement** (~30–40 triggers) : araignées, rats, serpents,
insectes, seringues, sang, clowns, chiens, vomissements, cris, armes, hauteurs, eau, feu, milieu
hospitalier, cabinet dentaire, jump scares.

**Sous-ensemble purement narratif**, à laisser aux humains : mort d'un animal, infidélité,
fausse couche, rechute, gaslighting, discrimination, et l'essentiel de la liste DTDD. Un
détecteur d'objets n'y répondra jamais, et un LLM n'y répondra que comme générateur de
candidats.

Notre modèle `PhobiaProfile` héberge les deux : les champs `subtitles`, `audio` et `visual`
sont optionnels. Un trigger purement humain a simplement les trois vides.

**Interopérabilité** : [MovieContentFilter](https://www.moviecontentfilter.com/specification)
définit déjà un format ouvert de segments horodatés avec une taxonomie de phobies
(`arachnophobia`, `musophobia`, `coulrophobia`, `emetophobia`…). Adopter leur format en
import/export nous évite un silo. **Attention** : leurs filtres sont en CC BY-NC-SA 4.0, ce qui
entre en conflit avec notre ODbL et avec la licence API commerciale du §1. À vérifier avant de
toucher à leurs données.

---

## Coûts

### Pour le projet : zéro

Le pipeline tourne chez le contributeur. Ce qui suit dimensionne le cas où l'on voudrait
exécuter la file soi-même — ce que je ne recommande pas, pour les raisons du principe
d'exécution.

### Par film de 100 minutes

Hypothèses : 12 000 images en balayage, 6 000 en re-balayage, 6 000 inférences audio,
40 000 tokens de dialogue. **Le débit de YOLO-World est une estimation à mesurer**, prise
prudemment à 50 images/s sur RTX 4090, pré- et post-traitement compris.

| Passe                     | Ressource | Durée                   | Coût                   |
| ------------------------- | --------- | ----------------------- | ---------------------- |
| Sonie                     | CPU       | secondes                | ~0                     |
| Changements de plan       | CPU       | ~3 min                  | ~0                     |
| Événements audio (YAMNet) | CPU       | ~2 min                  | ~0                     |
| **Vision (YOLO-World)**   | **GPU**   | **~6 min** + chargement | **le poste principal** |
| Dialogue (LLM local)      | CPU/GPU   | ~5 min                  | 0                      |
| Dialogue (LLM hébergé)    | API       | ~1 min                  | 0,01–0,15 $            |

GPU, en comptant 10 minutes de temps attaché ([tarifs relevés en 2026](https://www.synpixcloud.com/blog/vast-ai-vs-runpod-rtx-4090-pricing)) :

| Fournisseur             | Tarif RTX 4090        | Coût du film    |
| ----------------------- | --------------------- | --------------- |
| Vast.ai (marché)        | ~0,29–0,59 $/h        | **0,05–0,10 $** |
| RunPod Community        | à partir de ~0,34 $/h | **0,06 $**      |
| RunPod Serverless       | ~1,10 $/h actif       | **0,18 $**      |
| Machine du contributeur | —                     | **0 $**         |

**Total, chiffre de planification : 0,25 $ par film**, dominé par le GPU, et nul si l'analyse
est locale.

À un film par jour : **~7 $ par mois** en cloud, **0 €** en local. Le stockage est négligeable —
on ne conserve que des horaires, quelques kilooctets par film.

**Aucune dépense ne sera engagée sans ton accord** (principe 3). Ces tarifs bougent et sont à
revérifier au moment de décider.

---

## File et vote

Le mécanisme proposé : un film à la fois, choisi par la communauté.

La table existe déjà — `title_requests(tmdbId, status, attempts)` depuis M3 — et le cron sait
déjà relancer les demandes en attente (§7.8). Il manque :

- une table de votes `title_request_votes(requestId, deviceId, day)`, un vote par appareil et
  par jour ;
- la sélection du gagnant quotidien par le cron ;
- l'annonce : « film du jour : X — si tu le possèdes, lance le scanner ».

**Ne pas centraliser l'exécution.** La file désigne un film, pas un serveur. Le calcul se
répartit, l'exposition juridique aussi, et ça fait une communauté plutôt qu'un service hébergé
par une seule personne.

Amorçage : **DoesTheDogDie** fournit l'indicateur au niveau du titre — « ce film contient des
rats, 14 votes ». Ça ne donne aucun horaire, mais ça dit **quels films valent la file**, ce qui
divise le travail par cent.

---

## Ce que cela change dans les jalons

Le cahier des charges suppose que T1 (sous-titres) peuple la base, et place le scanner en
phase 2. Les données de terrain disent le contraire. Proposition de re-séquencement :

|                               | Avant             | Après                                                |
| ----------------------------- | ----------------- | ---------------------------------------------------- |
| Moteur de peuplement          | T1 sous-titres    | **scanner multimodal + signalements**                |
| `apps/scanner`                | phase 2           | **prioritaire**                                      |
| T1 sous-titres                | source principale | appoint (indications sonores seules)                 |
| Site SEO (M5), extension (M6) | avant les données | **après** — un site sur une base vide ne sert à rien |

---

## Décisions en attente

1. **LLM local ou hébergé** — recommandation : local.
2. **Clé DTDD et ses conditions** — la mise en cache et la redistribution changent
   l'architecture, pas un réglage. Tâche Akiflow en cours.
3. **Licence MovieContentFilter** — leur CC BY-NC-SA est incompatible avec notre ODbL et avec
   la licence API commerciale du §1.
4. **Cloud ou local pour la passe vision** — recommandation : local, pour le principe 1 autant
   que pour le coût.
