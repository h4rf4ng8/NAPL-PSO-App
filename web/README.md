# Web Application

The React application provides public league pages, member dashboards, and administrator tools. It sends requests to the [Lambda API](../api/README.md), which checks permissions and saves league data. Vite runs the app locally; Vercel serves it in production.

## Table of Contents

- [Components](#components)
- [How It Works](#how-it-works)
  - [Opening the App](#opening-the-app)
  - [Reading League Data](#reading-league-data)
  - [Saving Changes](#saving-changes)
- [REST Hook Audit](#rest-hook-audit)
- [Retained Helpers](#retained-helpers)
- [Running Locally](#running-locally)
- [Checks](#checks)
- [Related Documentation](#related-documentation)

## Components

| Component | What it does |
| --- | --- |
| [src/main.tsx](src/main.tsx) and [src/App.tsx](src/App.tsx) | Start React, apply the saved theme, and choose the public page or member dashboard. |
| [src/features/](src/features/) | Groups screens, models, API calls, and query consumers by league area: accounts, administration, content, dashboard, matches, teams, and voting. |
| [src/api/](src/api/) | Sends requests, handles session renewal, and keeps recent GraphQL results in memory. |
| [src/auth/session.ts](src/auth/session.ts) | Loads the current account, starts Discord sign-in, and signs out. |
| [src/hooks/](src/hooks/) | Tracks loading, data, and errors for REST consumers; GraphQL consumers use Apollo hooks. |
| [src/components/](src/components/), [src/styles/](src/styles/), and [src/theme/](src/theme/) | Provide shared UI elements, styling, and theme preferences. |
| [scripts/codegen.ts](scripts/codegen.ts) | Checks API-owned queries and generates server execution documents and browser typed documents. |
| [../pkgs/contracts/](../pkgs/contracts/) | Shares domain types and validation rules with the API. |

## How It Works

### Opening the App

The app first checks the current session. Visitors start on Teams and can browse Stats, Schedule, News, Transfers, and Rules. Standings appears only in the signed-in dashboard. Choosing Discord sign-in starts Supabase SDK OAuth with PKCE. The frontend handles `/auth/callback`; later API requests carry bearer tokens and omit cookies. Signing out clears cached data and tells other tabs to reload their session.

| Implementation | Used by | Responsibility |
| --- | --- | --- |
| [auth](src/auth/session.ts) | [App](src/App.tsx) | Loads the account and handles sign-in and sign-out actions. |
| [request](src/api/http.ts) | Authentication, feature API calls, and the [GraphQL transport](src/api/link.ts) | Sends JSON directly with a bearer access token and credentials omitted. Adds Apollo's preflight header to named GraphQL reads. Obtains a fresh SDK token before requests and permits one shared refresh/retry only for definitive expiry. |

Browser requests resolve API paths against `VITE_API_URL` and call Lambda directly. Vite and Vercel serve the SPA, including `/auth/callback`; Supabase SDK handles the callback. Database access and permission checks belong to the API.

### Reading League Data

GraphQL screens use `useQuery` and `useLazyQuery` through `ApolloProvider`. Apollo supplies loading, error, data, and refetch state. Pure feature mappers prepare validated results for display. Canonical selections live in [API operations](../api/routes/graphql/operations/); the browser uses generated typed documents.

| Query | Used by | Data returned |
| --- | --- | --- |
| `Standings` | Retained authenticated API operation and transport validation; no current screen | Players, teams, and team records; sign-in required. |
| `MemberLeagueData` | [Dashboard](src/features/dashboard/Dashboard.tsx) | League data, season, news, voting periods, and the current account. |
| `AccountMatches` | [MatchLog](src/features/dashboard/MatchLog.tsx) | Bounded match-history pages. |
| `AccountOpponents` | Retained API operation and transport validation; no current screen | Opponent summaries; the unreachable `HeadToHead` component was removed. |
| `TeamRecords` | Signed-in standings and schedule screens | Aggregated team records; sign-in required. Public Schedule skips this query and shows its existing public fixtures without team records. |
| `AccountCardPreviews` and `DefaultPositionWeights` | Player-card previews and ranking controls | Server-calculated samples and default weights. |

The [transport](src/api/link.ts) sends `{operationName, variables}` to the shared `POST /api/graphql` [trusted-operation transport](../pkgs/contracts/src/index.ts), with `Apollo-Require-Preflight: true`. Apollo Server handles GraphQL CSRF protection; these reads no longer bootstrap or send signed CSRF tokens or write idempotency keys. The link validates response data before Apollo caches it and aborts requests when Apollo cancels them. The server accepts only the 21 allowlisted operation names and their variables; it rejects arbitrary query documents, unknown names, batches and unsupported body fields.

The exported [Apollo client](src/api/client.ts) is one stable singleton. Apollo's default `cache-first` policy reuses complete cached data; explicit refresh requests fresh data. Its default error policy rejects partial failures. The [root cache documentation](../README.md#browser-cache) covers invalidation and session isolation. REST-only screens keep their existing loading hooks. [PublicLeague](src/features/dashboard/PublicLeague.tsx) loads public accounts and teams through named Apollo queries; it never requests Standings or TeamRecords.

Player rankings and card statistics remain calculated by the API. The browser selects and renders those results; canonical ranking and name-validation rules stay on the server.

### Saving Changes

Feature API modules send changes as HTTP commands. For example, the [match import screen](src/features/matches/match-import.tsx) submits player mappings and match data through [matches.importMatch](src/features/matches/api.ts) to `POST /api/match-imports`. The API validates and saves the import, then returns counts for the screen to display.

Successful league changes clear cached reads and cancel older queries. Apollo refetches active GraphQL queries; REST screens retain their explicit reloads. Refetch failures do not make a successful command fail. See [request handling](src/api/http.ts), [cache reset](src/api/client.ts), and the [administrator refresh](src/features/admin/AdminPanel.tsx).

A logical write retains its URL, method, body and idempotency key across one retry allowed only after a definitive token-expiry response. SDK refresh coordinates concurrent requests and tabs. A network failure, AWS boundary error or ambiguous write result is never replayed. `Idempotency-Key` does not guarantee server-side deduplication. Signed CSRF tokens and the API auth routes have been removed. Public reads remain available while signed out.

## REST Hook Audit

**Keep both files.** [resource.ts](src/hooks/resource.ts) is the small async state machine; [use-resource.ts](src/hooks/use-resource.ts) connects it to React. REST callers still need complete text, settings, editor fields and other resources without named GraphQL operations. Team directories use native Apollo queries with shared cursor state; these state helpers do not fetch data.

| Caller | Actual data source | Verdict and reason |
| --- | --- | --- |
| `PublicLeague` | Named `Leaderboard` and `TeamSummaries` operations | Apollo public reads; no authenticated standings or team records. |
| `WeightingsPublicView` | `GET /api/settings/position_weights` | Keep REST: saved weightings have a schema field but no named GraphQL operation. Its separate default-weight query already uses Apollo. |
| `AdminsManager` | `GET /api/roles` | Keep REST: the authorized `admins` schema field has no named operation; retain save lockout during failed/pending reads. |
| `ArticleDetailView` | `GET /api/articles/slug/:slug` | Keep REST: no GraphQL equivalent; preserve 404 handling and slug-change reset. |
| `ArticlesListView` | `GET /api/articles` | Keep REST: no GraphQL equivalent. |
| `HallOfFameView` | Named `HallOfFame` operation | Apollo derived league view. |
| `NewsView` | Named `HomeNews` operation | Apollo filtered public news. |
| `ScheduleView` | `GET /api/schedule` | REST scheduled matches; team records use Apollo only while signed in. |
| `StatsManager` (removed) | `GET /api/submissions` | Delete frontend caller: no tab, route, or state transition could open it. Preserve the REST API. |
| `TeamsView` and team selectors | Named `TeamSummaries` / `TeamPlayers` operations | Apollo directories and rosters; selected-team editing retains REST detail reads. |
| `TransfersView` | `GET /api/transfers` | REST transfer summaries include team identities. |
| `VotingTab` | `GET /api/voting/periods/:id/votes` | Keep REST: GraphQL exposes periods, not ballots; preserve period reset and server-side ballot visibility. |

The hook loads on mount and dependency changes, discards data on dependency reset, and ignores outdated responses after replacement or cleanup. Explicit reload retains the previous data while loading and after failure. It exposes read errors in state and resolves `reload()`, so a failed refresh does not misreport a completed write. It does not provide caching, authentication, or network cancellation. The [resource tests](test/resource.test.ts) exercise the underlying state machine's reset, invalidation, race, and reload behavior; [mounted hook tests](test/resource-hook.test.ts) cover dependency changes, pending reads at unmount, disabled reload after unmount, and reload failure/recovery through React. The [public-page tests](test/public-league.test.ts) mount real consumers and verify navigation, public REST reads, and skipped private queries. React Test Renderer is pinned to React 18 for these effect-running tests; server rendering alone cannot verify requests started by effects. GraphQL cache/cancellation behavior is covered separately by [cache tests](test/cache.test.ts).

## Retained Helpers

Custom helpers remain only where they supply application behavior beyond React or Apollo:

| Helper or family | Reason to exist |
| --- | --- |
| `request`, error decoders, `ApiError` | One bearer HTTP path, bounded shared SDK renewal, stable permitted retries, and consistent REST/GraphQL errors. |
| `optional`, `segment` | Preserve REST 404-to-null behavior and encode individual URL path/query values. |
| `gatewayLink` | Route the fixed operation allowlist, send variables only, validate opaque response data before caching, and propagate cancellation. A standard `HttpLink` would send query documents rejected by this API. |
| `resetClient`, `resetQueries` | Separate identity clearing (stop departing observers without refetch) from successful-write invalidation (refetch active reads; expose read failures separately). |
| `auth` | Coordinate current-account loading, Discord redirects, sign-out cache clearing, and cross-tab notification. |
| `createResource`, `useResource` | Share the REST loading/race/error lifecycle described above. |
| `useDialog`, dialog components | Maintain focus trapping/restoration, Escape handling, scroll locking, and accessible dialog semantics. |
| `useTheme`, theme functions | Apply the selected palette, persist the preference, and expose the theme toggle to screens. |
| `useView` | Keep dashboard navigation, article URLs, and browser back/forward history in sync. |
| Feature API methods and GraphQL mappers | Keep command payload contracts explicit; validate JSON scalars and map server results to display models without calculating rankings in the browser. |
| League, ranking-display, voting, and review helpers | Select existing server results, resolve displayed lineups, generate schedule previews, and organize UI state; API authorization and canonical validation remain authoritative. |
| Content, input, upload parsers, and presentation helpers | Render shared content and safe links consistently, prepare images/match uploads for preview, format display values, and reuse accessible UI. |

GraphQL reads use Apollo hooks directly. Do not add custom fetch hooks for GraphQL or wrap React/Apollo APIs solely to rename them.

## Running Locally

Complete the [initial setup](../README.md#docker-compose): install dependencies, run `pnpm run setup:env`, configure hosted services in `api/.env` and public browser settings in `web/.env`, then start `./scripts/dev.sh` from the repository root. The [web Dockerfile](Dockerfile) runs the frontend alongside the local Lambda API and HTTP adapter. The API uses the configured hosted Supabase Auth and database, so local sign-in and authorized changes affect that database; Compose does not create or seed a local database.

Open `http://localhost:5173` with the same `PUBLIC_ORIGIN` in `api/.env`; changes under `web/src` reload in the browser. Compose reads `web/.env` and sets the browser-reachable API URL to `http://localhost:3000`. Follow the [hosted Discord setup](../README.md#discord-sign-in-with-compose) to allow the local callback in Supabase. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the same hosted project. Discord credentials stay in Supabase Dashboard.

Rebuild the web image with `./scripts/dev.sh -d web` after changing configuration or dependencies outside `web/src`.

For the **native pnpm alternative**, complete the [native setup](../README.md#native-pnpm-alternative) using Node 24 and pnpm 10.15.1. Run these commands from the repository root in separate terminals:

```sh
pnpm run dev:api
pnpm run dev
```

Open `http://localhost:5173`. Vite reads `web/.env`, documented in the [web environment example](.env.example). Set `VITE_API_URL=http://localhost:3000` and matching public Supabase values. Production builds must receive these three `VITE_*` values before Vite runs; never prefix secrets with `VITE_`.

## Checks

Run from the repository root after setup:

| Command | Purpose |
| --- | --- |
| `pnpm run gql:generate` | Regenerate GraphQL documents and response types. |
| `pnpm run gql:check` | Check that generated GraphQL files match the current queries and schema. |
| `pnpm --filter @napl/web run typecheck` | Check browser TypeScript. |
| `pnpm --filter @napl/web test` | Run the [web tests](test/), including bearer requests, caching, auth lifecycle and UI logic. |
| `pnpm --filter @napl/web run build` | Build static browser assets. |

## Related Documentation

- [System architecture and sequence diagrams](../README.md#system-architecture)
- [Browser cache behavior](../README.md#browser-cache)
- [API internals](../api/README.md)
- [Production deployment and Vercel configuration](../README.md#production-deployment)
