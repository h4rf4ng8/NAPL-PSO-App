# NAPL

NAPL is a React/Vite league application backed by an authenticated Fastify API. The browser uses same-origin `/api/*` and `/auth/*` requests. The API owns database access, input validation, authorization, and PostgreSQL session and membership state. Browser code does not connect directly to Supabase's database API.

## Code layout

- `web/src/features/` owns domain UI, models, commands, and GraphQL selections.
- `api/routes/` and `api/plugins/` own API routes, database access, and authentication.
- `pkgs/contracts/` contains browser-safe schemas shared by the web app and API.
- `supabase/` contains migration history, the test fixture, and local CLI configuration.

Feature `.graphql` files declare queries and field selections. Each domain’s `api.ts` owns requests, response validation, and defaults. Dashboard `api.ts` owns the loaders that compose those domain selections. Generated typed documents live in `web/src/api/generated/graphql.ts`.

Both dashboards call their loaders through `useResource`, which suppresses stale results. The imperative Apollo client deduplicates requests; logout cancels outstanding reads and clears session data. Theme state is local React state with persisted light/dark preferences. Administrator assignments load within `AdminsManager` and disable writes when loading fails. Team dialogs resolve the selected ID against refreshed teams, so lineup and membership changes remain visible.

Commands send writable fields only; identity, article authors, timestamps, and review state come from the server. Season replacement uses one admin-only `PUT /api/schedule/season/:season` command. The API validates up to 1,000 rows before deleting and inserting within a serializable transaction; insertion conflicts roll back the replacement. Existing bulk and delete endpoints remain available. Championship trophy updates remain server-side.

## Local development

Use Node 24 and npm 11.

```sh
nvm use
npm ci
npm run setup:env
npm run generate
npm run dev:api # separate terminal
npm run dev
```

Vite listens on `http://localhost:5173` and proxies `/api` and `/auth` to `LOCAL_API_URL`, then `API_URL`, then `http://127.0.0.1:3000`. Set `ORIGIN_SECRET` in the Vite process or local `web/.env`; never use `VITE_` for secrets. API settings are documented in [api/.env.example](api/.env.example).

`setup:env` creates `api/.env` if needed and generates `COOKIE_KEYS` once, preserving existing keys and other settings. Fill in provider/database values locally. Use separate application and auth database roles. Never commit actual `.env` files or regenerate the cookie key at startup.

## Checks

```sh
npm run generate
npm run gql:check
npm run typecheck
npm run lint
npm run build
npm run test:integration
```

The integration runner creates disposable PostgreSQL containers, applies fixtures and migrations, and runs the workspace tests, including authorization, schedule rollback/concurrency, server commands, GraphQL validation, session isolation, and theme behavior. It does not modify live data.

## Rollout

Release the API before the replacement frontend. The cutover and RBAC migrations remove direct browser access to league tables, so coordinate their application with switching clients to the API. Applying them while the legacy browser remains in use will break that legacy client. Database migrations and production deployment require a separate rollout; the local integration runner only applies them to disposable fixtures.
