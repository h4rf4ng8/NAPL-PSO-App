# shadcn/ui components

These components are the official **New York, React 18 / Tailwind CSS 3** sources from [`shadcn@2.3.0`](https://github.com/shadcn-ui/ui/tree/shadcn%402.3.0), pinned to commit **`c8c4027b6b192822ea2952b225ee4760cddedf0d`**. The annotated tag object is `3261e791d05de0f9c55fb997275e6e68258c17da`.

Source: [`apps/www/registry/new-york/ui`](https://github.com/shadcn-ui/ui/tree/c8c4027b6b192822ea2952b225ee4760cddedf0d/apps/www/registry/new-york/ui). `use-mobile.tsx` comes from the adjacent `hooks` directory; `../../lib/utils.ts` retains only `cn` from `apps/www/lib/utils.ts`. The upstream MIT license is preserved in [LICENSE.md](LICENSE.md).

## Project adaptations

- Registry aliases become relative imports so Vite and Node component tests use the same source. The import conversion was checked against fixtures and for idempotence before applying.
- Buttons, inputs, select triggers, tabs and menu rows have at least 44px touch targets. Buttons default to `type="button"`; forms explicitly request `type="submit"`. `asChild` retains the child element's semantics.
- Dialogs and alert dialogs have viewport margins and a scrollable `100dvh` height limit. DialogContent accepts `showCloseButton={false}` for mandatory onboarding; consumers also control Escape and outside interaction. Dialog and sheet close buttons have 44px targets.
- Sidebar switches to its mobile sheet below 1024px, uses 256px desktop / 288px mobile widths, and bounds the sheet to the viewport. React state controls expansion; the upstream write-only cookie was removed.
- Sidebar's mobile sheet and CommandDialog include screen-reader titles and descriptions. Other dialog consumers must supply a meaningful title and description.
- Progress forwards its value to Radix so its accessibility value matches the visual indicator. Alert element refs match their rendered DOM elements.
- Sonner receives its theme through its existing `theme` prop. It does not install or import Next.js theme infrastructure.
- Browser event calls and early-return style follow project ESLint rules. No lint exclusions were added for this directory.

Keep application data loading, authorization, validation, and league rules in their existing owners. These files supply UI primitives only. Retain the pinned compatibility line when refreshing upstream sources; current Tailwind CSS 4 / React 19 registry files are not drop-in replacements.
