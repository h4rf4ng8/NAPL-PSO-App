Component browser fixture uses synthetic data and the real production components. No account, database, or authentication is required.

From the repository root, use Node 24 and pnpm 10.15.1:

```sh
env PATH=/opt/homebrew/opt/node@24/bin:$PATH COREPACK_ENABLE_NETWORK=0 pnpm --filter @napl/web dev
```

Open `http://localhost:5173/test/browser/index.html`. The fixture runs React StrictMode and loads the same fonts as the app.

- Toggle Theme to compare light and dark styling.
- Open team details, then Choose lineup player. Tab and Shift+Tab stay inside the top dialog; Escape closes it and restores focus to its opener. Close all dialogs restores page scrolling.
- ModalShell closes with its close button or Escape; its backdrop stays open. Shareable card also closes on backdrop click. Mandatory onboarding ignores Escape; Complete onboarding closes it. Reload after inspecting the empty dialog.
- Large cards flip with click, Enter, or Space. Smaller cards remain display-only.
- Export actual card PNG shows its byte count, dimensions, and preview. The front exports at 960×1530 even when the large card is flipped.
- Browser focus and scroll status reports focus, scroll lock, and active dialog count. The callback version controls check that Escape uses the latest callback.

The temporary original-component comparison and 60-case exact normalized SVG parity script are archived outside the repository in `/private/tmp/napl-component-browser-baseline`, with restoration instructions.

Automated browser checks run with `pnpm --filter @napl/web exec playwright test` after `pnpm --filter @napl/web exec playwright install chromium webkit`. The configuration starts Vite on port 4174 with synthetic public settings. It checks Chromium and WebKit at 1440px and 390px, plus destination, administration, navigation, and recovery states at 320px, 768px, 1024px and 1280px in Chromium. A desktop Chromium test also resizes across the 1023/1024px global navigation and 1279/1280px administration boundaries. Artifacts are written to `web/test-results` and `web/playwright-report`.

`transport.ts` intercepts the real application's HTTP requests and seeds synthetic visitor/member/captain/admin sessions. It blocks external requests, serves synthetic league data, and records unexpected requests. Default runs use a small placeholder image and system font fallbacks. Set `BROWSER_ASSET_CACHE` to a local directory of the original content-addressed `<sha256>.bin` assets for visual comparison with production artwork and fonts. No credentials or hosted database are needed.

The suite mounts the production App or a narrow production-component harness and runs the actual Supabase SDK, Apollo client, Radix portals, and HTTP request layer. It does not mock UI primitives. `tsconfig.browser.json` typechecks fixtures/configuration independently of the application build. Run `pnpm --filter @napl/web exec tsc -p tsconfig.browser.json`.

The renderer cases below were moved because React Test Renderer has no browser DOM for Radix focus scopes, portals, Select or Command. Their business assertions are retained in real-browser tests:

| Former renderer file | Browser replacement and retained assertions |
| --- | --- |
| `auth.test.ts` (mounted App cases only) | `auth-regressions.spec.ts`: independent Home reads, overview errors, revisit refresh counts, SDK cross-tab logout, token renewal/cache retention, stale account loads, pending refresh/revocation, old-account mutation guard. Pure SDK/OAuth tests remain in Node. |
| `team-editor.test.ts` | `team-regressions.spec.ts`: reads every editor page, preserves all 35 exclusions, omits unchanged logo/lineup/formation, requires a logo. |
| `team-payload.test.ts` | `team-regressions.spec.ts`, `player-regressions.spec.ts`, `settings-regressions.spec.ts`: complete-roster guard/retry, descriptor privacy, cursor reset, off-page selections, page-two review, generation, membership and championship payloads. |
| `article-editor.test.ts` | `form-regressions.spec.ts`: unchanged expired/protected cover is omitted, removed cover is null, no image import. |
| `import-payload.test.ts` | `form-regressions.spec.ts`: uploaded-ID lookups only, lookup pagination, off-page manual mapping, long indexed skipped names, one exact import write. |
| `home-links.test.ts` | `content-regressions.spec.ts`: lazily reads original Steam URL, preserves locked Strikers ID, writes original/replacement URLs; failed refresh after a successful write retries only the read. |
| `payload-views.test.ts` | `pagination.spec.ts`: 50-row leaderboard pages retain server ranking across bounded response chunks, season/position changes reset cursors, and failed/stale continuations retry from a fresh first page. |
| `public-league.test.ts` | `navigation.spec.ts`, `destinations.spec.ts`, `content-regressions.spec.ts`: exactly six public links, public destinations without private queries, schedule hides retained private records after account removal. |
| `admin-payload.test.ts` | `settings-regressions.spec.ts`: complete fresh role snapshot only on explicit write, off-page assignments preserved, failed fresh reads block writes, newly protected super-admin cannot be removed. |
| `dialog.test.ts` (removed in shared layer) | `components.spec.ts`: StrictMode, nested focus/scroll, latest callback, simultaneous unmount, empty mandatory dialog, editor/mandatory/share outside rules, 360px share layout, actual front-facing 960×1530 PNG export. |

`destinations.spec.ts` captures each member/public destination in both browser engines. Member and super-admin suites audit light/dark themes with axe WCAG A/AA checks, page-overflow assertions, and header-title/control overlap checks. The opened account menu, mobile navigation, roster and nested lineup picker, import mapping/confirmation/receipt, and team/match editors receive the same audits.

Additional regressions cover 105 players displayed as 50/50/5 despite 17-row transport chunks, REST player pagination, non-advancing cursors, stale-cursor recovery and keyboard tooltips. `states.spec.ts` exercises loading, failure, retry and empty states, plus successful team writes whose subsequent refresh fails. `seasons.spec.ts` checks stale season metrics disappear and player-card dialogs remain mounted through loading. `settings-followup.spec.ts` checks position and award receipts survive failed refreshes without duplicate writes. Voting success remains visible through Apollo cache reset; delayed team/match reads cannot retarget an editor after a filter change.

These automated checks and visual/keyboard reviews complement each other; they do not establish complete accessibility compliance.
