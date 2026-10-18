# Shared components refactor review

The shared components now have separate owners for card rendering, card export/sharing, dialogs, display widgets, branding, and dashboard data. The API continues to own rankings and league rules. No API, authentication, database, or dependency changes were made.

Review status: all eight rubric areas pass within the scope below. Actual Chrome comparisons against the original components cover card variants and share modal CSS in light and dark themes; this is not a cross-browser compatibility claim. The native operating system share sheet remains unverified and outside the controlled test scope.

Production source changes by **+1,061 / −1,193 lines, net −132**. This counts every tracked edit and new file under `web/src`, including CSS; it excludes tests, documentation, and `AGENTS.md`.

| Rubric area | Status | Evidence and limits |
| --- | --- | --- |
| Modularity | PASS | Every resulting production code file is at most 250 normally formatted lines; asset data is separate. Rendering, export, dialogs, branding, and dashboard requests have distinct owners. Responsibility counts are below. |
| DRY and simplicity | PASS | Four award icons share one SVG shell and gold gradient with instance IDs. Captain markers, artwork, PNG conversion, and dialog lifecycle each have one production owner. Complete frontend source diff is net negative, including new files and CSS. |
| Visual compatibility | PASS | Actual Chrome baseline/current comparison matches all four tiers and variants; 60 normalized SVG cases pass. Original/current share modals match in light and dark themes, including cards, action spacing, colors, and backdrop. |
| Interaction and accessibility | PASS | Mounted tests and actual Chrome verify large-card click/Enter/Space flipping and face visibility, nested dialog reverse Tab/Tab, Escape focus return, updated close callback, and restored scroll. Mandatory dialogs ignore Escape and restore focus after completion. Ref forwarding and ARIA behavior are retained. |
| Export correctness | PASS | Actual Chrome export from a flipped large card produces a front-facing PNG, 960 × 1530, MIME `image/png`, 1,417,382 bytes. Tests cover a single PNG conversion shared by native-share/download fallback paths, cleanup, failure, and close/unmount handling. Native OS share-sheet interaction is unverified. Exported PNGs use fallback fonts, a pre-existing limitation. |
| Data boundaries | PASS | Server ranking/card cells remain canonical. Tier preview uses Apollo reads; saved weightings retain REST. Mounted real-client transport tests verify saved values, defaults only after confirmed null, no defaults on REST failure, retry recovery, and loading/error display. |
| Imports and compatibility | PASS | Callers import directly from the owning module. PlayerCard's recursive runtime dependency closure contains no Apollo or feature API module. Web typecheck and dependency-cruiser pass with zero boundary errors; eight existing cycle warnings are unchanged. |
| Review quality | PASS | Root reviewer read every production line and connected caller diff; independent Icons/Display/Branding review found no actionable defect. Ponytail simplicity guidance and the pinned Brooks advisory review were applied alongside typecheck, ESLint, tests, asset/geometry parity, and actual Chrome checks. |

## Technical evidence appendix

### Responsibilities and line counts

Counts include blank lines and comments. The two image data declarations are exempt from the code-file line limit.

| File | Responsibility | Lines |
| --- | --- | ---: |
| `web/src/components/PlayerCard.tsx` | Public card/ref interface and flip state | 52 |
| `web/src/components/player-card/CardFront.tsx` | Front SVG artwork and supplied display data | 167 |
| `web/src/components/player-card/CardBack.tsx` | Back SVG artwork, supplied trophies, and join date | 80 |
| `web/src/components/player-card/artwork.tsx` | Shared tier material artwork | 80 |
| `web/src/components/ShareableCardModal.tsx` | Sharing UI and operation lifetime | 136 |
| `web/src/components/player-card-image.ts` | Front SVG to PNG and download lifecycle | 103 |
| `web/src/components/Dialog.tsx` | Dialog stack, focus, keyboard, and scroll lifecycle | 93 |
| `web/src/components/Display.tsx` | Nine presentational display widgets | 151 |
| `web/src/components/Icons.tsx` | Award metadata/icons, trophy, captain badge | 155 |
| `web/src/components/Branding.tsx` | Crest and full league branding | 22 |
| `web/src/assets/asl-logos.ts` | Two unchanged encoded image declarations | 3 |
| `web/src/features/dashboard/TierPreview.tsx` | Preview and public weightings requests/display | 136 |
| `web/src/utils/rankings.ts` | Display tier lookup and server-supplied card cells | 33 |
| `web/src/styles/components/cards.css` | Existing card presentation and export rules | 33 |
| `web/src/styles/components/dialogs.css` | Dialog/share presentation rules | 16 |

Before extraction, `PlayerCard.tsx` had 809 lines, `Icons.tsx` 189, `Ui.tsx` 233, and `rankings.ts` 133. The aggregate source accounting includes the extracted files rather than treating their removal from the old files as savings. Snapshot evidence and the repeatable calculation are in `/private/tmp/napl-frontend-loc-evidence.json` and `/private/tmp/frontend-loc-review.cjs`.

### Parity and imports

Both entire encoded data URLs are byte-for-byte identical to HEAD. `ASL_LOGO_SRC` is 99,006 encoded bytes / 74,236 decoded bytes; `ASL_LOGO_DIAMOND` is 33,686 / 25,246. Decoded SHA-256 values:

- `ASL_LOGO_SRC`: `821ed843faad56ae844a6da3bfc551ea7a6c8ccb4cd0883ab24342a7fcff81a7`
- `ASL_LOGO_DIAMOND`: `b1bd70b6215b0fc657e2c1d3f9b8e57deda43b6c2ac6fdf5d325f563465b025c`

All nine Display declarations exactly match their original Ui declaration source. A TypeScript AST comparison preserves all 26 award/trophy shapes and their non-fill attributes; gradient references now resolve to a unique local ID per instance. Unknown awards still render null and existing defaults remain covered.

Declaration extraction used TypeScript syntax nodes. One tested TypeScript import codemod updated 23 caller files; its self-check covers split named imports, aliases, inline type imports, original fixture destinations, and idempotence. Private tooling: `/private/tmp/icons-refactor.cjs`, `/private/tmp/component-imports.cjs`, and `/private/tmp/icons-parity.cjs`.

### Automated checks

The requested final automated batch used Node 24.22.0 and pnpm 10.15.1:

| Check | Result | Local log |
| --- | --- | --- |
| Generated GraphQL documents check | Exit 0 | `/private/tmp/napl-final-gql.log` |
| Web TypeScript application/server checks after cleanup | Exit 0 | `/private/tmp/napl-final-typecheck.log` |
| Root ESLint, zero warnings | Exit 0 | `/private/tmp/napl-final-lint.log` |
| Full web tests after cleanup | 114 passed, 0 failed/skipped; exit 0 | `/private/tmp/napl-final-test.log` |
| Production build, including server-only proxy bundle | Exit 0 | `/private/tmp/napl-final-build.log` |
| Dependency-cruiser current boundary rules | 0 errors; 8 existing cycle warnings, identical cycle edge list | `/private/tmp/napl-dependency-audit/refactor-web-depcruise.json` |

The final lint, typecheck, test, and build batch passed after cleanup. The build retains known chunk-size, dynamic-import, and Zod annotation warnings; these were reviewed and are advisory rather than automatic failures.

Dependency evidence, including the recursively checked PlayerCard runtime closure, is in `/private/tmp/napl-dependency-audit/refactor-evidence.json`. Tests cover mounted behavior and real Apollo gateway/fetch transport, not merely mocked hook return values. The browser evidence above was observed in actual Chrome; native OS sharing and other browsers were not claimed as verified.

### Advisory review

Applied [Brooks PR Review at the pinned revision](https://github.com/hyhmrright/brooks-lint/blob/c85f65eada5c56721275ef89e2dd41ac453dcba2/skills/brooks-review/SKILL.md), using the local checkout at `/private/tmp/napl-brooks-lint-review`, with Ponytail guidance. The root review covered all production lines and connected callers; the independent bounded review covered Icons, Display, Branding, and their imports/props. **Brooks PR Review score: 100/100**, with no concrete remaining correctness or complexity finding identified in that scope. The review record is appended to `.brooks-lint-history.json`. This advisory result does not replace the automated or browser checks.

The final Ripwire `quality_delta` reported 35 advisory findings: 30 new-symbol metric/JSX false positives and five churn findings around award metadata and `cardTier`. Review found no copied production implementations. Dialog callers are real; fixture callbacks and injected DOM fakes are invoked by their tests. Added dialog lifecycle complexity addresses the demonstrated nested-dialog bug, while export cancellation handles close/unmount requirements. Extracted SVG components remain linear and no longer than 167 lines. These tool advisories were checked against actual definitions, callers, and behavior rather than treated as automatic pass/fail criteria.
