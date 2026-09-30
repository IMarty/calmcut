# `apps/scanner` — analyse de médiathèque locale

**Jalon : phase 2, après M9.** Rien à implémenter pour l'instant.

CLI Bun destinée à analyser une médiathèque locale, Plex ou Jellyfin pour produire des segments
T2 (audio et vidéo) sur les fichiers que l'utilisateur possède déjà.

L'analyse tourne **entièrement sur la machine de l'utilisateur** : aucun contenu, extrait ou
piste audio ne remonte vers l'API. Seuls des timestamps sont poussés, via le même endpoint
d'ingestion que le batch.
