## Pourquoi

<!-- Le problème ou le besoin. Pas « ce que fait la PR » : ça se lit dans le diff. -->

## Ce que ça change

<!-- Les points saillants, du point de vue d'un utilisateur ou d'un appelant. -->

## Vérifié comment

<!-- Ce qui a été réellement exécuté, et le résultat. -->

- [ ] `bun run ci` passe en local

## Jalon

<!-- M0 … M9, ou « hors jalon ». -->

## Points de vigilance

- [ ] Aucun contenu protégé ajouté au dépôt : ni vidéo, ni audio, ni texte de sous-titres (principe 1)
- [ ] Aucun secret en clair (principe 8)
- [ ] Aucune action payante engagée sans validation d'Igor (principe 3)
- [ ] Aucun timestamp précis exposé sur une page publique (§7.7)
- [ ] Si un paquet npm est modifié : `bun run changeset` ajouté
- [ ] Si l'algorithme de synchro change : `SYNC_INDEX_VERSION` incrémenté (§4.1)
- [ ] Si l'architecture s'écarte du cahier des charges : ADR ajouté dans `docs/adr/` (§14)
