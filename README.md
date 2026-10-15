# NAPL

This branch adds a server-owned API alongside the existing React/Vite application. The legacy browser app remains in `src/` and continues to use its current Supabase integration; its frontend cutover is a separate change.

The Fastify API owns account and league commands, GraphQL reads, Discord membership checks, encrypted HttpOnly sessions, CSRF protection, and authorization. PostgreSQL roles separate application access from private authentication state. Shared browser-safe schemas live in `pkgs/contracts/`.

## Local development

Use Node 24 and npm 11:

```sh
nvm use
npm ci
npm run generate
npm run setup:env
npm run dev:api
```

Fill in `api/.env` using [api/.env.example](api/.env.example). `setup:env` creates the file and a persistent cookie key if needed, preserving existing configuration. API requests require the configured `x-origin-secret` header; authenticated commands also require the session and CSRF cookies.

The existing frontend still runs with `npm run dev`, builds with `npm run build`, and reads the root `.env` values documented in [.env.example](.env.example). API code builds separately with `npm run build:api`.

## Database rollout

`supabase/migrations/` contains the API security and authentication-state migrations. `supabase/fixtures/legacy.sql` is a disposable test fixture, not a production migration. The cutover migration revokes direct browser access: apply the complete migration sequence to production only when the replacement frontend and API are ready to be released together. This branch does not deploy or change a live database.

## Validation

```sh
npm run generate
npm run typecheck
npm run lint
npm run build:api
npm run build
npm run test:integration
```

The integration runner creates disposable PostgreSQL containers, applies the fixture and migrations, verifies database permissions, and runs the API tests with real application and authentication roles. Plain `npm test` also runs the unit tests but skips cases requiring a test database. Docker is required for the integration runner.

Frontend integration and production hosting are separate increments. This branch does not include AWS Lambda packaging or a Vercel API proxy.
