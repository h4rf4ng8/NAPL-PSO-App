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
sam validate --lint --template-file api/template.yaml
```

The integration runner creates disposable PostgreSQL containers, applies fixtures and migrations, and runs the workspace tests, including authorization, schedule rollback/concurrency, server commands, GraphQL validation, session isolation, and theme behavior. It also checks the bundled Lambda package outside the repository. It does not modify live data. `npm run test:sam` additionally invokes the package through SAM's local container.

## Production deployment

[The deployment guide](docs/lambda.md) covers the Lambda API and Vercel frontend, required configuration, connection sizing, validation, and rollback. [api/template.yaml](api/template.yaml) creates an IAM-protected Function URL and a Vercel production OIDC role scoped to the live alias. Vercel's server-only proxy signs requests and forwards the shared origin secret; application authentication and authorization still apply.

`npm run env:sam` validates production settings and writes a private, ignored parameter file using the saved cookie key ring. The guide shows how to pass that file to SAM without copying secret values into shell arguments. It does not deploy anything itself. The [archived NGINX/Redis diagram](docs/history/system.png) is historical and does not describe this deployment.

`npm run test:load -- --help` describes the optional read-only staging load runner. It requires an explicit staging target and database budget; see the deployment guide before running it. Historical container measurements are not evidence of Lambda capacity.

## Rollout

Release the API before the replacement frontend. The cutover and RBAC migrations remove direct browser access to league tables, so coordinate their application with switching clients to the API. Applying them while the legacy browser remains in use will break that legacy client. Database migrations and production deployment require a separate rollout; the local integration runner only applies them to disposable fixtures.
