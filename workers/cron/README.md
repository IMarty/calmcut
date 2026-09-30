# `workers/cron` — agrégation périodique

**Jalon : M7.**

Cron Trigger toutes les 15 minutes :

1. recalcule le `score` et le `status` des segments à partir des signalements et des votes pondérés ;
2. republie dans R2 les JSON des titres modifiés ;
3. relance les demandes d'ajout de titre restées en attente.
