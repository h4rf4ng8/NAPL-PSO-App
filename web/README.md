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
| [src/features/](src/features/) | Groups screens, models, API calls, and GraphQL selections by league area: accounts, administration, content, dashboard, matches, teams, and voting. |
| [src/api/](src/api/) | Sends requests, handles session renewal, and keeps recent GraphQL results in memory. |
| [src/auth/session.ts](src/auth/session.ts) | Loads the current account, starts Discord sign-in, and signs out. |
| [src/hooks/](src/hooks/) | Tracks loading, data, and errors; ignores responses from outdated requests. |
| [src/components/](src/components/), [src/styles/](src/styles/), and [src/theme/](src/theme/) | Provide shared UI elements, styling, and theme preferences. |
| [scripts/codegen.ts](scripts/codegen.ts) | Checks feature queries against the API schema and generates typed GraphQL documents. |
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

Screens load the information they need, prepare it for display, and show loading or error states. GraphQL selections live beside their features. Generated documents give those queries and responses TypeScript types; regenerate them after changing a selection or the API schema.

| Query | Used by | Data requested |
| --- | --- | --- |
| [PublicLeagueData](src/features/dashboard/league.graphql) | [PublicLeague](src/features/dashboard/PublicLeague.tsx) through [loadPublicLeague](src/features/dashboard/api.ts) | Public players, teams, and team records. |
| [MemberLeagueData](src/features/dashboard/league.graphql) | [Dashboard](src/features/dashboard/Dashboard.tsx) through [loadMemberLeague](src/features/dashboard/api.ts) | League data, season settings, news, voting periods, and the current account. |
| [AccountMatches and AccountOpponents](src/features/accounts/accounts.graphql) | [MatchLog](src/features/dashboard/MatchLog.tsx) uses match pages; [HeadToHead](src/features/accounts/HeadToHead.tsx) uses both queries through [account loaders](src/features/accounts/api.ts). | Match pages and opponent summaries. |

The [GraphQL client](src/api/graphql.ts) sends reads to `POST /api/graphql` and reuses complete, successful results for 30 seconds. The [loading hook](src/hooks/use-resource.ts) keeps older responses from replacing newer screen data. Some screens also use HTTP reads, such as the [season schedule](src/features/matches/api.ts).

### Saving Changes

Feature API modules send changes as HTTP commands. For example, the [match import screen](src/features/matches/match-import.tsx) submits player mappings and match data through [matches.importMatch](src/features/matches/api.ts) to `POST /api/import-match`. The API validates and saves the import, then returns counts for the screen to display.

Successful league changes clear cached reads and cancel older queries. The affected screen then reloads its data. See [request handling](src/api/http.ts), [cache reset](src/api/client.ts), and the [administrator refresh](src/features/admin/AdminPanel.tsx).

## Running Locally

Complete the repository's [local setup](../README.md#local-development) first, using Node 24 and npm 11. Run these commands from the repository root in separate terminals:

```sh
npm run dev:api
npm run dev
```

Open `http://localhost:5173`. Set the same `ORIGIN_SECRET` as the API in the Vite environment or `web/.env`. The [environment example](.env.example) also documents the local API target. These settings are server-only; never prefix secrets with `VITE_`.

## Checks

Run from the repository root after setup:

| Command | Purpose |
| --- | --- |
| `npm run gql:generate` | Regenerate GraphQL documents and response types. |
| `npm run gql:check` | Check that generated GraphQL files match the current queries and schema. |
| `npm run typecheck -w @napl/web` | Check browser and server TypeScript. |
| `npm test -w @napl/web` | Run the [web tests](test/), including requests, caching, UI logic, and forwarding. |
| `npm run build -w @napl/web` | Build browser assets and check the server forwarding bundle. |

## Related Documentation

- [System architecture and sequence diagrams](../README.md#system-architecture)
- [Browser cache behavior](../README.md#browser-cache)
- [API internals](../api/README.md)
- [Production deployment and Vercel configuration](../README.md#production-deployment)
