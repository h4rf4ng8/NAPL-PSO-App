# NAPL

NAPL is a league application built with React, shadcn/ui and a Fastify API running on AWS Lambda. Apollo Server executes the API's fixed GraphQL reads; REST routes handle commands and other reads. The API reads and writes Supabase PostgreSQL data and uses Supabase Auth with Discord OAuth for sign-in.

## Table of Contents

- [System Architecture](#system-architecture)
- [Sequence Diagrams](#sequence-diagrams)
  - [Discord Sign-in](#discord-sign-in)
  - [Session Refresh](#session-refresh)
  - [League Reads](#league-reads)
  - [Match Import](#match-import)
  - [Match Review](#match-review)
  - [Roster Membership](#roster-membership)
  - [Season Schedule](#season-schedule)
  - [Voting](#voting)
- [Components](#components)
- [How It Works](#how-it-works)
  - [Sign-in and Permissions](#sign-in-and-permissions)
  - [Reading League Data](#reading-league-data)
  - [Updating League Data](#updating-league-data)
- [Browser Cache](#browser-cache)
- [Administrator Assignment History](#administrator-assignment-history)
- [What's not in this repo?](#whats-not-in-this-repo)
- [Local Development](#local-development)
- [Checks](#checks)
- [Production Deployment](#production-deployment)
  - [Prepare and Validate](#prepare-and-validate)
  - [Runtime Settings](#runtime-settings)
  - [Database Capacity](#database-capacity)
  - [GitHub Deployment Setup](#github-deployment-setup)
  - [Deploy the API](#deploy-the-api)
  - [Configure Vercel](#configure-vercel)
  - [Optional Staging Load Check](#optional-staging-load-check)
- [Rollout and Rollback](#rollout-and-rollback)

## System Architecture

![Browser, CloudFront, Lambda and Supabase architecture](docs/system-architecture.png)

League rules live in the API so every screen uses the same rankings and validation.

## Sequence Diagrams

Each diagram follows one happy path from an action to its successful result. Editable Mermaid sources are stored beside the PNGs in [docs](docs).

### Discord Sign-in

![Browser SDK Discord PKCE and API provisioning](docs/discord-sign-in.png)

The browser completes the callback before loading the account. Existing accounts can load without a Discord provider token; new provisioning verifies the provider identity. API access does not depend on Discord guild membership.

### Session Refresh

![Supabase browser SDK session refresh](docs/session-refresh.png)

The Supabase browser SDK persists, refreshes and synchronizes sessions across tabs. API requests obtain a token before sending. A definitive token-expiry response permits one shared SDK refresh and one retry; network failures and ambiguous write results are not replayed. Sign-out clears local credentials and cached identity even if server-side session revocation is unavailable.

### League Reads

![Successful league dashboard read sequence](docs/league-reads.png)

Opening the dashboard loads league data through the Lambda API and displays it. This path assumes the browser needs a fresh query. [Implementation](api/routes/graphql/index.ts#L73).

### Match Import

![Successful import of a new match sequence](docs/match-import.png)

An administrator imports a new match with every player mapped to an account. The API saves the match records and updated player statistics together. [Implementation](api/routes/matches/routes.ts).

### Match Review

![Successful approval of a pending match sequence](docs/match-review.png)

The retained submission API lets an administrator approve an existing pending submission. Player statistics, result news, and approval status are saved together. The browser's Import tab saves imported matches directly. [Implementation](api/routes/matches/routes.ts).

### Roster Membership

![Successful team invitation acceptance sequence](docs/roster-membership.png)

An eligible player accepts an invitation to an approved team. The API saves the roster, account assignment, and transfer history together. [Implementation](api/routes/teams/routes.ts).

### Season Schedule

![Atomic season schedule replacement sequence](docs/season-schedule.png)

An administrator confirms a generated schedule. The API validates it and replaces the season's schedule in one transaction. [Implementation](api/routes/content/routes.ts).

### Voting

![Team of the Week ballot validation and replacement sequence](docs/voting.png)

A member submits a valid ballot during an open voting period. The API checks the selections and saves the complete ballot together. [Implementation](api/routes/voting/routes.ts).

## Components

### Web Application

See the [web guide](web/README.md) for package internals and development commands.

The frontend uses checked-in New York components from **shadcn@2.3.0**, compatible with React 18 and Tailwind CSS 3, pinned to source commit `c8c4027b6b192822ea2952b225ee4760cddedf0d`. [Component provenance](web/src/components/ui/README.md) records the upstream license and project adaptations; the [UI architecture guide](web/README.md#ui-architecture) covers the pinned pnpm CLI, responsive behavior and maintenance. Radix supplies dialogs, menus and form interaction. The sidebar changes to a mobile sheet below 1024px, and administration changes from a section rail to a Select below 1280px. Light/dark preferences stay local to the browser. Rajdhani supplies interface text and Anton the ASL display lettering.

| Component | What it does |
| --- | --- |
| [web/src/features/](web/src/features/) | League screens, admin tools, domain models, commands, and typed query consumers. |
| [web/src/api/](web/src/api/) | Sends HTTP and GraphQL requests, caches reads, handles session refresh, and contains generated GraphQL types. |
| [web/src/auth/](web/src/auth/) | Starts Discord sign-in, loads the current account, and signs out. |
| [web/src/hooks/](web/src/hooks/) | Tracks loading, data, and errors while ignoring outdated request results. |
| [web/src/components/ui/](web/src/components/ui/) | shadcn/Radix primitives; feature components retain business state and API calls. |

The [UI overhaul design](docs/ui-overhaul.md) records component choices, per-tab and per-feature behavior, and verification evidence. Player tables and account selectors assemble up to 50 rows per display page while preserving the API's individual response limits and cursor ordering; see [UI architecture](web/README.md#ui-architecture).

### Lambda API

See the [API guide](api/README.md) for request handling, data access, and development commands.

| Component | What it does |
| --- | --- |
| [api/app.ts](api/app.ts) | Creates the Fastify app, registers routes, and applies authentication, authorization, request validation, and error handling. |
| [api/routes/](api/routes/) | Implements league queries and transactional commands for accounts, teams, matches, schedules, voting, and administration. |
| [api/plugins/](api/plugins/) | Configures Lambda execution, database connections, bearer verification, database permissions, and Supabase Auth and Discord identity clients. |

### Shared Contracts and Database

| Component | What it does |
| --- | --- |
| [pkgs/contracts/](pkgs/contracts/) | Shares validation schemas, domain types, positions, and formations between the web app and API. |
| [supabase/](supabase/) | Contains database migrations, the test fixture, local CLI configuration, and database inspection SQL. |

## How It Works

When the Lambda API starts, it loads its settings and prepares database access and Supabase signing-key verification and Discord identity lookup during provisioning. It then sets up the request handlers and permission checks used by the application. The [startup code](api/lambda.ts#L6) brings these pieces together.

### Sign-in and Permissions

When someone opens the app, it checks whether they are signed in. Visitors can browse the public pages; standings require sign-in and appear in the member dashboard. The app checks again when another browser tab reports a session change. The [main screen](web/src/App.tsx) controls this choice.

Choosing “Sign in with Discord” starts Supabase SDK OAuth with PKCE. The frontend handles `/auth/callback`, exchanges the code, and calls `POST /api/accounts/me` with the bearer access token and an available provider token. The API verifies the JWT, checks database roles, and provisions a missing league account from the verified Discord identity. Discord credentials remain in Supabase Dashboard. Guild membership is not an API access condition.

The [Supabase client](api/plugins/supabase/client.ts) verifies signature, issuer, audience and expiry from configured JWKS. The [request checks](api/app.ts) require bearer authentication for protected actions, load current roles from PostgreSQL, and enforce resource permissions. JWT verification does not perform a per-request database session lookup. Public account/team and public GraphQL operations allow anonymous callers; supplied bearer tokens must still validate. Browser role metadata and forwarded identity/IP headers are never authorization sources.

The browser SDK owns refresh coordination and cross-tab auth events. Logout clears browser session and Apollo data immediately; a departing session cannot retain access through an API cookie. Old `napl-*` cookies are ignored and can expire naturally.

### Reading League Data

The browser sends one of 21 allowlisted operation names and its variables to `POST /api/graphql`. The Lambda API selects the matching server-owned document; it never executes a query document supplied by the browser.

| Operation names | Used for |
| --- | --- |
| `LeagueOverview`, `HomeSummary`, `HomeNews` | Dashboard identity, league totals and filtered news. |
| `Leaderboard`, `PlayerCard`, `AccountCardPreviews` | Ranked players, selected player cards and card samples. |
| `TeamSummaries`, `TeamPlayers` | Visible team directories and roster cards. |
| `TeamStandings`, `TeamRecords` | Signed-in standings and aggregated match records. |
| `AccountMatches`, `AccountOpponents`, `AccountAwards`, `AccountChampionships` | Bounded account history and achievement views. |
| `Seasons`, `SeasonChampions` | Season choices and enriched champions. |
| `HallOfFame`, `DecoratedPlayers` | Award and decorated-player views. |
| `VotingCandidates` | Eligible player choices. |
| `ImportAccountMatches` | Administrator-only account lookup for match imports. |
| `DefaultPositionWeights` | Default ranking weights. |

For example, a signed-in standings request is `POST /api/graphql` with this body:

```json
{"operationName": "TeamStandings", "variables": {}}
```

The [query handler](api/routes/graphql/index.ts) accepts only known operation names and their expected variables, then executes the trusted document through Apollo Server with native CSRF prevention. It rejects client-supplied query text, unknown names, extensions, batch bodies and unexpected variables. Existing argument validation, authorization, response bounds and cursor checks still apply. TeamStandings and TeamRecords require sign-in; ImportAccountMatches requires administrator access.

Canonical selections and fragments live in [API operations](api/routes/graphql/operations/). The [existing generation script](web/scripts/codegen.ts) validates them against the API schema and creates both server execution documents and browser typed documents. The browser uses its documents for Apollo's types and normalized cache; the [transport](web/src/api/link.ts) sends only the operation name and variables. Generated server documents include the `__typename` fields needed by that cache.

The browser sends these reads and REST commands directly through [request handling](web/src/api/http.ts), with bearer authorization and credentials omitted. GraphQL reads send JSON and `Apollo-Require-Preflight: true`; Apollo retains native CSRF prevention. Fastify is the only CORS owner and permits the exact configured frontend origin. Bearer authentication and database permissions authorize protected writes; no signed CSRF cookie or `/auth` API routes remain.

Database access remains in the API:

- [Account fields](api/routes/accounts/schema.ts) return public profiles, rankings, and card statistics. Private current-account fields require an authenticated caller.
- [Team reads](api/routes/teams/queries.ts) filter teams by the caller's visibility.
- [Team records](api/routes/matches/records.ts) deduplicate imported match histories before aggregation.

Rankings use stored account statistics and configured position weights; card rows use season aggregates. The browser renders those results. Within a request, the API [reuses matching loads](api/routes/graphql/context.ts). Browser caching is described below.

### Updating League Data

When someone saves a change, the browser sends it to the API. The API checks their permissions and validates the submitted data before writing to the database. Related changes are saved together: they either all succeed or are rolled back. The [database implementation](api/plugins/db/client.ts#L10) also protects these writes from conflicting concurrent changes and gives each transaction a 15-second time limit.

Administrators enter match statistics through the [Import tab](web/src/features/admin/AdminPanel.tsx). A successful import follows four steps:

1. The administrator uploads a match export, selects the teams, and connects each exported player to a league account. The [file reader](web/src/features/matches/match-import.tsx) prepares the export for review.
2. After confirmation, the browser sends the match details, player mappings, team IDs, season, and any tackle corrections to the API. See [import submission](web/src/features/matches/match-import.tsx).
3. The API validates the import, adds the match to each mapped player's history, and recalculates their statistics. These account updates are saved together by the [import handler](api/routes/matches/routes.ts).
4. The app shows the match ID and import counts, then [reloads league data](web/src/features/admin/AdminPanel.tsx) so the updated results appear on screen.

Other league changes follow the same pattern of checking permissions, validating input, and saving related records together:

| Action and caller | Feature API → endpoint | Server implementation |
| --- | --- | --- |
| [TeamsView.respondInvitation](web/src/features/teams/teams-view.tsx) | [teams.respondInvitation](web/src/features/teams/api.ts) → `POST /api/teams/:id/invitation` | [registerTeams](api/routes/teams/routes.ts) records acceptance; for an approved team, [moveMember](api/routes/teams/routes.ts) updates the roster, account assignment, and transfer history. |
| [GenerateScheduleModal.handleGenerate](web/src/features/matches/schedule-setup.tsx) | [matches.replaceScheduledSeason](web/src/features/matches/api.ts) → `PUT /api/schedule/season/:season` | [registerContent](api/routes/content/routes.ts) validates `scheduleInput` rows and replaces the season's scheduled matches. Schedule generation itself happens in the browser. |
| [VotingTab](web/src/features/voting/VotingTab.tsx) | [voting.submitTotwVotes](web/src/features/voting/api.ts) → `PUT /api/voting/periods/:id/votes/me` | [registerVoting](api/routes/voting/routes.ts) validates `voteInput`, checks the voting window and candidates, and replaces the member's ballot. The corresponding `GET` reads only the caller's ballot. |

The [shared validation rules](pkgs/contracts/src/index.ts) define the accepted data for these commands. Manual submission and approval endpoints remain implemented and tested in the [API](api/routes/matches/routes.ts), including `POST /api/submissions/:id/approve`. Their unreachable browser forms have been removed. Imported matches are saved directly; they do not pass through manual approval.

After a successful change, the browser [clears cached query results and stops older queries still in progress](web/src/api/client.ts). Apollo refetches active GraphQL queries; REST screens keep their explicit reloads. Late responses cannot refill the cache with old data.

## Browser Cache

GraphQL screens use Apollo's React hooks and normalized `InMemoryCache` with `cache-first`. A complete cached result is reused without another request, and simultaneous identical queries share a request. Mounted screens subscribe to cache changes. Explicit refresh uses Apollo's `refetch()`; it does not permanently force later reads onto the network.

There is no custom 30-second expiry or 32-entry whole-cache wipe. Results stay in browser memory until invalidation, session clearing, or page reload. Changes made by another user appear after a refresh. REST-only screens retain their existing loading hooks.

Successful REST commands clear cached GraphQL reads, cancel older reads, and refetch active queries through Apollo's native lifecycle. Failed commands leave the cache intact. A failed refetch is shown as a read error and does not turn a completed write into a failed command. Named read requests do not invalidate the cache.

Session changes and logout clear the cache without refetching the departing user's queries. Public `Account` and private `CurrentAccount` remain separate cache types. The response link validates opaque domain data before passing it to Apollo; malformed data and partial GraphQL failures cannot become successful cached results. See the [client lifecycle](web/src/api/client.ts), [transport](web/src/api/link.ts), and [HTTP handling](web/src/api/http.ts).

The API's reuse of data within a single request ends with that request. It is independent of the browser cache.

Run frontend unit tests for cache reuse, explicit refetch, reactive updates, validation, command invalidation, cancellation, and session isolation:

```sh
pnpm --filter @napl/web test
```

The relevant checks are in the [cache tests](web/test/cache.test.ts), [client lifecycle tests](web/test/client.test.ts), and [GraphQL tests](web/test/graphql.test.ts).

See the [frontend hook/helper inventory](web/README.md) for the retained REST lifecycle and helper responsibilities.

## Administrator Assignment History

Only a verified super administrator can change the administrator list. The API checks that the selected accounts exist, removes repeated IDs, and compares the selection with the current list. Reordering the IDs or changing their capitalization still counts as the same selection and creates no history entry. This action changes administrator assignments while leaving super-administrator assignments intact. See the [assignment handler](api/routes/admin/routes.ts).

Every changed list records who made the change, when the database saved it, and the complete lists before and after the change. The actor comes from the verified session. The assignments and their history are saved together, so a failure to record the history also prevents the assignment change. Concurrent changes either save complete lists with matching history or return a conflict.

Apply the [assignment-history migration](supabase/migrations/202610140001_role_audit.sql) before deploying this API behavior. The API's database login can append history but cannot read, edit, delete, or clear it. Browser roles have no access. The migration owner can inspect the records directly. Deleting an account does not erase its history because the records are retained independently of the account.

The integration tests check permissions, unchanged selections, rollback, concurrent changes, and database access restrictions using disposable PostgreSQL databases. Run them with Node 24 and Docker:

```sh
pnpm run test:integration
```

See the [assignment tests](api/test/routes/admin-audit.test.ts) and [database permission tests](api/test/integration/role_audit.sql).

## What's not in this repo?

- **Hosted service implementations.** Supabase Auth and Discord OAuth run outside this application. The repository contains the [Supabase](api/plugins/supabase/client.ts) and [Discord](api/plugins/discord/client.ts) clients that call them.
- **A production database snapshot.** The [migrations](supabase/migrations/) extend an existing database baseline. The [test fixture](supabase/fixtures/legacy.sql) supports disposable integration databases; it is not a production backup.
- **Deployment secrets and provider setup.** Live database credentials and OAuth provider settings must be supplied separately. The [environment example](api/.env.example) lists required values, and [Production Deployment](#production-deployment) covers the external setup. The included [SAM template](api/template.yaml) provisions Lambda resources; it does not create the Supabase or Vercel projects.

## Local development

### Docker Compose

Use Docker, Node 24, and pnpm 10.15.1. Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run setup:env
```

`setup:env` creates private [`api/.env`](api/.env.example) and [`web/.env`](web/.env.example) from examples and preserves existing contents. Configure the API hosted Supabase/database values and the browser public settings before starting:

| Setting | Local development value |
| --- | --- |
| `NODE_ENV`, `PUBLIC_ORIGIN` | `development` and `http://localhost:5173`, with no trailing slash or path. |
| `DATABASE_URL` | The configured hosted PostgreSQL connection with the API's runtime permissions and `sslmode=verify-full&sslrootcert=prod-ca-2021.crt`. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Your hosted project's URL and publishable key. |
| `SUPABASE_JWKS_URL` | `https://PROJECT.supabase.co/auth/v1/.well-known/jwks.json` for that project. |
| `VITE_API_URL` (web) | `http://localhost:3000`, reachable by the browser. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (web) | The same hosted Supabase project URL and public key. |

Download the project's server root certificate from Supabase **Database Settings → SSL Configuration** to `api/prod-ca-2021.crt`, following the [SSL connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres#connecting-with-ssl). The relative `sslrootcert=prod-ca-2021.crt` path works from the native API's `api/` working directory; Compose mounts that file read-only at `/var/task/prod-ca-2021.crt`. Keep the downloaded certificate local.

Only `VITE_API_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` belong in the browser config. Keep all secrets out of `VITE_*`. Discord OAuth credentials remain in Supabase Dashboard. Local startup preserves saved app settings.

```sh
./scripts/dev.sh
```

Open **http://localhost:5173**. Compose starts only the web app, the local HTTP adapter, and the API in AWS's Node 24 Lambda container. The API uses the hosted Auth service and database configured in `api/.env`; Compose does not replace those settings. AWS credentials are not required for this local runtime. Pass `-d` to start in the background: `./scripts/dev.sh -d`.

**Local application actions use the real configured database.** Sign-in can provision a league account; authorized league changes write to that database. Startup does not create a database, apply migrations, or seed sample data. The configured database must already have the application's schema and runtime grants. Use the [disposable integration checks](#checks) when testing changes that should not touch hosted data.

| File | Responsibility |
| --- | --- |
| [`docker-compose.yml`](docker-compose.yml) | Connect services and start them in dependency order. |
| [`api/Dockerfile`](api/Dockerfile) | Package the API and run it in AWS's Lambda runtime image. The deployment SAM template remains in `api/template.yaml`. |
| [`web/Dockerfile`](web/Dockerfile) | Run the frontend with live reload. |
| [`supabase/`](supabase/) | Keep database migrations and disposable test fixtures. |
| [`scripts/dev.sh`](scripts/dev.sh) | Start and rebuild the local application containers. |

| Service | Local address | Purpose |
| --- | --- | --- |
| Web | `http://localhost:5173` | Browse the static app; it calls the API adapter directly. |
| API adapter | `http://localhost:3000` | Browser-reachable loopback Function URL adapter. |
| Lambda invocation | `http://localhost:9000/2015-03-31/functions/function/invocations` | Invoke the runtime with a Lambda event; browser requests use the adapter on port 3000. |

Open **`http://localhost:5173`** with the local `PUBLIC_ORIGIN` above. `http://127.0.0.1:5173` is a different browser origin; sign-in and GraphQL POST requests from it fail the API's exact-Origin check. Compose reads `PUBLIC_ORIGIN` from `api/.env`, so a production frontend origin must be changed explicitly for localhost development. All published ports bind only to your machine. The `api` service translates HTTP requests into Lambda Function URL events; the Lambda container executes the packaged API. AWS's Runtime Interface Emulator exercises that runtime and event handling, but does not reproduce AWS IAM authorization or scaling.

Settings persist in the ignored app `.env` files. Production CI receives its settings separately from GitHub secrets and variables.

If upgrading from the old Compose stack, run `docker compose --env-file api/.env down --remove-orphans` before starting it again. This removes the old database/Auth containers and frees their ports without deleting their saved volume. The new stack does not use that volume.

### Discord sign-in with Compose

Use the hosted project's [Discord provider settings](https://supabase.com/docs/guides/auth/social-login/auth-discord):

1. Keep the Discord application's redirect pointed at Supabase's hosted callback, normally `https://PROJECT.supabase.co/auth/v1/callback`. Enable Discord in Supabase Dashboard with that application's client ID and secret.
2. In Supabase Auth URL Configuration, add `http://localhost:5173/auth/callback**` to the [redirect allowlist](https://supabase.com/docs/guides/auth/redirect-urls). Keep existing production redirects and the production Site URL.
3. Set matching hosted Supabase URL and publishable key in `api/.env` and `web/.env`. Run `./scripts/dev.sh`, open `http://localhost:5173`, and choose **Sign in with Discord**.

Discord returns to hosted Supabase Auth, then the frontend's `/auth/callback`. The browser SDK completes PKCE and sends the bearer token to the local API for league-account provisioning. The API never receives OAuth client secrets, performs provider-token refresh, or checks a guild.

### Working with the containers

Edits under `web/src` reload in the browser. API code is packaged into the Lambda image; restarting an existing container does not update that code. Rebuild it after API changes:

```sh
./scripts/dev.sh -d lambda
```

Rebuild both images after shared-contract or dependency changes with `./scripts/dev.sh -d lambda web`. Changes to web files outside `web/src`, including Vite configuration, also require rebuilding the web image.

| Command | Purpose |
| --- | --- |
| `docker compose --env-file api/.env logs -f web api lambda` | Follow local application logs. Hosted Auth logs are in Supabase. |
| `docker compose --env-file api/.env down` | Stop and remove the application containers; hosted data and local environment files remain. |

### Native pnpm alternative

After configuring the same hosted settings above, you can run the web and API directly on your machine. Stop Compose first if it is using port 5173, then generate the code:

```sh
docker compose --env-file api/.env down
pnpm run generate
```

Run `pnpm run dev:api` and `pnpm run dev` in separate terminals. The API reads `api/.env` and uses its hosted database/Auth settings; Vite reads `web/.env`. The native API listens at `http://127.0.0.1:3000` by default.

Vite listens on `http://localhost:5173`. Set `VITE_API_URL=http://localhost:3000`; the browser calls that API address directly. Set matching public Supabase browser values in `web/.env`.

## Checks

```sh
pnpm run generate
pnpm run gql:check
pnpm run typecheck
pnpm run typecheck:browser
pnpm run check:dependencies
pnpm run lint
pnpm test
pnpm run build
pnpm --filter @napl/web exec playwright install chromium webkit
pnpm run test:browser
pnpm run test:integration
sam validate --lint --template-file api/template.yaml
```

The integration runner creates disposable PostgreSQL containers, applies fixtures and migrations, and runs the workspace tests, including authorization, schedule rollback/concurrency, server commands, GraphQL validation, session isolation, and theme behavior. It also checks the bundled Lambda package outside the repository. It does not modify live data. `pnpm run test:sam` additionally invokes the package through SAM's local container.

`pnpm run check` combines generation checks, application/browser type-checking, dependency boundaries, lint, unit tests, builds and browser tests. Database integration and SAM checks remain separate commands. The browser suite starts its own Vite server with synthetic API/auth data: no hosted credentials or database are needed. Its [eight projects](web/playwright.config.ts) exercise desktop/mobile Chromium and WebKit at 1440px and 390px, plus Chromium destination, administration, navigation and recovery checks at 320px, 768px, 1024px and 1280px. Tests include both themes, keyboard interaction, mutations and exact navigation breakpoint transitions. Reports, screenshots and retained failure traces are written to `web/playwright-report` and `web/test-results`; see the [browser guide](web/test/browser/README.md). Test commands document the workflow; the PR and [UI overhaul evidence](docs/ui-overhaul.md) record the current run results.

## Production deployment

Vercel serves the static frontend. Browsers call the Lambda Function URL directly; its `AuthType: NONE` permits requests to reach Fastify, where bearer authentication and database authorization protect private routes. There is no Vercel server function or invocation role.

The [deployment template](api/template.yaml) creates the Lambda function, its live version alias, execution permissions, a CloudWatch log group with 14-day retention, and public URL invocation permissions restricted to Function URL calls. Its defaults are Node 24 on ARM64, 512 MiB of memory, and a 60-second timeout. It uses the account's available concurrency unless a reservation is explicitly configured. Supabase and Vercel projects are set up separately. The template does not add a custom network, a separate content-delivery service, or pre-warmed Lambda capacity.

### Prepare and Validate

Use Node 24, pnpm 10.15.1, AWS credentials for the intended account, and SAM CLI 1.165.0 or later. Docker is required for the database integration tests and optional local Lambda invocation. Run commands from the repository root.

Install dependencies, then run the full set of [checks](#checks):

```sh
pnpm install --frozen-lockfile
```

The build produces the web assets and the Lambda package at `api/dist/api.zip`. The [packaging script](api/scripts/build.mjs) includes only the bundled handler and its package metadata in that ZIP. Integration tests exercise the Lambda package outside the repository against disposable PostgreSQL data. These steps do not deploy cloud resources.

To additionally invoke the packaged API in a local Lambda container, run:

```sh
pnpm run test:sam
```

### Runtime Settings

Start with the [environment example](api/.env.example). The setup command initializes both app files, preserves existing settings without generating session or origin secrets.

```sh
pnpm run setup:env
```

Supply production values through a protected local file or the deployment environment. Environment values take precedence over the local file when generating deployment parameters.

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | One Supabase PostgreSQL connection URL for league data, database roles, session checks and provisioning quotas. Its restricted runtime login must inherit `app_runtime` and `gateway_runtime`; use `sslmode=verify-full` in production. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Supabase project HTTPS URL, such as `https://PROJECT.supabase.co`, and authentication publishable key. |
| `SUPABASE_SECRET_KEY` | Required server-only key from the same Supabase project for Storage uploads, promotion and private signed URLs. Keep it out of browser config and Vercel. |
| `SUPABASE_JWKS_URL` | Full signing-key endpoint, usually `https://PROJECT.supabase.co/auth/v1/.well-known/jwks.json`. Used only to fetch keys; the issuer comes from the project Auth URL. |
| `PUBLIC_ORIGIN` | Exact HTTPS address of the public frontend, without a path or trailing slash. Configure allowed sign-in redirects for this frontend origin. |
| `DISCORD_TRANSFER_WEBHOOK` | Optional destination for roster notices. |
| `APPLICATION_ROLE_BOUNDARY_ARN` | Permissions boundary created by the deployment bootstrap, limiting the permissions of application roles. |

If production `DATABASE_URL` specifies `sslrootcert`, that certificate must be available at the configured path in the deployed runtime. The local Compose certificate mount does not supply it to a production deployment.

[SAM generates both required permissions](https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html): public `lambda:InvokeFunctionUrl` constrained to `NONE`, and `lambda:InvokeFunction` constrained by `InvokedViaFunctionUrl`. Never add unrestricted public InvokeFunction access. `FunctionUrlConfig.Cors` stays unset; Fastify alone sends exact-origin CORS for `Authorization`, `Content-Type`, `Apollo-Require-Preflight` and `Idempotency-Key`, exposes `Retry-After`, and does not allow credentials. AWS throttling or service errors outside Fastify may lack CORS; browsers must treat those as network failures and never replay writes.

### Database Capacity

League data and authentication state use the same `DATABASE_URL` and database login. Each Lambda environment has one database client limited to one connection. Ten active environments can therefore use roughly ten connections. Leave additional room for warm environments, overlapping releases, migrations, and other database users.

The template omits reserved concurrency by default. New AWS accounts can have a concurrency quota too small to support a reservation. Once the account permits it, set the template's `ReservedConcurrency` parameter to a positive limit that fits the database budget. Its default of `-1` means no reservation; `0` disables invocation. The account's shared quota can change, so it is not a permanent function-specific limit or spending cap.

Use the database provider's transaction pooler and choose Lambda concurrency to fit the actual connection budget. The defaults are starting settings, not measured capacity guarantees. The [application connection settings](api/plugins/db/client.ts#L23) define these limits.

Keep the previous release artifact, configuration, cookie keys and origin secret securely available for rollback; the new release does not consume those secrets.

### GitHub Deployment Setup

An AWS administrator creates the [deployment bootstrap](api/deploy-bootstrap.yaml) once. It creates GitHub federation, a private deployment bucket, a deployment role, and a CloudFormation execution role. A permissions boundary limits the application roles, and GitHub cannot modify the bootstrap through its deployment role. GitHub access starts disabled.

```sh
aws cloudformation deploy \
  --profile napl --region us-east-2 \
  --template-file api/deploy-bootstrap.yaml \
  --stack-name napl-deployment \
  --capabilities CAPABILITY_IAM
```

Configure the **Production** environment under GitHub **Settings → Environments** and store deployment values under **Settings → Secrets and variables → Actions** at repository scope:

1. Under **Deployment branches and tags**, select **Selected branches and tags** and allow only the **branch** named `main`. Do not add a tag rule or wildcard.
2. Add the repository secrets and variables below. Secrets belong in **Repository secrets**, not ordinary variables. The Production job inherits these repository settings.
3. Keep releases automatic; no required reviewer is needed for this workflow.

| Repository secret | Where to obtain it |
| --- | --- |
| `DATABASE_URL` | Supabase PostgreSQL connection for the restricted runtime login, with `sslmode=verify-full`. |
| `SUPABASE_SECRET_KEY` | Supabase project secret API key; required for production Storage. Never expose it through `VITE_*` or Vercel. |
| `DISCORD_TRANSFER_WEBHOOK` | Optional Discord webhook URL for roster notices. |

The database login requires both runtime role grants and the migrations described in [Runtime Settings](#runtime-settings) and [Rollout and Rollback](#rollout-and-rollback). Use a restricted runtime login rather than the database administrator account. The login supplies league access, role/session checks and provisioning quotas.

| Repository variable | Value or source |
| --- | --- |
| `AWS_REGION` | `us-east-2` |
| `AWS_DEPLOY_ROLE_ARN` | Bootstrap stack output `GitHubDeployRoleArn`. |
| `AWS_CLOUDFORMATION_ROLE_ARN` | Bootstrap stack output `CloudFormationExecutionRoleArn`. |
| `AWS_DEPLOYMENT_BUCKET` | Bootstrap stack output `DeploymentBucket`. |
| `APPLICATION_ROLE_BOUNDARY_ARN` | Bootstrap stack output `ApplicationRoleBoundaryArn`. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Supabase project URL and publishable API key. |
| `SUPABASE_JWKS_URL` | Supabase signing-key endpoint: `https://PROJECT.supabase.co/auth/v1/.well-known/jwks.json`. |
| `PUBLIC_ORIGIN` | Public website's exact HTTPS origin. |

After verifying that GitHub's environment allows only the `main` branch, the AWS administrator enables the deployment role:

```sh
aws cloudformation deploy \
  --profile napl --region us-east-2 \
  --template-file api/deploy-bootstrap.yaml \
  --stack-name napl-deployment \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides EnableGitHubDeployment=true
```

The role accepts only this repository's `Production` environment identity. GitHub exchanges that identity for temporary AWS credentials on each deployment. Keep the branch restriction in place: an environment identity does not itself identify the branch. No permanent AWS access key belongs in GitHub.

### Deploy the API

The [CI/CD workflow](.github/workflows/ci-cd.yml) runs once per push. Its summary shows four sequential jobs: **Lint → Test → Build → Deploy**. Each job starts only after the preceding job succeeds, and Deploy runs only for pushes to `main`. Prepare the production configuration before merging the deployment changes into `main`.

| Stage | What happens |
| --- | --- |
| Lint | Run ESLint with zero warnings allowed, generate Prisma, check GraphQL freshness, type-check workspaces and browser fixtures, check dependency boundaries, and validate both SAM templates. Each operation has its own named step and log entry. |
| Test | Run API and web tests against disposable PostgreSQL, install Chromium/WebKit, then run the eight-project responsive UI/accessibility suite with synthetic transport. Upload browser reports and traces even when checks fail. |
| Build | Generate the build's Prisma client, build shared contracts, bundle Lambda, and build the static frontend in separate ordered steps. Verify the finished Lambda ZIP outside the repository against disposable PostgreSQL. On `main`, upload that exact tested ZIP and template for deployment. |
| Deploy | Download the tested artifact without rebuilding it, validate production configuration, confirm that the commit is still current on `main`, obtain temporary credentials, and update the `napl-api` stack in Ohio. Inspect the live URL configuration and bounded permissions, then check public database reads, protected anonymous rejection, allowed preflight and rejected-origin CORS through that URL. Clean up deployment parameter files even on failure. Deployments run one at a time. |

The [parameter generator](api/scripts/sam-env.mjs) validates production settings, checks Lambda's 4 KiB environment limit, and writes a protected parameter file. The workflow removes its secret files after each run; they are never deployment artifacts. Avoid SAM debug logging because it can reveal parameters.

A new Lambda version becomes active through the `live` alias. CloudFormation normally rolls back a failed infrastructure update. A failed smoke check after deployment marks the workflow failed but does not undo that release; revert the change on `main` and let the workflow deploy a compatible revision. Retain the previous release configuration for rollback.

The smoke check verifies access to league data. It does not verify real Discord sign-in, SDK refresh or authenticated authorization. Complete those checks through the website after configuring Vercel. The workflow does not run production migrations or coordinate Vercel's separate deployment process.

### Configure Vercel

Deploy the API with its production Storage key before releasing the frontend that uses native Storage uploads. The GitHub workflow and Vercel deploy independently; wait for the API deployment and smoke checks to pass before releasing the matching frontend.

Set Vercel's project root to `web`, allow access to the workspace's shared packages, and use Node 24 for builds. [vercel.json](web/vercel.json) builds static assets and serves SPA fallback routes, including `/auth/callback`.

Set these public **build-time** values in Vercel before rebuilding:

| Vercel setting | Source |
| --- | --- |
| `VITE_API_URL` | SAM `FunctionUrl` output. |
| `VITE_SUPABASE_URL` | Hosted Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Hosted Supabase publishable key. |

Set the production frontend's exact origin in the API `PUBLIC_ORIGIN`, and add its `/auth/callback` URL to Supabase's redirect allowlist. Configure Discord client credentials only in Supabase Dashboard. No AWS role, AWS region, API origin secret or database secret belongs in Vercel. Preview sites require a separately configured API origin/project; production CORS permits only its exact origin. CI's frontend build validates compilation with public test values; Vercel must rebuild using production values.

### Optional Staging Load Check

The [load runner](api/test/load/run-staging.mjs) measures signed-in standings reads against an explicitly selected staging environment. Use an isolated staging project and database with their own invocation permissions. A Vercel preview hostname alone does not establish that an environment is isolated from production.

```sh
pnpm run test:load --help
```

| Setting | Requirement or purpose |
| --- | --- |
| `LOAD_STAGE` | Required; must be `staging`. |
| `LOAD_BASE_URL` | Required HTTPS isolated staging API URL accepted by the runner. Verify that it points to the isolated staging system. |
| `LOAD_DB_CONNECTION_BUDGET` | Required positive database connection budget, recorded in the report. |
| `LOAD_ROUNDS` | Optional; between 1 and 5 rounds. |
| `LOAD_LAMBDA_RESERVED_CONCURRENCY` | Optional concurrency setting recorded in the report. |
| `LOAD_ACCESS_TOKEN` | Required authenticated staging bearer access token; standings reads require sign-in. |
| `LOAD_TIMEOUT_MS` | Optional request timeout, between 1,000 and 60,000 milliseconds. |
| `LOAD_REPORT` | Optional report location; reports default to the temporary directory at `/tmp`. |
| `LOAD_MEASUREMENTS_FILE` | Optional file containing independently collected Lambda and database measurements. |

The runner issues bearer-authenticated standings reads in successive groups of 20, 50, 100, and 200 simultaneous requests. One to five rounds produce 370–1,850 reads. Requests are not retried. The declared connection budget is recorded rather than enforced, and the runner does not change infrastructure. Measurements that were not supplied remain unknown.

This check is optional, is separate from continuous integration, and must target staging. Historical container measurements do not establish Lambda capacity.

## Rollout and Rollback

Use a clean cutover because cookie-authenticated clients cannot call the new bearer-only API:

1. Put the frontend into maintenance and preserve the previous tested API/static artifacts and configuration. Confirm Supabase Discord provider, frontend redirect allowlist and new public browser build values.
2. Deploy the API with `AuthType: NONE`, run URL/config/permissions/CORS smokes, and verify protected anonymous rejection. Keep the bootstrap's legacy Vercel role/OIDC management permissions: CloudFormation still needs them to delete old application-stack resources. Keep an externally owned reused provider.
3. Build and release the static frontend with the new `VITE_*` values. Verify the frontend callback/PKCE flow, one fresh sign-in, account loading, role-restricted reads and writes, token refresh, cross-tab logout, and public reads through the direct URL.
4. Reopen only after those checks pass. Old cookies are ignored and expire naturally. After the rollback window closes, separately prune obsolete bootstrap role/provider permissions and retained legacy deployment secrets.

This application cutover has no database migration. Keep obsolete auth tables/functions for rollback. Do not run migrations or change hosted data as part of local validation. Existing schema-installation history below remains independent of this release.

The replacement project's normalized league schema is `asl`; `auth_gateway` stays separate. Rehearse the captured baseline with `bash api/test/integration/asl-migration-replay.sh <disposable-postgres-container>`. The production baseline is a protected backup, not either repository fixture. The local Supabase configuration and integration runner use PostgreSQL 17.

For the reviewed replacement project, `node supabase/rollout.mjs <protected-manifest.json> --plan <protected-output.sql>` prepares the exact transaction without connecting. The manifest supplies `project_ref`, verified `account_aliases`, explicitly reviewed `excluded_team_ids` and `excluded_vote_ids`, and `initial_admin_ids`. Review the generated SQL and migration hashes before running `cd api` followed by `node --env-file=.env ../supabase/rollout.mjs ../secrets/asl-migration/replacement-rollout-manifest.json --execute` with the administrator connection in `ROLLOUT_DATABASE_URL` or `DATABASE_URL`. Run from `api/` so a relative `sslrootcert=prod-ca-2021.crt` resolves to the existing certificate. Keep the captured backup, manifest, and reviewed SQL under ignored `secrets/asl-migration/` with directory mode `0700` and file mode `0600`. This runner accepts only the replacement project's direct Supabase endpoint or its project-qualified Supabase pooler login. `--rehearse` accepts localhost only.

The transaction applies gateway, RBAC, role audit, auth state, then normalized `asl`; it deliberately skips `202610130002_cutover.sql`, which deletes legacy settings. History records only the five migrations actually applied. It preserves every existing public row, retains excluded test records only in the recovery copy, resolves the legacy administrator list to the reviewed IDs with the `admin` role, verifies scalar and UUID parity, and revokes legacy public table/function access from browser and runtime roles. The source tables are locked against concurrent writes during the copy; a conflict or parity failure aborts the transaction. Never run a later blanket `supabase db push` that would apply the intentionally skipped legacy cutover; reconcile that historical gap explicitly during a future migration cleanup.

Before deploying the API, configure a restricted database login inheriting `app_runtime` and `gateway_runtime` as described above. Schema installation does not create login credentials or change the API environment. The administrator connection used for migration retains administrative privileges. Rollback before application writes can switch the application back to the preserved public snapshot after restoring reviewed legacy runtime grants; a code revert alone does not restore those revoked privileges; after writes begin in `asl`, reconcile those changes before switching back.

### Audited legacy refresh

`supabase/merge-source.mjs` is a one-time merge for the reviewed source and replacement projects. It compares source `public`, destination recovery `public`, and live `asl`. Audit mode only reads databases; it writes protected snapshots, findings, and an exact plan outside the repository. It preserves destination edits, roles, Storage, recovery rows, and excluded test records. Suspicious changes remain withheld. Historical totals and match histories are preserved independently and conflicting changes to either are held together.

Run from `api/`, using administrator connections in `SOURCE_DATABASE_URL` and `DATABASE_URL`, with a PostgreSQL 17 `pg_dump` available:

```sh
node --env-file=.env ../supabase/merge-source.mjs audit /protected/new-audit-directory ../secrets/asl-migration/replacement-rollout-manifest.json
MERGE_TEST_DATABASE_URL=postgresql://postgres:local-only@127.0.0.1:5432/empty_rehearsal node ../supabase/merge-rehearse.mjs /protected/new-audit-directory
node --env-file=.env ../supabase/merge-source.mjs apply /protected/new-audit-directory
```

Review `plan.json` and the security inventories before apply. Rehearsal requires an empty localhost database and rolls back all changes. Apply creates full backups, blocks concurrent league writes with table locks, checks snapshot/security fingerprints, and commits only after parity checks. It then revokes legacy browser and service-role table, sequence, and function access. Imported Discord identities keep their UUIDs and require fresh sign-in; passwords, sessions, tokens, and source privileges are not copied. Keep the receipts and backups protected. An attempted apply reserves its directory so retries cannot overwrite backups; use a new audit directory after resolving a failed attempt. If `destination-committed.json` exists without `applied.json`, inspect the destination and source retirement state before retrying. Reopening writes ends the simple backup-restore rollback window.

After rollout, check public pages, anonymous standings rejection, signed-in standings, sign-in, session renewal, sign-out, and an authorized change through the frontend's public address. Watch Lambda errors, throttling, request duration, and database connections. A direct anonymous public read should succeed, and protected routes must reject absent or invalid bearer credentials.

To roll back application code, enter maintenance, restore the previous API artifact and its IAM URL/role configuration, then restore its compatible proxy frontend and secrets. Recheck the old flow before reopening; retained database auth tables permit this rollback. A code rollback does not undo database migrations, so the older application must still work with the current database.
