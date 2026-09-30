# `apps/web` — site public + compagnon PWA + modération

**Jalon : M5** (le POC du compagnon en mode démo est M2).

Astro (adapter `@astrojs/cloudflare`) avec des îlots Svelte 5, une seule application pour
trois surfaces afin de partager le cache edge, le service worker et le modèle Whisper mis en cache :

- **site public SEO** — fiches `/films/:slug` et `/films/:slug/:phobie`, recherche, `/contribuer`,
  `/soutenir`, pages légales. 0 Ko de JS hors îlots ;
- **compagnon PWA** — `/watch/:slug` : écoute au micro, verrouillage sur la timeline, compte à
  rebours et bruit blanc. Un seul îlot Svelte, Whisper dans un Web Worker, capture en AudioWorklet ;
- **modération** — `/admin/*`, protégée.

Budgets vérifiés en CI : fiche SEO ≤ 15 Ko de JS gzip et LCP < 1 s en 4G ; shell du compagnon
≤ 50 Ko de JS gzip hors modèle Whisper.
