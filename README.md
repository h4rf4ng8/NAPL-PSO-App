# NAPL

NAPL is a league application built with React and a Fastify API running on AWS Lambda. The API reads and writes Supabase PostgreSQL data and uses Supabase Auth with Discord OAuth for sign-in.

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
  - [Session Keys](#session-keys)
  - [GitHub Deployment Setup](#github-deployment-setup)
  - [Deploy the API](#deploy-the-api)
  - [Configure Vercel](#configure-vercel)
  - [Optional Staging Load Check](#optional-staging-load-check)
- [Rollout and Rollback](#rollout-and-rollback)

## System Architecture

![System architecture: User, Lambda API, Supabase PostgreSQL, Supabase Auth, and Discord](docs/system-architecture.png)

The user sends requests to the Lambda API, which owns validation, permissions, and league operations. Supabase stores league data and authentication state; Supabase Auth handles Discord sign-in. There is no shared Redis. OAuth browser redirects are shown in the sign-in sequence below.

Implementation: [`createRuntime`](api/plugins/runtime.ts), [`createApp`](api/app.ts), [Supabase Auth client](api/plugins/supabase/client.ts), and [Discord client](api/plugins/discord/client.ts).

## Sequence Diagrams

Each diagram follows one happy path from an action to its successful result. Editable Mermaid sources are stored beside the PNGs in [docs](docs).

### Discord Sign-in

![Discord sign-in and account provisioning sequence](docs/discord-sign-in.png)

Supabase Auth brokers Discord OAuth. The Lambda API verifies the returned identity, checks guild membership, and provisions the league account before setting session cookies. [Implementation](api/plugins/auth/session.ts#L110).

### Session Refresh

![Successful session renewal sequence](docs/session-refresh.png)

An expired access token is renewed through Supabase Auth, and the API returns updated session cookies. This path assumes membership is still current and this request owns the refresh. [Implementation](api/plugins/session/refresh.ts#L31).

### League Reads

![Successful league dashboard read sequence](docs/league-reads.png)

Opening the dashboard loads league data through the Lambda API and displays it. This path assumes the browser needs a fresh query. [Implementation](api/routes/graphql/index.ts#L73).

### Match Import

![Successful import of a new match sequence](docs/match-import.png)

An administrator imports a new match with every player mapped to an account. The API saves the match records and updated player statistics together. [Implementation](api/routes/matches/index.ts#L147).

### Match Review

![Successful approval of a pending match sequence](docs/match-review.png)

An administrator approves an existing pending submission. Player statistics, result news, and approval status are saved together. [Implementation](api/routes/matches/index.ts#L39).

### Roster Membership

![Successful team invitation acceptance sequence](docs/roster-membership.png)

An eligible player accepts an invitation to an approved team. The API saves the roster, account assignment, and transfer history together. [Implementation](api/routes/teams/index.ts#L17).

### Season Schedule

![Atomic season schedule replacement sequence](docs/season-schedule.png)

An administrator confirms a generated schedule. The API validates it and replaces the season's schedule in one transaction. [Implementation](api/routes/content/index.ts#L157).

### Voting

![Team of the Week ballot validation and replacement sequence](docs/voting.png)

A member submits a valid ballot during an open voting period. The API checks the selections and saves the complete ballot together. [Implementation](api/routes/voting/index.ts#L57).

## Components

### Web Application

See the [web guide](web/README.md) for package internals and development commands.

| Component | What it does |
| --- | --- |
| [web/src/features/](web/src/features/) | League screens, admin tools, domain models, commands, and GraphQL selections. |
| [web/src/api/](web/src/api/) | Sends HTTP and GraphQL requests, caches reads, handles session refresh, and contains generated GraphQL types. |
| [web/src/auth/](web/src/auth/) | Starts Discord sign-in, loads the current account, and signs out. |
| [web/src/hooks/](web/src/hooks/) | Tracks loading, data, and errors while ignoring outdated request results. |

### Lambda API

See the [API guide](api/README.md) for request handling, data access, and development commands.

| Component | What it does |
| --- | --- |
| [api/app.ts](api/app.ts) | Creates the Fastify app, registers routes, and applies authentication, authorization, request validation, and error handling. |
| [api/routes/](api/routes/) | Implements league queries and transactional commands for accounts, teams, matches, schedules, voting, and administration. |
| [api/plugins/](api/plugins/) | Configures Lambda execution, database connections, session cookies and refresh, and Supabase Auth and Discord clients. |

### Shared Contracts and Database

| Component | What it does |
| --- | --- |
| [pkgs/contracts/](pkgs/contracts/) | Shares validation schemas, domain types, positions, and formations between the web app and API. |
| [supabase/](supabase/) | Contains database migrations, the test fixture, local CLI configuration, and database inspection SQL. |

## How It Works

When the Lambda API starts, it loads its settings and prepares database access and communication with Supabase Auth and Discord. It then sets up the request handlers and permission checks used by the application. The [startup code](api/lambda.ts#L6) brings these pieces together.

### Sign-in and Permissions

When someone opens the app, it checks whether they are signed in. Visitors see the public league page; signed-in members see their dashboard. The app checks again when another browser tab reports a session change. The [main screen](web/src/App.tsx#L8) controls this choice.

Choosing “Sign in with Discord” starts authentication through Supabase Auth. Once Discord confirms the user's identity, the API checks their guild membership, creates or loads their league account, and saves session cookies in the browser. Those cookies identify the user on later requests. The [sign-in implementation](api/plugins/auth/session.ts#L110) handles this exchange.

| Class | Where it is used | Responsibility |
| --- | --- | --- |
| [SupabaseClient](api/plugins/supabase/client.ts#L30) | Constructed by `createRuntime`; used by its `provision` callback, `createSession`, and `SessionRefresher`. | Builds login URLs, exchanges authorization codes, verifies tokens, refreshes sessions, and requests logout. |
| [DiscordClient](api/plugins/discord/client.ts#L19) | Constructed by `createRuntime`; used by the login callback and `SessionRefresher`. | Reads Discord identity, checks guild membership, and renews Discord credentials. |
| [PostgresMembershipStore](api/plugins/membership/store.ts#L11) | Passed from `createRuntime` to session handling. | Saves membership eligibility and reads it while still fresh. |
| [PostgresAuthStore](api/plugins/session/pg-store.ts#L9) | Passed to `createSession`, `RateLimiter`, and `SessionRefresher`. | Persists login replay protection, auth quotas, and refresh coordination in PostgreSQL. |
| [CookieCrypto](api/plugins/session/crypto.ts#L11) | Created by `createSession` and shared with `SessionRefresher`. | Encrypts session/login cookies and refresh results; signs and verifies CSRF tokens. |
| [RateLimiter](api/plugins/limits/auth.ts#L23) | Created by `createSession` with the auth store. | Applies authentication request quotas by endpoint, IP, user, and session. |
| [SessionRefresher](api/plugins/session/refresh.ts#L22) | Created by `createSession`; called by `/auth/refresh` and logout when needed. | Coordinates refreshes and renews provider credentials and membership eligibility. |

The API checks permissions for each request using the verified session and the user's roles in the database. Public information is available without signing in. Member and administrator actions require the appropriate access. Signed-in GraphQL reads, changes to league data, and administrator reads also check that the session is still active. These rules are enforced by the [request checks](api/app.ts#L123) and [account field definitions](api/routes/accounts/schema.ts#L8).

If a request reports that the session needs renewal, the browser renews it and tries the original request once more. Signing out clears the browser's session and cached data, then tells other tabs to update. See [session renewal](web/src/api/http.ts#L57) and [sign-out handling](web/src/auth/session.ts#L20).

### Reading League Data

Each screen asks for the league information it needs. The public page loads players, teams, and team records. The member dashboard also loads news, voting periods, and the current account. The app prepares the returned data for display, shows loading or error messages, and ignores older responses that arrive after a newer request. The [dashboard loaders](web/src/features/dashboard/api.ts#L61) and [loading-state handling](web/src/hooks/resource.ts#L7) implement this behavior.

The named queries are defined beside their features:

| Query | Used by | Data requested |
| --- | --- | --- |
| [PublicLeagueData](web/src/features/dashboard/league.graphql#L1) | `PublicLeague` → `loadPublicLeague()` | Public account summaries, visible teams, and imported team records. |
| [MemberLeagueData](web/src/features/dashboard/league.graphql#L11) | `Dashboard` → `loadMemberLeague()` | Accounts, teams, current season, weightings, news, voting periods, and the current account (`me`). |
| [AccountMatches](web/src/features/accounts/accounts.graphql#L40) | [MatchLog](web/src/features/dashboard/MatchLog.tsx#L9) and [HeadToHead](web/src/features/accounts/HeadToHead.tsx#L10) → [loadAccountMatchPage](web/src/features/accounts/api.ts#L51) | Up to 25 match records per page, with cursor, season, and opponent parameters. |
| [AccountOpponents](web/src/features/accounts/accounts.graphql#L50) | `HeadToHead` → [loadAccountOpponents](web/src/features/accounts/api.ts#L58) | Opponent totals for one account. |
| [TeamRecords](web/src/features/matches/matches.graphql#L1) | [TeamStandings](web/src/features/matches/standings.tsx#L18) when records are not supplied, and [ScheduleView](web/src/features/matches/schedule-view.tsx#L14) → [loadTeamRecords](web/src/features/matches/api.ts#L20) | Team records aggregated from imported match history. |

For example, this is the [public dashboard query](web/src/features/dashboard/league.graphql#L1):

```graphql
query PublicLeagueData {
  accounts {
    ...PublicAccountFields
  }
  teams {
    ...TeamFields
  }
  teamRecords
}
```

The query reuses shared field lists for [player profiles](web/src/features/accounts/accounts.graphql#L1) and [teams](web/src/features/teams/teams.graphql#L1). This keeps different screens consistent about the information they request. A [generation script](web/scripts/codegen.ts) checks these queries against the API's available fields and creates TypeScript definitions so the browser code knows the shape of each response.

The browser sends GraphQL reads and league changes through the same [request handling](web/src/api/http.ts#L27). Both carry session cookies and use the same protections against forged requests and expired sessions.

The Lambda API checks that each GraphQL request contains one valid query within the allowed size and complexity limits. It then loads the requested fields from the database. The [query handler](api/routes/graphql/index.ts#L73) coordinates this work, with each area of the league responsible for its own data:

- [Account reads](api/routes/accounts/schema.ts#L59) return public player profiles and statistics. The current user's account also includes their email, pending profile image, and roles.
- [Team reads](api/routes/teams/queries.ts#L11) return the teams the caller is allowed to see.
- [Team records](api/routes/matches/records.ts#L5) are calculated from imported player match histories. Records for the same team and imported match are counted once, even when several players have that match in their history.

Within one request, the API [reuses data it has already loaded](api/routes/graphql/context.ts#L13). The browser also keeps recently loaded data for repeat visits, as described in [Browser Cache](#browser-cache).

### Updating League Data

When someone saves a change, the browser sends it to the API. The API checks their permissions and validates the submitted data before writing to the database. Related changes are saved together: they either all succeed or are rolled back. The [database implementation](api/plugins/db/client.ts#L10) also protects these writes from conflicting concurrent changes and gives each transaction a 15-second time limit.

Administrators enter match statistics through the [Import tab](web/src/features/admin/AdminPanel.tsx#L153). A successful import follows four steps:

1. The administrator uploads a match export, selects the teams, and connects each exported player to a league account. The [file reader](web/src/features/matches/match-import.tsx#L62) prepares the export for review.
2. After confirmation, the browser sends the match details, player mappings, team IDs, season, and any tackle corrections to the API. See [import submission](web/src/features/matches/match-import.tsx#L97).
3. The API validates the import, adds the match to each mapped player's history, and recalculates their statistics. These account updates are saved together by the [import handler](api/routes/matches/index.ts#L147).
4. The app shows the match ID and import counts, then [reloads league data](web/src/features/admin/AdminPanel.tsx#L38) so the updated results appear on screen.

Other league changes follow the same pattern of checking permissions, validating input, and saving related records together:

| Action and caller | Feature API → endpoint | Server implementation |
| --- | --- | --- |
| [ReviewMatchStats.approve](web/src/features/matches/stats-submission.tsx#L44) | [matches.approveSubmission](web/src/features/matches/api.ts#L11) → `POST /api/submissions/:id/approve` | [registerMatches](api/routes/matches/index.ts#L103) validates the shared `approveSubmission` schema, updates account statistics, writes result news, and marks the submission approved together. |
| [TeamsView.respondInvitation](web/src/features/teams/teams-view.tsx#L78) | [teams.respondInvitation](web/src/features/teams/api.ts#L13) → `POST /api/teams/:id/invitation` | [registerTeams](api/routes/teams/index.ts#L205) records acceptance; for an approved team, [moveMember](api/routes/teams/index.ts#L17) updates the roster, account assignment, and transfer history. |
| [GenerateScheduleModal.handleGenerate](web/src/features/matches/schedule-setup.tsx#L70) | [matches.replaceScheduledSeason](web/src/features/matches/api.ts#L15) → `PUT /api/schedule/season/:season` | [registerContent](api/routes/content/index.ts#L157) validates `scheduleInput` rows and replaces the season's scheduled matches. Schedule generation itself happens in the browser. |
| [VotingTab.handleSubmit](web/src/features/voting/VotingTab.tsx#L63) | [voting.submitTotwVotes](web/src/features/voting/api.ts#L10) → `PUT /api/voting/periods/:id/votes` | [registerVoting](api/routes/voting/index.ts#L57) validates `voteInput`, checks the voting window and candidates, and replaces the member's ballot. |

The [shared validation rules](pkgs/contracts/src/index.ts) define the accepted data for these commands. Manual match review remains implemented, but its [Stats tab is currently hidden](web/src/features/admin/AdminPanel.tsx#L104). Imported matches are saved directly; they do not pass through manual approval.

After a successful change, the browser [clears cached query results and stops older queries still in progress](web/src/api/client.ts#L20). The screen then reloads the information it needs, while late responses cannot refill the cache with old data.

## Browser Cache

The browser can reuse complete, successful GraphQL responses for 30 seconds after they finish loading. Each query and its parameters has a separate entry. An ordinary dashboard reload may use this recent data; screens can explicitly request fresh data when needed. Failed reads never add cache entries. Everything stays in browser memory and belongs to the current browser client. See the [read implementation](web/src/api/graphql.ts#L7).

The cache holds at most 32 entries, with different parameters counting as separate entries even for the same query. When a successful result needs a new entry and the cache is full, the browser clears all existing entries before saving it. This limit also applies when several queries finish at the same time.

Successful changes to league data clear cached reads and stop older queries still in progress. Failed changes leave the cache intact. Sending a GraphQL query does not clear it, because that request only reads data. Signing out or changing sessions uses the same reset process, and late responses from the previous client cannot refill the new cache. See [request handling](web/src/api/http.ts#L38) and [cache reset](web/src/api/client.ts#L20).

The API's reuse of data within a single request ends with that request. It is separate from the browser's 30-second cache.

Run the browser tests to check expiration, forced reads, successful and failed changes, cancellation, concurrent query limits, and session isolation:

```sh
npm test -w @napl/web
```

The relevant checks are in the [cache tests](web/test/cache.test.ts), [client reset tests](web/test/client.test.ts), and [GraphQL tests](web/test/graphql.test.ts).

## Administrator Assignment History

Only a verified super administrator can change the administrator list. The API checks that the selected accounts exist, removes repeated IDs, and compares the selection with the current list. Reordering the IDs or changing their capitalization still counts as the same selection and creates no history entry. This action changes administrator assignments while leaving super-administrator assignments intact. See the [assignment handler](api/routes/admin/index.ts#L11).

Every changed list records who made the change, when the database saved it, and the complete lists before and after the change. The actor comes from the verified session. The assignments and their history are saved together, so a failure to record the history also prevents the assignment change. Concurrent changes either save complete lists with matching history or return a conflict.

Apply the [assignment-history migration](supabase/migrations/202610140001_role_audit.sql) before deploying this API behavior. The API's database login can append history but cannot read, edit, delete, or clear it. Browser roles have no access. The migration owner can inspect the records directly. Deleting an account does not erase its history because the records are retained independently of the account.

The integration tests check permissions, unchanged selections, rollback, concurrent changes, and database access restrictions using disposable PostgreSQL databases. Run them with Node 24 and Docker:

```sh
npm run test:integration
```

See the [assignment tests](api/test/routes/admin-audit.test.ts) and [database permission tests](api/test/integration/role_audit.sql).

## What's not in this repo?

- **Hosted service implementations.** Supabase Auth and Discord OAuth run outside this application. The repository contains the [Supabase](api/plugins/supabase/client.ts) and [Discord](api/plugins/discord/client.ts) clients that call them.
- **A production database snapshot.** The [migrations](supabase/migrations/) extend an existing database baseline. The [test fixture](supabase/fixtures/legacy.sql) supports disposable integration databases; it is not a production backup.
- **Deployment secrets and provider setup.** Live credentials, cookie keys, and OAuth application settings must be supplied separately. The [environment example](api/.env.example) lists required values, and [Production Deployment](#production-deployment) covers the external setup. The included [SAM template](api/template.yaml) provisions Lambda resources; it does not create the Supabase or Vercel projects.

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

`setup:env` creates `api/.env` if needed and generates `COOKIE_KEYS` once, preserving existing keys and other settings. Fill in provider/database values locally. Set `DATABASE_URL` to a restricted database login with the application and authentication permissions described in [Runtime Settings](#runtime-settings). Never commit actual `.env` files or regenerate the cookie key at startup.

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

Vercel serves the frontend and forwards its API requests to Lambda. The forwarding code uses temporary AWS credentials to sign requests, and Lambda checks a shared secret before handling them. User sign-in and permission checks still apply after these infrastructure checks. See the [request forwarding implementation](web/server/proxy.ts).

The [deployment template](api/template.yaml) creates the Lambda function, its live version alias, execution permissions, a CloudWatch log group with 14-day retention, and permission for the production Vercel project to invoke the API. Its defaults are Node 24 on ARM64, 512 MiB of memory, and a 60-second timeout. It uses the account's available concurrency unless a reservation is explicitly configured. Supabase and Vercel projects are set up separately. The template does not add a custom network, a separate content-delivery service, or pre-warmed Lambda capacity.

### Prepare and Validate

Use Node 24, npm 11, AWS credentials for the intended account, and SAM CLI 1.165.0 or later. Docker is required for the database integration tests and optional local Lambda invocation. Run commands from the repository root.

Install dependencies, then run the full set of [checks](#checks):

```sh
npm ci
```

The build produces the web assets and the Lambda package at `api/dist/api.zip`. The [packaging script](api/scripts/build.mjs) includes only the bundled handler and its package metadata in that ZIP. The build also checks the Vercel forwarding bundle, while integration tests exercise the Lambda package outside the repository against disposable PostgreSQL data. These steps do not deploy cloud resources.

To additionally invoke the packaged API in a local Lambda container, run:

```sh
npm run test:sam
```

### Runtime Settings

Start with the [environment example](api/.env.example). The setup command creates the local file if needed and generates cookie keys only when none have been configured. It preserves a valid existing key ring and rejects malformed keys instead of replacing them.

```sh
npm run setup:env
```

Supply production values through a protected local file or the deployment environment. Environment values take precedence over the local file when generating deployment parameters.

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | One Supabase PostgreSQL connection URL for league data and authentication state. Its restricted runtime login must inherit both `app_runtime` and `gateway_runtime`; use `sslmode=verify-full` in production. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Supabase project HTTPS URL and authentication publishable key. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID` | Discord OAuth application credentials and the guild used for membership checks. |
| `PUBLIC_ORIGIN` | Exact HTTPS address of the public frontend, without a path or trailing slash. Configure allowed sign-in redirects for this frontend origin. |
| `COOKIE_KEYS` | Persistent JSON key ring shared by all API instances. Each key is a base64-encoded 32-byte value. |
| `ORIGIN_SECRET` | Secret shared by Vercel and the API, at least 32 characters long. |
| `VERCEL_TEAM_SLUG`, `VERCEL_PROJECT_NAME` | Exact team and project identifiers allowed to invoke the production API. |
| `SUPABASE_SECRET_KEY` | Optional server secret key for forwarding the original client IP to Supabase. |
| `SUPABASE_JWT_AUDIENCE` | Optional token audience; defaults to `authenticated`. |
| `DISCORD_TRANSFER_WEBHOOK` | Optional destination for roster notices. |
| `EXISTING_VERCEL_OIDC_PROVIDER_ARN` | Optional existing AWS identity provider for the Vercel team, reused instead of creating another. |
| `APPLICATION_ROLE_BOUNDARY_ARN` | Permissions boundary created by the deployment bootstrap, limiting the permissions of application roles. |

The generated AWS trust policy accepts only the named project's production Vercel environment. Preview deployments need their own access; they do not inherit production permission.

### Database Capacity

League data and authentication state use the same `DATABASE_URL` and database login. Each Lambda environment still has two database clients, each limited to one connection. Ten active environments can therefore use roughly 20 connections. Leave additional room for warm environments, overlapping releases, migrations, and other database users.

The template omits reserved concurrency by default. New AWS accounts can have a concurrency quota too small to support a reservation. Once the account permits it, set the template's `ReservedConcurrency` parameter to a positive limit that fits the database budget. Its default of `-1` means no reservation; `0` disables invocation. The account's shared quota can change, so it is not a permanent function-specific limit or spending cap.

Use the database provider's transaction pooler and choose Lambda concurrency to fit the actual connection budget. The defaults are starting settings, not measured capacity guarantees. The [application connection settings](api/plugins/db/client.ts#L23) and [authentication connection settings](api/plugins/runtime.ts#L14) define these limits.

### Session Keys

Keep the existing cookie keys when moving sessions to Lambda. All API instances need the same key ring so they can read the same session cookies.

When rotating keys, put the new key first and retain the older keys until their sessions expire. Keep those keys available to any version you might roll back to. Generating replacement keys at application startup would make existing sessions unreadable. The [setup script](api/scripts/setup-env.mjs) manages initial key creation separately from startup.

### GitHub Deployment Setup

An AWS administrator creates the [deployment bootstrap](api/deploy-bootstrap.yaml) once. It creates GitHub federation, a private deployment bucket, a deployment role, and a CloudFormation execution role. A permissions boundary limits the application roles, and GitHub cannot modify the bootstrap through its deployment role. GitHub access starts disabled.

```sh
aws cloudformation deploy \
  --profile napl --region us-east-2 \
  --template-file api/deploy-bootstrap.yaml \
  --stack-name napl-deployment \
  --capabilities CAPABILITY_IAM
```

The following setup is in **GitHub**, under this repository's **Settings → Environments → Production**. The repository owner must configure this environment:

1. Under **Deployment branches and tags**, select **Selected branches and tags** and allow only the **branch** named `main`. Do not add a tag rule or wildcard.
2. Add the environment secrets and variables below. Secrets belong in **Environment secrets**, not ordinary variables.
3. Keep releases automatic; no required reviewer is needed for this workflow.

| Environment secret | Where to obtain it |
| --- | --- |
| `DATABASE_URL` | Supabase PostgreSQL connection for the shared runtime login, with `sslmode=verify-full`. |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → application → OAuth2 client secret. |
| `COOKIE_KEYS` | Existing API key ring; preserve it during deployment. For a first installation, generate it once with the setup command and retain it securely. |
| `ORIGIN_SECRET` | Existing secret shared by Vercel and the API. For a first installation, generate it once and configure the same value in both places. |
| `SUPABASE_SECRET_KEY` | Optional Supabase server secret key. |
| `DISCORD_TRANSFER_WEBHOOK` | Optional Discord webhook URL for roster notices. |

The database login requires both runtime role grants and the migrations described in [Runtime Settings](#runtime-settings) and [Rollout and Rollback](#rollout-and-rollback). Use a restricted runtime login rather than the database administrator account. The same login serves league data and authentication state, so it has the combined permissions of both runtime roles.

| Environment variable | Value or source |
| --- | --- |
| `AWS_REGION` | `us-east-2` |
| `AWS_DEPLOY_ROLE_ARN` | Bootstrap stack output `GitHubDeployRoleArn`. |
| `AWS_CLOUDFORMATION_ROLE_ARN` | Bootstrap stack output `CloudFormationExecutionRoleArn`. |
| `AWS_DEPLOYMENT_BUCKET` | Bootstrap stack output `DeploymentBucket`. |
| `APPLICATION_ROLE_BOUNDARY_ARN` | Bootstrap stack output `ApplicationRoleBoundaryArn`. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Supabase project URL and publishable API key. |
| `PUBLIC_ORIGIN` | Public website's exact HTTPS origin. |
| `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` | Discord application ID and league server ID. |
| `VERCEL_TEAM_SLUG`, `VERCEL_PROJECT_NAME` | Vercel team's URL slug and project name. |
| `SUPABASE_JWT_AUDIENCE` | Optional; defaults to `authenticated`. |
| `EXISTING_VERCEL_OIDC_PROVIDER_ARN` | Optional; use only when the Vercel team's AWS provider already exists. |

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

The [CI/CD workflow](.github/workflows/ci-cd.yml) runs once per push and reports one **CI** check. Its steps and summary follow **Lint → Test → Build → Deploy**, with each operation named separately. Deployment steps run only on `main`, using the `Production` environment; other branches use `CI` without creating deployment records. Prepare the production configuration before merging the deployment changes into `main`.

| Section | What happens |
| --- | --- |
| Lint | Run ESLint with zero warnings allowed. Then generate the Prisma client, check GraphQL freshness, type-check every workspace, and validate both SAM templates. Each operation has its own named step and log entry. |
| Test | Run API and web tests against disposable PostgreSQL. The test command prepares the shared contracts it needs. |
| Build | Build shared contracts, bundle Lambda, and build the frontend and proxy in separate ordered steps. Verify the finished Lambda ZIP outside the repository against disposable PostgreSQL. On `main`, upload that exact tested ZIP and template for deployment. |
| Deploy | Use the verified package from the preceding Build steps, validate production configuration, confirm that the commit is still current on `main`, obtain temporary credentials, and update the `napl-api` stack in Ohio. Confirm that anonymous Function URL access is rejected and invoke the live alias to read the current season. Clean up deployment parameter files even on failure. Deployments run one at a time. |

The [parameter generator](api/scripts/sam-env.mjs) validates production settings, checks Lambda's 4 KiB environment limit, and writes a protected parameter file. The workflow removes its secret files after each run; they are never deployment artifacts. Avoid SAM debug logging because it can reveal parameters.

A new Lambda version becomes active through the `live` alias. CloudFormation normally rolls back a failed infrastructure update. A failed smoke check after deployment marks the workflow failed but does not undo that release; revert the change on `main` and let the workflow deploy a compatible revision. Preserve the active cookie keys when rolling back.

The smoke check verifies access to league data. It does not verify Discord sign-in, access to authentication state, or Vercel forwarding. Complete those checks through the website after configuring Vercel. The workflow does not run production migrations or coordinate Vercel's separate deployment process.

### Configure Vercel

Set the Vercel project root to the web directory and allow the build to access files outside it so the shared packages are available. The [Vercel configuration](web/vercel.json) builds the frontend and shared contracts, serves the generated assets, and forwards API requests through the server function. Use Node 24 for that function.

Set these values in Vercel's server-only production environment:

| Vercel setting | Source |
| --- | --- |
| `API_URL` | The deployment's `FunctionUrl` output. |
| `AWS_ROLE_ARN` | The deployment's `VercelInvokeRoleArn` output. |
| `AWS_REGION` | The Lambda function's AWS region. |
| `ORIGIN_SECRET` | The same secret supplied to the API. |

Keep these values out of browser-exposed settings; the `VITE_` prefix would publish them in the browser bundle. Vercel uses its deployment identity to obtain temporary AWS credentials. The forwarding code signs requests, carries session cookies in both directions, and prevents response caching. It allows 55 seconds for a request and does not retry writes. Confirm that the selected Vercel runtime supports that duration.

### Optional Staging Load Check

The [load runner](api/test/load/run-staging.mjs) measures public league reads against an explicitly selected staging environment. Use an isolated staging project and database with their own invocation permissions. A Vercel preview hostname alone does not establish that an environment is isolated from production.

```sh
npm run test:load -- --help
```

| Setting | Requirement or purpose |
| --- | --- |
| `LOAD_STAGE` | Required; must be `staging`. |
| `LOAD_BASE_URL` | Required HTTPS URL whose hostname contains `staging` or ends in `.vercel.app`. Verify that it points to the isolated staging system. |
| `LOAD_DB_CONNECTION_BUDGET` | Required positive database connection budget, recorded in the report. |
| `LOAD_ROUNDS` | Optional; between 1 and 5 rounds. |
| `LOAD_LAMBDA_RESERVED_CONCURRENCY` | Optional concurrency setting recorded in the report. |
| `LOAD_COOKIE` | Optional staging session cookie. |
| `LOAD_TIMEOUT_MS` | Optional request timeout, between 1,000 and 60,000 milliseconds. |
| `LOAD_REPORT` | Optional report location; reports default to the temporary directory at `/tmp`. |
| `LOAD_MEASUREMENTS_FILE` | Optional file containing independently collected Lambda and database measurements. |

The runner first initializes request protection, then issues public GraphQL reads in successive groups of 20, 50, 100, and 200 simultaneous requests. One to five rounds produce 370–1,850 reads plus the initial setup request. Requests are not retried. The declared connection budget is recorded rather than enforced, and the runner does not change infrastructure. Measurements that were not supplied remain unknown.

This check is optional, is separate from continuous integration, and must target staging. Historical container measurements do not establish Lambda capacity.

## Rollout and Rollback

Release the API before switching the frontend. Coordinate the database cutover and access-control migrations with that switch: they remove the legacy browser's direct access to league tables, so applying them while the old frontend is still in use will break that frontend. Apply the [administrator history migration](supabase/migrations/202610140001_role_audit.sql) before enabling the corresponding API behavior. Local integration tests apply migrations only to disposable fixtures; production migrations are a separate deployment step.

After rollout, check public league reads, sign-in, session renewal, sign-out, and an authorized change through the frontend's public address. Watch Lambda errors, throttling, request duration, and database connections. A direct unsigned request to the Lambda URL should be rejected by AWS, and a request without the shared origin secret should be rejected by the API.

To roll back application code, redeploy the previous compatible revision with its configuration, keeping the active cookie keys available. A code rollback does not undo database migrations, so the older application must still work with the current database.
