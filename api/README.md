# Lambda API

The NAPL API serves league data, applies changes, and verifies Supabase bearer identities and provisions league accounts from Discord identity. It runs the same Fastify application locally and on AWS Lambda, with league data, roles, active-session checks and provisioning quotas stored in Supabase PostgreSQL.

See the root README for the [system architecture](../README.md#system-architecture) and [workflow diagrams](../README.md#sequence-diagrams).

## Table of Contents

- [Components](#components)
- [How It Works](#how-it-works)
  - [Handling Requests](#handling-requests)
  - [Reading League Data](#reading-league-data)
  - [Saving Changes](#saving-changes)
  - [Sign-in and Sessions](#sign-in-and-sessions)
- [Running Locally](#running-locally)
- [Checks](#checks)
- [Related Documentation](#related-documentation)

## Components

| Component | What it does |
| --- | --- |
| [lambda.ts](lambda.ts) and [dev.ts](dev.ts) | Start the application as a Lambda handler or a local HTTP server. The Lambda entry point uses [createHandler()](plugins/lambda.ts) to adapt incoming events to Fastify. |
| [createApp()](app.ts) | Registers routes and applies request, bearer authentication, permission, CORS and error handling. |
| [createRuntime()](plugins/runtime.ts) | Connects the application to PostgreSQL, Supabase Auth, and Discord, then supplies those dependencies to the app. |
| [GraphQL routes](routes/graphql/) | Validate parameters and execute fixed server-owned reads. The schema combines fields defined by each league area. |
| [League routes](routes/) | Keep request validation, authorization, and HTTP handling in each feature’s `routes.ts`, database operations in `queries.ts`, and response mapping in `dto.ts`. |
| [Database and connectDatabase()](plugins/db/client.ts) | Expose typed Prisma models, parameterized SQL, and Serializable transactions. [Record utilities](plugins/db/records.ts) normalize historical JSON and dates and preserve UUID text matching. |
| [SupabaseClient](plugins/supabase/client.ts) | Verifies bearer JWTs from configured JWKS and fetches the authoritative Supabase user during provisioning. |
| [DiscordClient](plugins/discord/client.ts) | Verifies the provider identity for account provisioning. |
| [PostgresAuthStore](plugins/session/pg-store.ts) and [RateLimiter](plugins/limits/auth.ts) | Apply bounded provisioning quotas across API instances. |
| [request helpers](plugins/request.ts) | Trust Lambda event source IP or the native socket address, never forwarding headers. |

## How It Works

### Handling Requests

Both entry points load settings, prepare one database connection pool and bearer verification, and build the Fastify app. Public reads remain anonymous. Protected routes require native Supabase JWT signature, expiry, issuer, audience and session_id validation; authorization uses current database roles. Browser cookies and role metadata are not authorization sources.

Fastify alone supplies exact-origin CORS, including errors and preflight. Requests use `Authorization: Bearer ...`, omit browser credentials and retain Apollo's native GraphQL CSRF prevention. There are no API `/auth/*` routes or signed CSRF tokens.

### Reading League Data

Each GraphQL operation has a named POST endpoint, such as `/api/standings` or `/api/dashboard`. The [shared endpoint list](../pkgs/contracts/src/index.ts) keeps browser routing and API registration aligned. The [handler](routes/graphql/index.ts) accepts a strict `{variables: ...}` body and selects the fixed server-owned document assigned to that URL. It rejects query text, operation names, extensions, batch bodies, and unexpected variables. Existing argument validation and field authorization remain in force. `/api/graphql` is not registered; league changes use REST endpoints.

`/api/standings` and `/api/team-records` require a verified bearer identity and an active database session. Anonymous requests are rejected before database reads. Public account and team REST reads and the other public GraphQL operations remain available without sign-in; the dashboard retains its existing private-field authorization.

Apollo Server executes these fixed documents and owns variable coercion and native CSRF prevention. JSON requests pass Apollo's CSRF check; simple browser requests need a nonempty `Apollo-Require-Preflight` or `X-Apollo-Operation-Name` header. Browser access requires the exact configured CORS origin. GraphQL and REST use bearer authorization; no signed CSRF cookies/tokens remain. The server receives the original HTTP headers and starts and stops with Fastify. It exposes no landing page, persisted queries, or Apollo reporting.

| Component | What it does |
| --- | --- |
| [Account fields](routes/accounts/schema.ts) | Serve player summaries, API-computed rankings and card-stat season rows, paginated match history, opponent records, and the current account, with permissions applied to private data. Rankings use stored account statistics and configured position weights; card rows use season aggregates from stored match history. |
| [Team fields](routes/teams/schema.ts) | Return the teams the caller is allowed to see. |
| [Match fields](routes/matches/schema.ts) | Return team records calculated from imported player match histories. |
| [read()](routes/graphql/context.ts) | Reuses matching loads within one query request and converts database errors into GraphQL errors. |

The API owns named queries such as [Standings and MemberLeagueData](routes/graphql/operations/league.graphql). The existing generator produces trusted server documents and browser typed documents from these same sources, including Apollo cache metadata. The [root query walkthrough](../README.md#reading-league-data) connects those queries to their screens and API field definitions. Some screens also use the REST read routes alongside GraphQL.

### Saving Changes

REST handlers check permissions and validate submitted data with Zod. Shared command schemas live in [the contracts package](../pkgs/contracts/src/index.ts); some handlers define their input schemas locally.

Account and team write routes enforce name and team-tag rules on the server. These checks apply to new or edited values; they do not rewrite existing stored names. OAuth provisioning uses a safe fallback when a provider username is disallowed, and the documented administrator username bypass remains available for intentional moderation changes.

For example, the [match import handler](routes/matches/index.ts#L147) handles `POST /api/import-match`. It validates the imported match, locks mapped player accounts, adds match records, and recalculates player statistics. These account changes commit together before the API returns the match ID and import counts.

Related writes [run in transactions](plugins/db/client.ts) that protect against conflicting concurrent changes and have a 15-second timeout. A failed transaction rolls back its changes. League data, authorization and provisioning quotas share the database login configured by `DATABASE_URL`. That login needs both sets of runtime permissions described in [Runtime Settings](../README.md#runtime-settings). The [root command walkthrough](../README.md#updating-league-data) covers the other core workflows.

### Sign-in and Sessions

The browser Supabase SDK owns Discord OAuth, callback PKCE exchange, persistence, refresh, logout and cross-tab synchronization. `POST /api/users/me` receives the access token and optional provider token, verifies the authoritative Discord identity, and provisions a missing league account. Existing accounts do not need a provider token for loading. Native JWT validation and current database roles remain authoritative, and provider identity mismatch is rejected. Guild membership and Discord-token refresh are not API access requirements.

Provisioning admission uses database quotas by trusted IP, user, session and global limit. Repeated failures cannot bypass those limits by changing forwarded IP headers. See [account routes](routes/accounts/routes.ts), [runtime](plugins/runtime.ts), and [request checks](app.ts).

## Running Locally

Complete the [initial setup](../README.md#docker-compose): install dependencies, run `pnpm run setup:env`, configure the hosted Supabase/database settings in `api/.env` and public browser settings in `web/.env`, then start `./scripts/dev.sh` from the repository root. The [API Dockerfile](Dockerfile) runs the packaged API inside AWS's Node 24 Lambda container. Compose reads the API environment without replacing its hosted service settings; it starts no database or Auth service and applies no migrations or seed data. Local application actions use the real configured database.

Set `NODE_ENV=development` and `PUBLIC_ORIGIN=http://localhost:5173`, without a trailing slash, and open that exact browser origin. The browser calls the loopback port 3000 exposed by the [local Lambda adapter](scripts/lambda-url.mjs). Follow the [hosted Discord setup](../README.md#discord-sign-in-with-compose) to allow the local callback in Supabase. Discord OAuth credentials belong only in Supabase Dashboard.

Download the Supabase database CA to `api/prod-ca-2021.crt` and set `DATABASE_URL` to use `sslmode=verify-full&sslrootcert=prod-ca-2021.crt`, as described in [initial setup](../README.md#docker-compose). Native development resolves this path from `api/`; Compose mounts the same certificate in the Lambda working directory.

After API changes, rebuild the Lambda container from the repository root:

```sh
./scripts/dev.sh -d lambda
```

For the **native pnpm alternative**, complete the [native setup](../README.md#native-pnpm-alternative), including generated code and the settings in the [API environment example](.env.example). Then run:

```sh
pnpm run dev:api
```

The development command reads `api/.env` and watches the API source; it does not generate or change keys. The default listener is `http://127.0.0.1:3000`; `HOST` and `PORT` can override it. Run the web app in another terminal with `VITE_API_URL=http://localhost:3000`.

## Checks

After initial setup, run these commands from the repository root:

| Command | Purpose |
| --- | --- |
| `pnpm --filter @napl/api run typecheck` | Check API TypeScript. |
| `pnpm --filter @napl/api run test:db` | Run API tests against a disposable PostgreSQL database. |
| `pnpm --filter @napl/api run build` | Build the Lambda package. |

The database test command requires Docker. It builds the contracts and API, creates a disposable PostgreSQL database, applies fixtures and migrations, and runs the API tests. The build produces `api/dist/api.zip` for Lambda. The root [checks](../README.md#checks) also cover frontend integration, GraphQL generation, and the packaged handler outside the repository.

## Related Documentation

- [Production deployment and runtime settings](../README.md#production-deployment)
- [Rollout and rollback](../README.md#rollout-and-rollback)
- [Browser cache behavior](../README.md#browser-cache)
- [Administrator assignment history](../README.md#administrator-assignment-history)
