# `packages/player-actions` — actions de protection

**Jalon : M2** (bruit blanc et compte à rebours pour le compagnon), complété en **M6**
(overlays de l'extension).

Code partagé entre le compagnon web et l'extension, pour qu'une protection se comporte
identiquement sur les deux surfaces :

- bruit blanc Web Audio avec fondus de 300 ms ;
- compte à rebours (`speechSynthesis` + visuel) 5 s avant le segment ;
- ducking du son, `video.volume` avec fondu ;
- overlays noir ou flou ;
- vibration sur mobile.

Tout est déclenché par des événements de timeline : aucune connaissance de l'API ni du réseau.
