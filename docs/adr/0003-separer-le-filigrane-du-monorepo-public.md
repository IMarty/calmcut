# ADR 0003 — Dépôt public, et filigrane dans un dépôt privé séparé

- **Date** : 2026-09-30
- **Statut** : accepté
- **Jalon** : M0
- **Écart assumé avec le cahier des charges** : §4 rendait `calmcut` **privé**, précisément parce
  qu'il devait contenir `packages/watermark`.

## Contexte

Le critère d'acceptation de M0 exige une CI verte sur GitHub. Aucun job ne démarrait : le compte est
bloqué côté facturation GitHub Actions (« recent account payments have failed or your spending limit
needs to be increased »).

Sur un **dépôt privé**, les minutes Actions sont décomptées d'un quota, donc soumises à la limite de
dépense — d'où le blocage. Sur un **dépôt public**, elles sont gratuites et illimitées. Vérifié
empiriquement sur ce compte : un dépôt public jetable a exécuté un workflow avec succès pendant que
`calmcut` restait bloqué.

Augmenter la limite de dépense est une action payante : elle relève d'Igor (principe 3), et le
principe 3 dit par ailleurs de rester dans les offres gratuites. Rendre le dépôt public est la
réponse qui respecte le principe, pas celle qui le contourne.

Restait la raison d'être du privé : `packages/watermark`.

## Décision

**`calmcut` est public. Le filigrane vit dans un dépôt privé séparé, `calmcut-watermark`.**

Y sont déplacés la conception (`docs/watermark.md` → `docs/design.md`), `packages/watermark` et
`tools/leak-detect`. Ils n'ont **jamais figuré dans l'historique du dépôt public** : le dépôt public
a été créé vierge et l'historique poussé y est exempt de ces fichiers.

La frontière est celle de l'exploitabilité, pas du secret :

- **Dans le dépôt public** : le fait qu'un filigrane existe, et les trois contraintes qu'il impose
  au reste du code — `creditsStart`/`creditsEnd` internes, cache par `(titleId, deviceBucket)`,
  interdiction d'import depuis un paquet publié.
- **Dans le dépôt privé** : tout le calibrage — les valeurs, les emplacements, les proportions, et
  la méthode statistique d'attribution.

## Pourquoi cette frontière et pas le secret complet

La solidité du filigrane repose sur la clé HMAC, jamais sur l'ignorance de l'algorithme — le
document de conception le dit lui-même : « ce n'est pas une protection, c'est un moyen de preuve ».
SponsorBlock, dont CalmCut s'inspire, est entièrement open source.

Ce qui change vraiment la donne pour un aspirateur, ce sont les valeurs de calibrage : connaître les
paramètres exacts transforme un mécanisme coûteux à contourner en une soustraction mécanique. C'est
cela, et cela seul, qui reste privé.

## Conséquences

- **La CI de M0 peut enfin tourner**, sans dépense et sans attendre une intervention de facturation.
- **Deux dépôts à tenir synchronisés à M8.** Le coût est réel mais faible : `@calmcut/watermark` est
  consommé par `workers/api` seul, via un chemin d'import unique.
- **Le monorepo public contient du code propriétaire** (`LICENSE`). « Public » signifie visible, pas
  librement réutilisable. Les trois paquets npm restent en AGPL-3.0, les données en ODbL.
- **Le dépôt privé `calmcut` d'origine est conservé et renommé** plutôt que supprimé : le token `gh`
  n'a pas le scope `delete_repo`. Il ne contient rien qui ne soit ailleurs, et sa suppression revient
  à Igor.
- **L'horodatage de la conception du filigrane** (e-Soleau ou RFC 3161) devient plus important, pas
  moins : la preuve d'antériorité ne repose plus sur un dépôt privé daté.
