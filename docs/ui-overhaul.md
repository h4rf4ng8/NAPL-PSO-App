# ASL frontend overhaul

The frontend uses the official New York shadcn/ui sources from `shadcn@2.3.0`, pinned to upstream commit `c8c4027b6b192822ea2952b225ee4760cddedf0d`. React 18, Vite 6, Tailwind 3, Apollo and bearer-token authentication remain in place. Dependencies were installed with pnpm and exact versions; compatible registry sources were vendored from that revision. See [provenance and adaptations](../web/src/components/ui/README.md).

## Design and components

Semantic HSL variables provide slate/blue light and navy/blue dark themes with restrained gold. `asl_theme` applies before React renders, defaults to light and tolerates blocked storage. Rajdhani provides application typography and Anton the ASL wordmark. Collectible SVGs retain explicit fonts/colors for detached export. The subtle pitch-inspired background adds atmosphere without decorative panels.

The shell uses a 256px Sidebar at 1024px and a Sheet below it. The admin rail appears at 1280px; narrower screens use a labeled Select. Public/member navigation shares existing hash URLs, article slugs and back/forward, including the public `stats` alias. Protected public links explain sign-in without starting private queries. A static announcement replaces the ticker.

Home keeps ASL branding, one player-card action, four player statistics, three recent player matches, the latest league result and announcements visible. Profile editing and secondary league summaries are collapsible. Other pages use open sections; Cards group interactive records/forms rather than boxing every statistic.

| Responsibility | Components |
| --- | --- |
| Navigation/disclosure | Sidebar, Sheet, DropdownMenu, Tabs, Accordion, Collapsible, Separator, ScrollArea |
| Forms/filtering | Button, Input, Label, Textarea, Select, Checkbox, RadioGroup, Switch, Slider |
| Remote choices | Popover + Command with local filtering disabled and off-page selections retained |
| Information/feedback | Table, Pagination, Badge, Avatar, Card, AspectRatio, Progress, Tooltip, Skeleton, Alert, Sonner |
| Editors/confirmations | Dialog and AlertDialog with controlled state and Radix focus/dismissal |

Tables scroll in labeled keyboard-focusable containers. Header Buttons expose sorting and abbreviation Tooltips. Touch controls are at least 44px. Dialogs fit and scroll within the viewport; editors ignore outside clicks, shares permit them, and onboarding blocks dismissal. Sheet/accordion transitions and keyboard-operated card flipping respect reduced motion.

## Feature coverage and migration evidence

Features retain data ownership, validation and command payloads. No database migration or public contract change is required.

| Layer | Previous behavior → structural change | Smallest meaningful parity check |
| --- | --- | --- |
| Foundation | Custom styling → pinned primitives, tokens, aliases and dependency rules | Compilation, tested/idempotent codemods, dependency boundaries |
| Shared interactions | Custom dialog stack/repeated controls → Radix overlays, paging/feedback, stable async details | Nested focus, Escape/outside policy, opener/scroll restoration, loading-to-detail lifecycle |
| Navigation | Separate public/member chrome → role-aware Sidebar/Sheet, account menu and static news | Public defaults/protected URLs, hash/back/forward, account switches, mobile focus |
| Players | My Card, Stats, Tier Preview, position/image editors, directory/moderation → shadcn controls around artwork | Server order/filter/season, 50-player pages, off-page choices, moderation, keyboard flip, front-only 960×1530 PNG |
| Teams | Browsing, invitations, submission, lineup, transfers, admin review → responsive records, selectors and dialogs | Complete roster gate, cancel/remap/swap, full editor details, payloads and write/refresh distinction |
| Matches | Schedule/generation, standings, imports, Match Log → Slider, fixtures, Tables and grouped forms | Canonical ranks, season/week resets, generation preview, supported statuses, uploaded-ID lookup and exact import counts |
| Content | Home, News, Articles, Rules, Hall of Fame → compact sections, reading views and independent histories | Visible Home activity, independent failures, profile restrictions, safe markdown, article URLs/404, lazy text and award seasons |
| Voting | Ballots/TOTW admin → candidate choices, period summaries and confirmations | Previous ballot, configured positions, off-page choices, closed/no-period states and exact writes |
| League settings | Awards/championships, seasons, weights → focused editors and replacement confirmations | Complete fresh snapshots, off-page history, refresh-only retry, draft weight reset and totals |
| Access settings | Admin assignments/Discord → guarded role controls and read-only status | Fresh complete snapshot before writes, protected super-admins, failure/loading guards |
| Validation | Fake renderer lacked portals/focus → isolated production-component browser fixtures | Roles, states, navigation, overlays, payloads, responsive layout and accessibility |
| Cleanup | Mutable palette/superseded CSS → remove proven-dead definitions, update guides/CI | Callers checked; theme tests, lint/types/build, dependency/browser checks |

Stats and account selectors show up to **50 players per page**. The server also caps response bytes, so `first: 50` alone can return fewer. Stats collects remaining chunks with Apollo `fetchMore`; account selectors use bounded collection in the existing REST hook. Both preserve server order/counts/cursors and reject stalled cursors. Filters reset paging; Retry restarts an expired Stats snapshot. No table engine, form framework, router or state library was added.

Writes disable duplicates and retain failed drafts. Completed writes keep their receipt if refresh fails; Retry performs the read again. Late responses cannot replace a newer editor record. The shell retains a valid overview only within its current account/season scope, preventing refresh from unmounting active editors or hiding receipts.

### Deletion evidence

- `Header.tsx` had one production caller, `Dashboard`; navigation/theme/season/account/Discord moved into the shell. `chrome.css` served that replaced markup.
- All custom dialog-stack consumers migrated before removing listeners/focus trapping. Browser tests cover those contracts. The legacy `Dialog` adapter had no remaining production callers; the browser harness migrated to `ModalShell` before the adapter was removed; `ModalShell` remains the small controlled Radix boundary.
- `C`, `LIGHT_PALETTE`, `DARK_PALETTE` and palette mutation had no production callers after migration. Theme storage/document application remain. Artwork retains explicit SVG attributes.
- Legacy `tokens.css`, `dialogs.css`, `motion.css` and imports were removed after selector checks. Formation hover popups, team-card styles and unused pitch selectors had no consumers. Live slot stacking, card flipping and reduced-motion rules remain.
- `ArticleCard` had only the old fixture as a caller after News/Articles migrated; the helper and obsolete fixture case were removed together.
- Fake-renderer portal cases moved to Playwright with business assertions retained. [Browser test mapping](../web/test/browser/README.md) records replacements. Domain, transport, pagination, authentication, parsing and export tests remain in Node.

Identical edits across more than two files use tested migration scripts. Feature state/commands were reviewed manually. Dependency-cruiser rejects frontend/server boundary violations, feature imports from UI primitives and new cycles; three existing API-client/auth cycles are explicitly baselined.

## Validation and review

Use Node 24 and pnpm 10.15.1. The [root](../README.md) and [frontend](../web/README.md) guides cover setup. Browser fixtures start isolated Vite on 4174, intercept transport and reject unhandled external requests. Synthetic sessions exercise the actual SDK, Apollo, HTTP client and production components without hosted writes. Optional locally cached artwork supports visual inspection; CI has portable image/font fallbacks.

`pnpm run check` runs generation/freshness, app/browser types, dependencies, ESLint, unit tests, builds and browser tests. `pnpm run test:integration` adds disposable PostgreSQL and finished Lambda-package checks. Builds require documented public environment variables. Browser projects/state coverage are documented beside fixtures.

The pre-migration frontend baseline passed 152 tests, typecheck and production build. Existing warnings concern Zod annotation placement, mixed static/dynamic API imports and the large application chunk. Radix adds interaction code; executed results and bundle measurements are recorded in PRs.

The pinned [Brooks review skill](https://github.com/hyhmrright/brooks-lint/blob/c85f65eada5c56721275ef89e2dd41ac453dcba2/skills/brooks-review/SKILL.md) complements ESLint and executable checks. Review findings included expired Stats cursors, completed-write/failed-refresh handling, mobile header crowding and lineup accessibility; fixes belong to their feature layers.

### Executed checks

The integrated application was checked with Node 24 and pnpm 10.15.1 on October 23, 2026:

| Check | Result |
| --- | --- |
| GraphQL freshness, workspace types and browser-fixture types | Passed |
| ESLint | Passed with zero warnings |
| Dependency boundaries | Passed: 184 modules, 981 dependencies; three pre-existing cycles baselined |
| Disposable integration | Passed: 135 frontend, 199 API, 21 migration and 4 packaged-Lambda tests; zero skipped |
| Browser matrix | All 329 cases passed across eight Chromium/WebKit projects; zero skipped |
| Portable browser fixtures | 14/14 Chromium checks passed at 320px without cached artwork or fonts |
| SAM templates | Both passed lint |
| Production workspace builds | Passed with documented public environment placeholders |

Each intermediate PR also passed its frontend Node suite: foundation 161, shared interactions 146, navigation 138, players/teams/matches 137 each, content/voting/league settings 136 each, and access/validation/cleanup 135 each. Counts decrease as portal-dependent renderer cases move into the browser suite; the mapping above preserves their business assertions.

The full browser run passed 328 cases; one mobile admin traversal was interrupted by a simultaneous contracts rebuild triggering Vite's full reload. That unchanged case passed separately after the build finished, completing all 329 cases without retries or test changes. The matrix covers 320, 390, 768, 1024, 1280 and 1440px plus both sides of the navigation breakpoints. Visual inspection covered each destination and admin section, including mobile and dark layouts, alongside keyboard, overflow and axe checks.

The final frontend build contains 1,291.78 kB of JavaScript (362.81 kB gzip) and 58.49 kB of CSS (10.94 kB gzip). The pre-existing annotation, mixed-import and large-chunk warnings remain. The local disposable PostgreSQL run used a 1 GiB tmpfs because the Docker VM's persistent disk was full; it passed without changing repository test scripts or existing containers.

Fixtures isolate external requests and do not verify the hosted OAuth provider. Automated accessibility checks cover the exercised states and complement visual/keyboard review; they do not establish complete accessibility compliance.

Delivery uses a `gh stack` chain rooted on `staging`, grouped by domain. Each PR compares against its direct parent. The existing staging-to-main stack remains separate. Merging and deployment are separate actions.
