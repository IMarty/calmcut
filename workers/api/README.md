# `workers/api` — API publique

**Jalon : M3.**

Hono sur Cloudflare Workers, lié à D1 (`calmcut-db`) et R2 (`calmcut-data`).

Routes prévues (§8.5) : `POST /v1/device`, `POST /v1/device/refresh`, `GET /v1/lookup`,
`GET /v1/titles/:id`, `GET /v1/titles/:id/sync`, `POST /v1/reports`, `POST /v1/votes`,
`POST /v1/ingest` (token de service), `GET /v1/public/titles/:slug/summary`.

Aucun endpoint de liste ni d'export : la seule façon d'obtenir un titre est de le nommer.
