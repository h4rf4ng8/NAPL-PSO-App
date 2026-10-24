# ASL UI migration

The frontend uses the New York shadcn/ui components from `shadcn@2.3.0`, pinned to upstream commit `c8c4027b6b192822ea2952b225ee4760cddedf0d`. React 18, Vite 6, Tailwind 3 and the existing Apollo/REST transport remain in place. Component provenance and local adaptations are recorded beside the primitives.

## Design

Application surfaces use semantic HSL variables with a light slate/blue theme and a dark navy/blue theme. Gold identifies achievements. The application uses readable sans-serif typography; collectible card SVGs keep their explicit fonts and colors so PNG export remains independent of the page theme.

Desktop navigation uses a 256px sidebar at 1024px and above. Smaller viewports use a Sheet. Admin section navigation becomes a vertical rail at 1280px; narrower screens use a Select. Tables scroll inside their own containers. Form controls and icon actions have 44px touch targets.

## Migration evidence

| Batch | Existing behavior | Change | Parity check |
| --- | --- | --- | --- |
| Foundation | React 18/Tailwind 3 feature screens and custom UI; no browser automation | Add pinned shadcn primitives, semantic tokens, tested mechanical migration, browser fixtures and dependency boundaries | Existing 152 web tests, TypeScript, production build; primitive compilation and codemod cases |
| Navigation | Separate public buttons and member header, moving ticker and custom responsive chrome | One role-aware sidebar/Sheet shell, hash navigation, static announcement and account menu | Navigation round trips, public defaults/protected paths; browser fixtures cover private-query guards and mobile focus |

The removed `Header.tsx` had one production caller (`Dashboard`); its navigation, season, theme, account and Discord actions now live in the shell. `chrome.css` was consumed only by the replaced header/public markup. The unused `pitch-bg` and `crest-shape` selectors had no callers; `pitch-lines` remains for the existing Home artwork. Auth/session effects and server query payloads remain in their original owners.

Before removing a helper, inspect both definitions and callers. Keep data loading, command contracts, protected media, image export, roster completeness, paginated selections and server-owned ranking logic. Mechanical edits across multiple files use the tested migration script; domain-specific changes are reviewed separately.

## Validation

Use Node 24 and pnpm 10.15.1. Browser fixtures intercept API and image requests and must never contact hosted services. Run `pnpm --filter @napl/web test:browser` for Chromium/WebKit behavior and accessibility checks, and `pnpm check:dependencies` for structural boundaries. Real portal behavior belongs in browser tests; domain and transport tests retain their existing Node runner.

The pre-migration baseline passes frontend typecheck and all 152 web tests. The production build passes with CI's public environment placeholders. Existing Zod annotation, mixed import and bundle-size warnings are baseline warnings, not new validation failures.

Implementation is delivered as a gh-stack chain rooted on `staging`, grouped by shared foundation and feature/domain. Each layer is reviewed against its direct parent. The existing staging-to-main stack remains separate.
