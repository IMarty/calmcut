# `tools/seed` — jeux de données de développement

```bash
bun run seed              # résumé de ce qui serait généré
bun run seed --sql        # le SQL, à envoyer où l'on veut
bun run seed --titles=50
```

**Tout est synthétique.** Aucun titre réel, aucun dialogue réel, aucun index dérivé d'une œuvre :
les dialogues sont générés, et les index de synchro sont construits à partir de ces dialogues
générés. Ni le dépôt ni un environnement de développement ne contiennent donc de donnée dérivée
d'un contenu protégé (principe 1).

Le générateur est **déterministe** : deux exécutions produisent la même base, ce qui rend les
tests reproductibles.

## Il est utilisé par les tests

`seedDatabase` peuple aussi la base des tests d'intégration de l'API. C'est volontaire : un outil
de seed qu'on n'exécute jamais se découvre cassé le jour où on en a besoin.

## Appliquer à une base D1 locale

```bash
bun run seed --sql > /tmp/seed.sql
cd workers/api
bunx wrangler d1 execute calmcut-db-preview --local --file=/tmp/seed.sql
```

L'écriture passe par wrangler, pas par ce script : une base D1 locale vit dans `.wrangler/state`,
et seul wrangler sait l'adresser proprement.
