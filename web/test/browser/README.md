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

Automated browser checks run with `pnpm --filter @napl/web exec playwright test` after `pnpm --filter @napl/web exec playwright install chromium webkit`. The configuration starts Vite on port 4174 with synthetic public settings. It checks desktop and mobile Chromium and WebKit; artifacts are written to `web/test-results` and `web/playwright-report`.

`transport.ts` intercepts the real application's HTTP requests and seeds synthetic visitor/member/captain/admin sessions. It blocks external requests, serves synthetic league data, and records unexpected requests. Default runs use a small placeholder image and system font fallbacks. Set `BROWSER_ASSET_CACHE` to a local directory of the original content-addressed `<sha256>.bin` assets for visual comparison with production artwork and fonts. No credentials or hosted database are needed.
