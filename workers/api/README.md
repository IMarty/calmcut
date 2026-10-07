# `workers/api` — API publique

Hono sur Cloudflare Workers. Toutes les routes de [`docs/api.md`](../../docs/api.md) sont
implémentées et couvertes par des tests d'intégration.

## Ce qui tient cette API debout

**Aucun endpoint de liste, aucune pagination, aucun moyen d'énumérer** (§8.2). La seule façon
d'obtenir un titre est de le nommer — par son ULID, ou via `lookup` avec un identifiant de
plateforme. C'est ce qui rend le quota de 50 titres par jour effectif plutôt que décoratif.

**Les colonnes sont sélectionnées une par une**, jamais par un `select()` complet. `creditsStart`
et `creditsEnd` ne peuvent donc pas fuiter par inadvertance, et un test vérifie qu'elles
n'apparaissent nulle part dans le **texte brut** des réponses (§6).

**Les intergiciels sont attachés route par route**, jamais par `use('*')`. Plusieurs
sous-applications sont montées sur `/v1` : un `use('*')` dans l'une d'elles s'appliquerait à
toutes les requêtes qu'aucune route ne résout, et ferait répondre 403 là où il faut 404 — ce qui
apprendrait à un sondage anonyme quelles routes existent.

**Le quota compte des titres distincts**, via la table `device_title_access`
([ADR 0006](../../docs/adr/0006-quota-de-titres-distincts.md)). Relire un titre déjà ouvert est
gratuit, et le reste même quota atteint : refuser couperait une protection en cours.

**L'ingestion est idempotente** sur des clés naturelles — `tmdbId` pour un titre,
`(kind, externalId)` pour une source, `(titleId, phobiaId, start, end)` pour un segment. Le batch
tourne sur GitHub Actions, où un job peut être relancé ou dédoublé.

## Tests

89 tests d'intégration, exécutés **dans workerd** avec un vrai D1 et un vrai R2 fournis par
Miniflare. C'est le runtime de production, pas une imitation : le SQL, les contraintes et les
conflits d'insertion sont réellement exercés.

```bash
bun run --filter '@calmcut/api' test
bun run test            # depuis la racine : projet `node` + projet `api`
```

Les bindings de test sont déclarés dans `vitest.config.ts`, jamais repris de `wrangler.jsonc` :
les tests ne dépendent ni d'un identifiant de base réel, ni d'un secret.

## Développement local

```bash
cp .dev.vars.example .dev.vars          # valeurs factices, jamais un secret de production
bun run --filter '@calmcut/db' migrate:local
bun run --filter '@calmcut/api' dev
```

`wrangler deploy --dry-run` valide la configuration sans identifiants — utile avant de pousser.

## Ce qui reste

- **Déploiement preview** : bloqué tant que les bases D1 n'existent pas. Les `database_id` de
  `wrangler.jsonc` sont des placeholders. Voir [`docs/cloudflare-manual.md`](../../docs/cloudflare-manual.md).
- **Filigrane par appareil** (M8) : `GET /v1/titles/:id` sert aujourd'hui le document tel quel. Un
  `TODO(M8)` marque l'endroit. La conception vit dans le dépôt privé `calmcut-watermark`.
- **Transitions de statut** (M7) : les signalements et les votes sont persistés, mais passer un
  segment en `disabled` exige un consensus que seul le cron d'agrégation peut évaluer. Une requête
  isolée ne doit jamais pouvoir éteindre une protection.
- **Demandes d'ajout de titre** (§7.8) : la table `title_requests` existe, la route viendra avec le
  `repository_dispatch` de M4.
