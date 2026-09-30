# `packages/db` — schéma D1

**Jalon : M3.** Paquet interne, jamais publié sur npm.

Schéma Drizzle et migrations `drizzle-kit` pour Cloudflare D1 (§6).

`creditsStart` et `creditsEnd` sont des colonnes internes, consommées par le filigrane (dépôt privé
`calmcut-watermark`). Elles **ne sont jamais exposées publiquement**, ni par l'API, ni par l'export
ODbL, ni dans le HTML du site.
