# ADR 0006 — Une table pour rendre « distincts » vrai

- **Date** : 2026-09-30
- **Statut** : accepté
- **Jalon** : M3
- **Précision par rapport au cahier des charges** : §8.2 dit « 50 titres distincts par appareil et par jour (compteur dans D1, colonne `quotaDay`/`quotaUsed`) ».

## Contexte

Un compteur seul ne sait pas compter des choses **distinctes**. Avec `quotaUsed`
incrémenté à chaque requête, on obtient un quota de 50 _appels_, ce qui produit exactement
le mauvais arbitrage :

- **l'utilisateur normal est puni** : il recharge sa fiche, revient au film après une pause,
  rouvre l'onglet — et consomme son quota sur un seul film ;
- **l'aspirateur n'est pas gêné** : son coût réel est le nombre de titres différents, pas le
  nombre d'appels, et 50 appels suffisent déjà à récupérer 50 titres.

## Décision

Une table `device_title_access (deviceId, titleId, day)`, clé primaire composite.

Elle répond à la seule question qui compte : _ce titre est-il nouveau pour cet appareil
aujourd'hui ?_ Seule une réponse positive incrémente `devices.quotaUsed`, qui reste la
colonne décrite par §8.2.

Deux conséquences délibérées :

1. **Relire un titre déjà ouvert est gratuit**, et le reste **même quota atteint**. Refuser
   reviendrait à couper une protection en cours — inacceptable au regard du principe 5.
2. **`GET /v1/lookup` consomme du quota**, parce que c'est l'appel qu'un aspirateur ferait en
   boucle : il transforme un identifiant de plateforme en identifiant interne, ce qui est la
   seule façon d'entrer dans la base sans la connaître.

Le compteur est mis à jour par un `UPDATE … SET quota_used = CASE WHEN quota_day = ? THEN
quota_used + 1 ELSE 1 END`, en une requête : deux requêtes simultanées du même appareil ne
doivent pas se marcher dessus.

## Conséquences

- Une ligne par couple (appareil, titre, jour). Pour 10 000 appareils consultant 5 titres par
  jour, cela fait 50 000 lignes par jour — le cron purge celles de la veille.
- Le quota se remet à zéro à **minuit UTC**, partout. Un fuseau par appareil serait plus
  aimable mais donnerait un second quota gratuit à qui déclare un autre fuseau.
- L'en-tête `Retry-After` d'un refus indique les secondes jusqu'à minuit UTC : le client sait
  quand réessayer sans sonder.

## Alternative écartée

**Compter les lignes de `device_title_access` à chaque requête**, sans colonne compteur. Plus
simple, mais un `COUNT(*)` par requête sur la route la plus chaude du système, là où un entier
déjà lu suffit. La colonne est un cache, la table est la vérité.
