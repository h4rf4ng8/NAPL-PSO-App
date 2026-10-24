# Frontend visual review

These captures use synthetic accounts and league data with the real production components and cached ASL artwork. They contain no member data. The before captures use the pre-migration implementation; after captures show the integrated redesign. Browser checks also retain screenshots/traces as CI artifacts. Human inspection covered every destination and admin section, including mobile, dark themes and representative overlays.

| Surface | Before | After |
| --- | --- | --- |
| Home, desktop | [Original](home-before-desktop.png) | [Compact dashboard](home-after-desktop.png) |
| Home, mobile | — | [Visible player statistics and activity](home-after-mobile.png) |
| Stats, desktop | [Original](stats-before-desktop.png) | [shadcn Table](stats-after-desktop.png) |
| Stats, mobile | — | [Locally scrolling table](stats-after-mobile.png) |
| Captain lineup, mobile dark | — | [Formation editor](lineup-after-mobile-dark.png) |
| Admin Rules, 320px | — | [Title above actions](rules-after-mobile.png) |

Fixtures deliberately contain few rows for readable screenshots. A separate 105-player regression verifies 50/50/5 logical pages when the server transport returns only 17 rows at a time. Synthetic fixtures do not substitute for live OAuth-provider or hosted-service verification.
