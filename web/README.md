# Web Application

The React application provides public league pages, member dashboards, and administrator tools. It sends requests to the [Lambda API](../api/README.md), which checks permissions and saves league data. Vite runs the app locally; Vercel serves it in production.

## Table of Contents

- [Components](#components)
- [How It Works](#how-it-works)
  - [Opening the App](#opening-the-app)
  - [Reading League Data](#reading-league-data)
  - [Saving Changes](#saving-changes)
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
| [api/proxy.ts](api/proxy.ts) and [server/proxy.ts](server/proxy.ts) | Forward production requests to Lambda with AWS signatures and the origin secret. Credentials stay on the server. |
| [../pkgs/contracts/](../pkgs/contracts/) | Shares domain types and validation rules with the API. |

## How It Works

### Opening the App

The app first checks the current session. Visitors see the public league page; signed-in members see their dashboard. Choosing Discord sign-in redirects the browser through the API and Supabase Auth. After sign-in, session cookies accompany later requests. Signing out clears cached data and tells other tabs to reload their session.

| Implementation | Used by | Responsibility |
| --- | --- | --- |
| [auth](src/auth/session.ts) | [App](src/App.tsx) | Loads the account and handles sign-in and sign-out actions. |
| [request](src/api/http.ts) | Authentication, feature API calls, and the [GraphQL transport](src/api/link.ts) | Sends JSON with cookies and CSRF protection. When renewal is required, renews the session and retries the request once. |

Browser requests use relative `/api` and `/auth` URLs. The [Vite configuration](vite.config.ts) forwards them locally; the [Vercel routes](vercel.json) send them through the server forwarding code in production. Database access and permission checks belong to the API.

### Reading League Data

GraphQL screens use `useQuery` and `useLazyQuery` through `ApolloProvider`. Apollo supplies loading, error, data, and refetch state. Pure feature mappers prepare validated results for display. Canonical selections live in [API operations](../api/routes/graphql/operations/); the browser uses generated typed documents.

| Query | Used by | Data returned |
| --- | --- | --- |
| `Standings` | [PublicLeague](src/features/dashboard/PublicLeague.tsx) | Public players, teams, and team records. |
| `MemberLeagueData` | [Dashboard](src/features/dashboard/Dashboard.tsx) | League data, season, news, voting periods, and the current account. |
| `AccountMatches` and `AccountOpponents` | [MatchLog](src/features/dashboard/MatchLog.tsx) and [HeadToHead](src/features/accounts/HeadToHead.tsx) | Match pages and opponent summaries. |
| `TeamRecords` | Standings and schedule screens | Aggregated team records. |
| `AccountCardPreviews` and `DefaultPositionWeights` | Player-card previews and ranking controls | Server-calculated samples and default weights. |

The [transport](src/api/link.ts) sends only `{variables: ...}` to each operation's [named endpoint](../pkgs/contracts/src/index.ts). It validates response data before Apollo caches it. The server rejects client query documents and operation overrides.

Apollo uses `cache-first`, without a custom expiry timer. Repeat reads reuse complete cached data; explicit refresh requests fresh data. The [root cache documentation](../README.md#browser-cache) covers invalidation and session isolation. REST-only screens keep their existing loading hooks.

Player rankings and card statistics remain calculated by the API. The browser selects and renders those results; canonical ranking and name-validation rules stay on the server.

### Saving Changes

Feature API modules send changes as HTTP commands. For example, the [match import screen](src/features/matches/match-import.tsx) submits player mappings and match data through [matches.importMatch](src/features/matches/api.ts) to `POST /api/import-match`. The API validates and saves the import, then returns counts for the screen to display.

Successful league changes clear cached reads and cancel older queries. Apollo refetches active GraphQL queries; REST screens retain their explicit reloads. Refetch failures do not make a successful command fail. See [request handling](src/api/http.ts), [cache reset](src/api/client.ts), and the [administrator refresh](src/features/admin/AdminPanel.tsx).

## Running Locally

Complete the [initial setup](../README.md#docker-compose): install dependencies, run `pnpm run setup:env`, then start `./scripts/dev.sh` from the repository root. The [web Dockerfile](Dockerfile) runs the frontend alongside the Lambda API, PostgreSQL, and Supabase Auth. Open `http://localhost:5173`; changes under `web/src` reload in the browser. Compose reads `web/.env` and supplies the internal API target. Follow the [Discord setup](../README.md#discord-sign-in-with-compose) to test real sign-in.

Rebuild the web image with `./scripts/dev.sh -d web` after changing configuration or dependencies outside `web/src`.

For the **native pnpm alternative**, complete the [native setup](../README.md#native-pnpm-alternative) using Node 24 and pnpm 10.15.1. Run these commands from the repository root in separate terminals:

```sh
pnpm run dev:api
pnpm run dev
```

Open `http://localhost:5173`. Vite reads `web/.env`, documented in the [web environment example](.env.example). Set `ORIGIN_SECRET` to match `api/.env` and use `LOCAL_API_URL` for the local API target. These settings are server-only; never prefix secrets with `VITE_`.

## Checks

Run from the repository root after setup:

| Command | Purpose |
| --- | --- |
| `pnpm run gql:generate` | Regenerate GraphQL documents and response types. |
| `pnpm run gql:check` | Check that generated GraphQL files match the current queries and schema. |
| `pnpm --filter @napl/web run typecheck` | Check browser and server TypeScript. |
| `pnpm --filter @napl/web test` | Run the [web tests](test/), including requests, caching, UI logic, and forwarding. |
| `pnpm --filter @napl/web run build` | Build browser assets and check the server forwarding bundle. |

## Related Documentation

- [System architecture and sequence diagrams](../README.md#system-architecture)
- [Browser cache behavior](../README.md#browser-cache)
- [API internals](../api/README.md)
- [Production deployment and Vercel configuration](../README.md#production-deployment)
