# Lambda API

The NAPL API serves league data, applies changes, and manages sign-in through Supabase Auth and Discord. It runs the same Fastify application locally and on AWS Lambda, with league data and authentication state stored in Supabase PostgreSQL.

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
| [createApp()](app.ts) | Registers routes and applies request, session, permission, and error handling. |
| [createRuntime()](plugins/runtime.ts) | Connects the application to PostgreSQL, Supabase Auth, and Discord, then supplies those dependencies to the app. |
| [GraphQL routes](routes/graphql/) | Validate and execute read queries. The schema combines fields defined by each league area. |
| [League routes](routes/) | Keep request validation, authorization, and HTTP handling in each feature’s `routes.ts`, database operations in `queries.ts`, and response mapping in `dto.ts`. |
| [Database and connectDatabase()](plugins/db/client.ts) | Expose typed Prisma models, parameterized SQL, and Serializable transactions. [Record utilities](plugins/db/records.ts) normalize historical JSON and dates and preserve UUID text matching. |
| [createSession()](plugins/auth/session.ts) and [SessionRefresher](plugins/session/refresh.ts) | Handle sign-in, session renewal, sign-out, and checks on API requests. |
| [SupabaseClient](plugins/supabase/client.ts) and [DiscordClient](plugins/discord/client.ts) | Exchange and verify credentials, renew provider sessions, and check Discord identity and guild membership. |
| [PostgresAuthStore](plugins/session/pg-store.ts) and [PostgresMembershipStore](plugins/membership/store.ts) | Persist login replay protection, request quotas, refresh coordination, and membership eligibility. |
| [CookieCrypto](plugins/session/crypto.ts) and [RateLimiter](plugins/limits/auth.ts) | Protect cookies and request tokens, and apply authentication request quotas. |
| [Shared contracts](../pkgs/contracts/src/) and [database migrations](../supabase/migrations/) | Define accepted command data and the database structures and permissions used by the API. |

## How It Works

### Handling Requests

Both entry points load settings, prepare database and provider access, and build the Fastify application. The app checks the shared origin secret before handling a request. For API routes, it verifies the session cookie and checks the membership and role requirements of the requested action. Public routes can serve visitors without a session.

Requests that use methods such as POST or PUT also need protection against forged browser requests, including GraphQL reads sent by POST. The app returns structured errors for invalid input, missing permissions, conflicting changes, and unavailable dependencies. These checks live in [app.ts](app.ts) and [session handling](plugins/auth/session.ts).

### Reading League Data

The browser sends GraphQL queries to `POST /api/graphql`. The [query handler](routes/graphql/index.ts) accepts one query, checks its size and complexity, validates its fields, and executes it against the [schema](routes/graphql/schema.ts). GraphQL mutations and subscriptions are not supported; league changes use REST endpoints.

| Component | What it does |
| --- | --- |
| [Account fields](routes/accounts/schema.ts) | Serve player summaries, API-computed rankings and card-stat season rows, paginated match history, opponent records, and the current account, with permissions applied to private data. Rankings use stored account statistics and configured position weights; card rows use season aggregates from stored match history. |
| [Team fields](routes/teams/schema.ts) | Return the teams the caller is allowed to see. |
| [Match fields](routes/matches/schema.ts) | Return team records calculated from imported player match histories. |
| [read()](routes/graphql/context.ts) | Reuses matching loads within one query request and converts database errors into GraphQL errors. |

The frontend owns named queries such as [PublicLeagueData and MemberLeagueData](../web/src/features/dashboard/league.graphql). The [root query walkthrough](../README.md#reading-league-data) connects those queries to their screens and API field definitions. Some screens also use the REST read routes alongside GraphQL.

### Saving Changes

REST handlers check permissions and validate submitted data with Zod. Shared command schemas live in [the contracts package](../pkgs/contracts/src/index.ts); some handlers define their input schemas locally.

Account and team write routes enforce name and team-tag rules on the server. These checks apply to new or edited values; they do not rewrite existing stored names. OAuth provisioning uses a safe fallback when a provider username is disallowed, and the documented administrator username bypass remains available for intentional moderation changes.

For example, the [match import handler](routes/matches/index.ts#L147) handles `POST /api/import-match`. It validates the imported match, locks mapped player accounts, adds match records, and recalculates player statistics. These account changes commit together before the API returns the match ID and import counts.

Related writes [run in transactions](plugins/db/client.ts) that protect against conflicting concurrent changes and have a 15-second timeout. A failed transaction rolls back its changes. League data and authentication state share the database login configured by `DATABASE_URL`. That login needs both sets of runtime permissions described in [Runtime Settings](../README.md#runtime-settings). The [root command walkthrough](../README.md#updating-league-data) covers the other core workflows.

### Sign-in and Sessions

The authentication routes begin Discord sign-in through Supabase Auth. On the callback, the API verifies the identity and guild membership, provisions the league account, and sets session cookies. Later requests use the access cookie to identify the caller.

Session renewal coordinates through PostgreSQL so API instances can share refresh results. The API renews provider credentials and membership eligibility as needed, then returns updated cookies. See the [sign-in and permissions walkthrough](../README.md#sign-in-and-permissions) for the participating classes and their callers.

## Running Locally

Complete the [initial setup](../README.md#docker-compose): install dependencies, run `pnpm run setup:env`, then start `./scripts/dev.sh` from the repository root. The [API Dockerfile](Dockerfile) runs the packaged API inside AWS's Node 24 Lambda container, alongside local PostgreSQL, Supabase Auth, and the web app. Open `http://localhost:5173`; the web proxy sends requests through the [local Lambda adapter](scripts/lambda-url.mjs). Follow the [Discord setup](../README.md#discord-sign-in-with-compose) to test real sign-in.

After API changes, rebuild the Lambda container from the repository root:

```sh
./scripts/dev.sh -d lambda
```

For the **native pnpm alternative**, complete the [native setup](../README.md#native-pnpm-alternative), including generated code and the settings in the [API environment example](.env.example). Then run:

```sh
pnpm run dev:api
```

The development command reads `api/.env` and watches the API source; it does not generate or change keys. The default listener is `http://127.0.0.1:3000`; `HOST` and `PORT` can override it. Run the web app in another terminal so its development proxy supplies the API's origin secret and client address.

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
