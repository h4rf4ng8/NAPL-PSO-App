# API coverage audit — fixed operations and native Apollo hooks

Verification and change-size figures below are preserved from the original review on 2026-10-16. This Markdown conversion does not rerun those checks.

Baseline inventory: 73 first-party helper/callsites (60 REST, 7 GraphQL, 6 session/transport), not unique endpoints.

Coverage is source inspection; runtime evidence is recorded separately at the end after verification.

Common protections: verified HttpOnly cookie identity; spoofed identity headers removed; live role checks; membership policy; active-session checks on signed-in POST/read commands; CSRF on unsafe methods; parameterized database access; sanitized errors. Existing REST semantics are preserved.

REST GET filters are existing bound values; accepting extra unused GET keys does not turn them into executable query documents.

## API inventory

### Accounts

| Helper / operation | Method | Endpoint | Validation / server ownership | Authorization | Cache effect |
| --- | --- | --- | --- | --- | --- |
| `getAccount` | `GET` | `/api/accounts/:username` | string route param; bound lookup | public projection | read; no invalidation |
| `getAccountById` | `GET` | `/api/accounts/id/:id` | UUID | owner or admin | read; no invalidation |
| `listAccounts` | `GET` | `/api/accounts` | no user query document | public projection; admin visibility preserved | read; no invalidation |
| `patchAccount` | `PATCH` | `/api/accounts/:id` | UUID; strict profilePatch/adminAccountPatch; explicit fields and locked state checks | owner or admin | successful command resets GraphQL store; failed command leaves it |
| `assignAward` | `PUT` | `/api/accounts/:id/awards/:awardId/:season` | UUID; award enum; season 1..64; empty body; award cap | admin | successful command resets GraphQL store; failed command leaves it |
| `removeAward` | `DELETE` | `/api/accounts/:id/awards/:awardId/:season` | UUID; historical award id 1..160; season 1..64; empty body | admin | successful command resets GraphQL store; failed command leaves it |
| `renameAccount` | `POST` | `/api/accounts/:id/rename` | UUID; strict username; blocked-name check | owner or admin | successful command resets GraphQL store; failed command leaves it |
| `listPositionRequests` | `GET` | `/api/position-requests?status=` | string query parameters; bound status filter | member sees own; admin sees all | read; no invalidation |
| `createPositionRequest` | `POST` | `/api/position-requests` | strict position/reason; locked own account and pending check | member; actor from verified session | successful command resets GraphQL store; failed command leaves it |
| `approvePositionRequest` | `POST` | `/api/position-requests/:id/review` | strict approved/denied status and note; locked pending request | admin | successful command resets GraphQL store; failed command leaves it |
| `denyPositionRequest` | `POST` | `/api/position-requests/:id/review` | strict approved/denied status and note; locked pending request | admin | successful command resets GraphQL store; failed command leaves it |
| `deletePositionRequest` | `DELETE` | `/api/position-requests/:id` | string route param; canonical UUID guard in query | admin | successful command resets GraphQL store; failed command leaves it |

### Teams

| Helper / operation | Method | Endpoint | Validation / server ownership | Authorization | Cache effect |
| --- | --- | --- | --- | --- | --- |
| `getTeam` | `GET` | `/api/teams/:id` | string route param; bound lookup | approved public; otherwise admin/owner/invited | read; no invalidation |
| `listTeams` | `GET` | `/api/teams` | no user query document | approved public; admin/owner/invited visibility | read; no invalidation |
| `createTeam` | `POST` | `/api/teams` | strict teamInput; invitation eligibility; names; lineup; locked own account | member; server assigns owner/status | successful command resets GraphQL store; failed command leaves it |
| `saveTeam` | `PATCH` | `/api/teams/:id` | strict teamPatch; explicit fields; roster/lineup and admin-only checks | captain or admin | successful command resets GraphQL store; failed command leaves it |
| `saveLineup` | `PATCH` | `/api/teams/:id` | strict teamPatch; valid formation and roster entries | captain or admin | successful command resets GraphQL store; failed command leaves it |
| `deleteTeam` | `DELETE` | `/api/teams/:id` | locked team; atomic roster release/delete | admin | successful command resets GraphQL store; failed command leaves it |
| `reviewTeam` | `POST` | `/api/teams/:id/review` | strict status/reason; locked state and roster checks | admin | successful command resets GraphQL store; failed command leaves it |
| `respondInvitation` | `POST` | `/api/teams/:id/invitation` | strict boolean; locked invitation and roster checks | invited member | successful command resets GraphQL store; failed command leaves it |
| `changeMembership` | `POST` | `/api/teams/:id/membership` | strict join/leave; optional UUID; locked roster rules | self or admin; invitation/captain rules | successful command resets GraphQL store; failed command leaves it |
| `listTransfers` | `GET` | `/api/transfers?season=` | string query parameters; bound season filter | public | read; no invalidation |
| `saveTransfer` | `PATCH` | `/api/transfers/:id` | strict nullable league/cross_league windowType | admin | successful command resets GraphQL store; failed command leaves it |
| `deleteTransfer` | `DELETE` | `/api/transfers/:id` | string route param; bound delete | admin | successful command resets GraphQL store; failed command leaves it |

### Matches

| Helper / operation | Method | Endpoint | Validation / server ownership | Authorization | Cache effect |
| --- | --- | --- | --- | --- | --- |
| `listSubmissions` | `GET` | `/api/submissions` | no user query document; bound ownership filter | member own submissions; admin all | read; no invalidation |
| `saveSubmission` | `POST` | `/api/submissions` | strict submissionInput; locked pending status | admin | successful command resets GraphQL store; failed command leaves it |
| `deleteSubmission` | `DELETE` | `/api/submissions/:id` | locked submission; approved deletion forbidden | admin | successful command resets GraphQL store; failed command leaves it |
| `approveSubmission` | `POST` | `/api/submissions/:id/approve` | strict approveSubmission; pending state; teams/players; atomic changes | admin | successful command resets GraphQL store; failed command leaves it |
| `rejectSubmission` | `POST` | `/api/submissions/:id/reject` | strict bounded reason; locked pending status | admin | successful command resets GraphQL store; failed command leaves it |
| `listScheduledMatches` | `GET` | `/api/schedule?season=` | string query parameters; bound season filter | public | read; no invalidation |
| `saveScheduledMatch` | `POST` | `/api/schedule` | strict scheduleInput; explicit writable fields | admin | successful command resets GraphQL store; failed command leaves it |
| `replaceScheduledSeason` | `PUT` | `/api/schedule/season/:season` | strict bounded nonempty match list; season 1..160; atomic replacement | admin | successful command resets GraphQL store; failed command leaves it |
| `deleteScheduledMatch` | `DELETE` | `/api/schedule/:id` | string route param; bound delete | admin | successful command resets GraphQL store; failed command leaves it |
| `importMatch` | `POST` | `/api/import-match` | strict import envelope; <=30 players; bounded stats; duplicate mapping checks | admin | successful command resets GraphQL store; failed command leaves it |

### Content

| Helper / operation | Method | Endpoint | Validation / server ownership | Authorization | Cache effect |
| --- | --- | --- | --- | --- | --- |
| `listNews` | `GET` | `/api/news` | fixed list query | public | read; no invalidation |
| `saveNews` | `POST` | `/api/news` | strict newsInput; server-assigned author | admin | successful command resets GraphQL store; failed command leaves it |
| `deleteNews` | `DELETE` | `/api/news/:id` | string route param; bound delete | admin | successful command resets GraphQL store; failed command leaves it |
| `listRulesSections` | `GET` | `/api/rules` | fixed ordered list query | public | read; no invalidation |
| `saveRulesSection` | `POST` | `/api/rules` | strict ruleInput | admin | successful command resets GraphQL store; failed command leaves it |
| `deleteRulesSection` | `DELETE` | `/api/rules/:id` | string route param; bound delete | admin | successful command resets GraphQL store; failed command leaves it |
| `reorderRulesSections` | `PUT` | `/api/rules/order` | strict ids array <=1000; transactional ordering | admin | successful command resets GraphQL store; failed command leaves it |
| `listArticles` | `GET` | `/api/articles` | fixed list query | public | read; no invalidation |
| `getArticleBySlug` | `GET` | `/api/articles/slug/:slug` | string route param; bound lookup | public | read; no invalidation |
| `saveArticle` | `POST` | `/api/articles` | strict articleInput; server-assigned author | admin | successful command resets GraphQL store; failed command leaves it |
| `deleteArticle` | `DELETE` | `/api/articles/:id` | string route param; bound delete | admin | successful command resets GraphQL store; failed command leaves it |

### Administration

| Helper / operation | Method | Endpoint | Validation / server ownership | Authorization | Cache effect |
| --- | --- | --- | --- | --- | --- |
| `getSeason` | `GET` | `/api/settings/current_season` | allowlisted setting key | public | read; no invalidation |
| `setSeason` | `PUT` | `/api/settings/current_season` | allowlisted key; strict value envelope; bounded id | admin | successful command resets GraphQL store; failed command leaves it |
| `getChampions` | `GET` | `/api/settings/season_champions` | allowlisted setting key | public | read; no invalidation |
| `setChampions` | `PUT` | `/api/settings/season_champions` | strict value envelope; champion records; distinct teams; atomic awards | admin | successful command resets GraphQL store; failed command leaves it |
| `getWeightings` | `GET` | `/api/settings/position_weights` | allowlisted setting key | public | read; no invalidation |
| `setWeightings` | `PUT` | `/api/settings/position_weights` | strict value envelope; JSON object | super_admin | successful command resets GraphQL store; failed command leaves it |
| `getAdminList` | `GET` | `/api/roles` | fixed role projection | super_admin | read; no invalidation |
| `setAdminList` | `PUT` | `/api/roles` | strict UUID array <=100; existing accounts; dedup; atomic actor audit | super_admin | successful command resets GraphQL store; failed command leaves it |
| `getDiscordStatus` | `GET` | `/api/integrations/discord` | fixed configured boolean only | super_admin | read; no invalidation |

### Voting

| Helper / operation | Method | Endpoint | Validation / server ownership | Authorization | Cache effect |
| --- | --- | --- | --- | --- | --- |
| `listTotwPeriods` | `GET` | `/api/voting/periods` | fixed period projection | public | read; no invalidation |
| `createTotwPeriod` | `POST` | `/api/voting/periods` | strict periodInput; database-clock closing check | admin | successful command resets GraphQL store; failed command leaves it |
| `updateTotwPeriod` | `PATCH` | `/api/voting/periods/:id` | strict periodPatch | admin | successful command resets GraphQL store; failed command leaves it |
| `deleteTotwPeriod` | `DELETE` | `/api/voting/periods/:id` | string route param; canonical UUID guard | admin | successful command resets GraphQL store; failed command leaves it |
| `listTotwVotes` | `GET` | `/api/voting/periods/:id/votes` | period lookup; bound voter filter | member own votes while open; admin/closed visibility preserved | read; no invalidation |
| `submitTotwVotes` | `PUT` | `/api/voting/periods/:id/votes` | strict voteInput; locked period; clock/eligibility/position/self-vote checks | member; voter from verified actor | successful command resets GraphQL store; failed command leaves it |

### Fixed GraphQL reads

| Helper / operation | Method | Endpoint | Validation / server ownership | Authorization | Cache effect |
| --- | --- | --- | --- | --- | --- |
| `Standings` | `POST` | `/api/standings` | strict empty variables | public account/team visibility | Apollo cache-first; read does not invalidate; native refetch |
| `MemberLeagueData` | `POST` | `/api/dashboard` | strict empty variables | verified current-account actor; existing per-field visibility | Apollo cache-first; read does not invalidate; native refetch |
| `TeamRecords` | `POST` | `/api/team-records` | strict empty variables | public | Apollo cache-first; read does not invalidate; native refetch |
| `AccountMatches` | `POST` | `/api/account-matches` | declared id, first, after, season, opponent only; UUID; first 1..50/default 25; bounded filters/cursor | public account history | Apollo cache-first; read does not invalidate; native refetch |
| `AccountOpponents` | `POST` | `/api/account-opponents` | declared UUID id only | public account history | Apollo cache-first; read does not invalidate; native refetch |
| `AccountCardPreviews` | `POST` | `/api/account-card-previews` | strict empty variables | public synthetic preview accounts | Apollo cache-first; read does not invalidate; native refetch |
| `DefaultPositionWeights` | `POST` | `/api/default-position-weights` | strict empty variables | public defaults | Apollo cache-first; read does not invalidate; native refetch |

### Session and transport

| Helper / operation | Method | Endpoint | Validation / server ownership | Authorization | Cache effect |
| --- | --- | --- | --- | --- | --- |
| `getCurrent` | `GET` | `/api/users/me` | no user actor fields; authenticated actor lookup | signed-in; membership: false | session transition clears store; read no invalidation |
| `getCurrent provisioning` | `POST` | `/api/users/me` | strict empty body; server provisions verified identity | member | successful provisioning invalidates reads |
| `signInWithDiscord` | `POST` | `/auth/login/discord` | CSRF and limiter; fixed provider login redirect, ignores client returnTo | public login flow | redirect; no data cache |
| `signOut` | `POST` | `/auth/logout` | origin + signed CSRF; cookies cleared and upstream revocation attempted | session logout | clearStore/reset CSRF; broadcast session change |
| `csrfToken` | `GET` | `/auth/csrf` | IP/session binding and rate limit | public bootstrap | deduplicated bootstrap; no Apollo cache |
| `session refresh` | `POST` | `/auth/refresh` | sealed session cookie; CSRF; limiter; rotated provider credentials | session refresh | shared in-flight refresh; one original-request retry |

## Other web network paths inspected

- [web/server/proxy.ts](../web/server/proxy.ts): fixed configured HTTPS Lambda host; safe `/api` or `/auth` paths; strips spoofed/hop headers; signs upstream request; limits body, deadline and redirects.
- [web/vite.config.ts](../web/vite.config.ts): local API/Auth proxy; no arbitrary query execution.
- [web/src/components/PlayerCard.tsx](../web/src/components/PlayerCard.tsx): image fetches for PNG export; assets, not API/query endpoints.
- Discord callback navigation: `/auth/callback` validates transaction/PKCE and provider identity; outside explicit helper count.
- Vite hot-reload WebSocket: local development only; unrelated to API query transport.

## Source groups

- Route handlers: [accounts](../api/routes/accounts/routes.ts), [teams](../api/routes/teams/routes.ts), [matches](../api/routes/matches/routes.ts), [content](../api/routes/content/routes.ts), [admin](../api/routes/admin/routes.ts), [settings](../api/routes/settings/routes.ts), [voting](../api/routes/voting/routes.ts).
- Shared inputs: [pkgs/contracts/src/index.ts](../pkgs/contracts/src/index.ts).
- Global policy: [api/app.ts](../api/app.ts).
- Sessions: [api/plugins/auth/session.ts](../api/plugins/auth/session.ts).

## Final rubric review — 2026-10-16

- **PASS — Complete coverage:** all 73 baseline helper/callsites recorded above: 60 REST, 7 fixed reads, 6 session/transport. Asset downloads remain separate. Four existing unused exported REST helpers were inventoried rather than silently removed.

- **PASS — Server controls queries:** all 7 URLs resolve to generated API-owned ASTs. Strict outer/`variables` objects reject `query`, `operationName`, `extensions`, batches and extra `variables` before domain reads. GraphQL variable coercion retains defaults and scalar constraints. History resolvers retain UUID, cursor and bounds validation. No `/api/graphql` route exists; anonymous requests hit the existing global 401 guard, and authenticated test requests get 404. No test-only production bypass.

- **PASS — Authorization:** existing verified identity, active-session, live-role, membership and resource checks remain. Full disposable-PostgreSQL suite includes owner/nonowner/admin/super-admin behavior and restricted runtime database roles. Private `CurrentAccount` and public `Account` stay distinct Apollo entities. No policy/grant changes.

- **PASS — Response compatibility:** canonical documents retain selected fields, with generated `__typename` fields. Existing error mapping/status/`Retry-After`, nullable values, defaults and pagination remain. Tests exercise private-field omission and safe downstream errors.

- **PASS — Native React integration:** `ApolloProvider` owns one stable client; all 7 operations consumed through `useQuery/useLazyQuery` (lazy only for genuinely deferred default weights). Existing pure mappers remain at display boundaries. REST writes remain REST; `useResource` remains for REST consumers.

- **PASS — Cache-first:** completed results and concurrent requests reuse native Apollo cache/deduplication. No 30 second TTL or 32 entry wipe remains. Explicit refetch is a one-shot network read; later visits remain `cache-first`.

- **PASS — Cache correctness:** link validates existing opaque JSON before forwarding original data/metadata to Apollo. Failed REST commands leave cache intact. Successful commands await `resetStore`; its refetch errors are presented by subscribers without turning the successful command into a failure. Tests cover malformed data, overlapping writes and late pre-write responses.

- **PASS — Session isolation:** native `clearStore` cancels pending work; departing observable queries are stopped first so queued `resetStore` stages cannot restart them. `App` invalidates pending session loads across logout/account/cross-tab changes. Browser verifies delayed history and delayed session reads cannot restore the departing account.

- **PASS — Simplicity:** custom GraphQL loader/freshness module removed, no dependency or query-registration framework added, redundant hook loading state/manual reloads removed. Stable client plus native cache lifecycle APIs. Schema, migrations, package files, environment, deployment and sequential CI unchanged.

- **PASS — Evidence:** generation, freshness, all workspace types, lint, integration tests, builds, packaged Lambda and browser checks passed as detailed below.

## Independent review and corrections

Implementation delegated to the explicitly requested GPT-6.1 Sol agent using Ponytail and Ripwire. Parent independently inspected routing/codegen/transport/cache/callers and verified the browser. Final review found and corrected:

1. Weight defaults errors were hidden or unhandled: existing error UI now displays them and allows retry.

2. Queued mutation `resetStore` could refetch after an identity clear: stop departing native observable queries before `clearStore`. Three regression cases cover one/two queued resets and an in-flight refetch; stable-client resubscription still works.

3. A session read started during pending logout could restore the old user: shared session version invalidates it when logout completes. Actual `App` browser race and failed-logout recovery passed.

No remaining confirmed defect found in the reviewed paths. No new SQL injection or authorization bypass asserted.

Ripwire explore/caller inspection, edit_check and final quality_delta completed. edit_check reports no incompatible `App`/`resetClient` callers. quality_delta flags are not claimed as a clean zero: 53 heuristic findings, primarily recent churn/generated declarations, existing large UI functions, repeated small schema decoders, and caught refetch promises. Reviewed these in context: hook error UI handles rejected refetches, decoder reuse avoids introducing a generic wrapper, and error/loading branches are needed. No additional concrete correctness failure found from those flags.

## Verification

- Prisma generation: pass.
- GraphQL freshness: pass, both browser and server generated output.
- Workspace type checks: pass.
- Full ESLint with zero warnings: pass.
- Disposable PostgreSQL integration run: 139 API tests passed, 0 failed, 0 skipped.
- Final web suite after session-race corrections: 84 tests passed, 0 failed, 0 skipped.
- Packaged Lambda checks: 2 passed, including loading ZIP outside repository and denying direct untrusted calls before upstream access.
- Total final suite coverage: 225 tests passed across the above runs. The full integration command initially passed 222; only frontend session fixes followed, and its web suite was rerun to 84.
- API ZIP, web production bundle and server-only proxy build: pass. Existing Rollup dependency annotation/dynamic import/chunk-size warnings remain nonfatal.
- Local Compose images rebuilt and healthy; existing database volume retained.
- `git diff --check`: pass.

## Browser evidence

### Local Compose app

Actual local Compose app, isolated fresh Chromium, development StrictMode:

- Initial load: 4 first-party requests = 2 GET `/api/users/me` + 1 GET `/auth/csrf` + 1 POST `/api/standings`.
- `Standings` POST body exactly `{"variables":{}}`; no `query` or `operationName` transmitted.
- Open Schedule: 4 existing REST requests = 2 GET `/api/schedule` + 2 GET `/api/teams`. No `/api/team-records` request: Apollo reused the root `teamRecords` field already read by `Standings`.
- Return to `Standings`: 0 requests.
- Client query override: 400 invalid_request. Removed generic endpoint: 401 at existing anonymous authentication guard; fixed-route integration independently verifies 404 with authenticated request.
- No browser page errors.

### Synthetic member/session browser fixtures

Separate actual React browser run with synthetic member/session HTTP fixtures (no real account changed):

- Initial dashboard: 1 fixed read. Initial match history: 1 fixed read. Card→history revisit: 0 additional history reads.
- Changed season triggers 1 read; forced failure followed by Retry triggers 1 fresh read. Next revisit adds 0 reads.
- Account switch loads fresh dashboard/history for Bob; Alice absent.
- Delayed history response after logout ignored.
- Old session GET response started during pending logout cannot restore Alice after logout completes.
- Failed logout shows error; retry/reload recovers Bob's valid session.
- All fixed request bodies contain only `variables`. No unexpected first-party fixture endpoints or page errors.

### Local browser evidence artifacts

These are local artifacts recorded by the original review:

- `/private/tmp/napl-fixed-browser-results.json`
- `/private/tmp/napl-fixed-browser-session-results.json`
- `/private/tmp/napl-fixed-browser.mjs`
- `/private/tmp/napl-fixed-browser-session.mjs`

## Change size

Implementation working tree versus Git HEAD at verification (includes earlier named-endpoint edits and excludes this Markdown conversion):

- **Handwritten source:** +404/-426, net 22 lines removed. Includes moving 152 canonical GraphQL lines from web to API.
- **Generated:** +25/-20. New server AST file is 5 lines but 27,546 bytes; generated output is reported separately.
- **Tests:** +461/-291.
- **Docs:** +52/-56; existing diagram PNG regenerated and visually verified.

These figures count moved GraphQL files as deletions and additions. GitHub's rename detection can show smaller totals for the same changes.

Unrelated preexisting .agents/, .autohand/, AGENTS.md and skills-lock.json excluded. No package/dependency/lockfile/schema/migration/CI/deployment changes.

## Limits and remaining behavior

Existing REST hooks still repeat some reads under development StrictMode and may fetch teams already present in a GraphQL read. REST caching/consolidation is outside this implementation's agreed migration scope.

Other users' changes appear on explicit refresh/page reload; there is no polling timer, subscription transport or server push.

Authenticated browser lifecycle checks used synthetic fixtures; real authentication/authorization was covered by the existing API integration suite, not a fresh Discord consent flow or production account.

At the time of the original review, no production deployment, merge or remote PR action had been performed.
