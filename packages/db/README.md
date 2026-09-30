# `@calmcut/db` — schéma D1

Schéma Drizzle et migrations `drizzle-kit` pour Cloudflare D1 (§6). Paquet interne, jamais publié
sur npm — un test de CI le vérifie.

## Ce qu'on ne trouvera jamais dans ces tables

Ni texte de sous-titres, ni extrait, ni vignette, ni la moindre donnée dérivée d'une œuvre. Un
segment est une paire d'horaires et une étiquette ; un index de synchro est une clé R2 vers un
fichier d'entiers (principe 1).

## Deux colonnes à ne jamais exposer

`titles.creditsStart` et `titles.creditsEnd` sont **internes** (§6). Elles sont consommées par le
filigrane, dont la conception vit dans le dépôt privé `calmcut-watermark`. Les exposer
affaiblirait le mécanisme. Un test d'intégration de l'API vérifie qu'elles n'apparaissent nulle
part dans le texte brut des réponses.

## Une table qui n'est pas dans le cahier des charges

`device_title_access` rend le mot « distincts » vrai dans « 50 titres distincts par jour ». Un
simple compteur donnerait un quota de 50 _appels_, ce qui punit l'utilisateur normal sans gêner
l'aspirateur. Voir [ADR 0006](../../docs/adr/0006-quota-de-titres-distincts.md).

## Migrations

```bash
bun run --filter '@calmcut/db' generate           # après toute modification du schéma
bun run --filter '@calmcut/db' migrate:local      # base D1 locale de wrangler
bun run --filter '@calmcut/db' migrate:preview    # nécessite les identifiants Cloudflare
```

Le SQL généré est committé : c'est lui qui part en production, et c'est **exactement** le même que
celui appliqué par les tests d'intégration.

Le catalogue `phobias` est synchronisé depuis `@calmcut/phobias`, qui reste la source de vérité :
la table n'existe que pour l'intégrité référentielle et les jointures.
