# Payload refactor evidence

The 10,000-byte ceiling for each routine decoded UTF-8 JSON response, images outside JSON, no lost collection rows, and the explicit full rule/article exception are **user-approved requirements**, not limits prescribed by GraphQL or OWASP. See [the response contracts](../../api/PAYLOADS.md).

Selective fixed reads follow GraphQL's [field selection](https://graphql.org/learn/queries/) mechanism. Explicit continuation follows its [pagination guidance](https://graphql.org/learn/pagination/). Bounding returned records and validating resource limits is consistent with [OWASP API4 resource-consumption guidance](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/). These sources support the techniques; they do not establish a 10 KB standard or promise a particular saving.

## Measured decoded HTTP bodies

The [runner](../../api/test/integration/payload-http-benchmark.mjs) starts an isolated disposable PostgreSQL 17 container, replays the repository bootstrap/fixture/migrations, seeds identical data, and calls real HTTP listeners for immutable baseline `b41fd67cd` and the payload worktree. It uses a restricted application DB role. No hosted database or CloudWatch data is involved. Counts exclude HTTP headers, TLS, compression and browser cache effects.

| Synthetic scenario | Baseline snapshot, 1 request | After: open Stats JSON, 3 requests | After: complete scripted action, 9 requests | JSON / media within action |
| --- | ---: | ---: | ---: | ---: |
| Routine-size fixture | 914,961 B | 10,357 B | 27,899 B | 20,299 / 7,600 B |
| Larger-history stress fixture | 40,711,768 B | 11,733 B | 404,412 B | 24,412 / 380,000 B |

The action requests overview, seasons and first leaderboard page; advances one players page; selects one player; explicitly opens both trophy histories; then downloads that card's account image and team logo. Before the refactor these data were present in the original snapshot. Stats rows render no images. This is a scripted component/API body comparison, **not browser network capture**: the team image browser helper adds `descriptor=1`; the fixture's stored binary image yields the same body bytes through that mode. External-image sources and cold browser assets require separate measurement. More requests are intentional: nine replace one in this action. Every measured action JSON response is at most 7,512 B.

A separate conservative complete-data workload traverses all 105 account summaries and downloads **all 105 account images**, regardless of what the UI displays:

| Scenario | Initial overview + leaderboard, 2 requests | Complete data + all account images, 117 requests | Largest routine JSON |
| --- | ---: | ---: | ---: |
| Routine-size fixture | 10,077 B | 480,517 B | 7,515 B |
| Stress fixture | 11,451 B | 20,032,891 B | 7,515 B |

The fixtures contain synthetic image **bytes**, not validated PNG assets. The routine-size scenario has smaller bodies and histories; neither scenario claims to represent production traffic. The stress baseline exceeds Lambda's [6 MB buffered synchronous response limit](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html#function-configuration-deployment-and-execution) and is only a local stress comparison. These measurements establish response-body differences for matched fixtures, not production latency, Lambda platform log bytes, per-action log savings or CloudWatch cost savings. The larger number of HTTP requests can increase application completion events per user action.

Raw route/type/byte observations: [routine](api-payload-routine.json), [stress](api-payload-stress.json). Reproduce from repository root with Node 24 and Docker available. Both checkouts first need their frozen dependencies installed, the contracts package built, and the Prisma client generated (`pnpm install --frozen-lockfile`, `pnpm --filter @napl/contracts build`, and `pnpm --filter @napl/api prisma:generate`). The immutable baseline must remain at `b41fd67`; generated ignored artifacts do not change that revision. Then run:

```sh
node api/test/integration/payload-http-benchmark.mjs /path/to/immutable-b41fd67-checkout routine
node api/test/integration/payload-http-benchmark.mjs /path/to/immutable-b41fd67-checkout stress
```

## Parity checks

`api/test/routes/payload-responses.test.ts` injects the real API serializer with an in-memory database fixture: eight checks cover complete REST/fixed GraphQL traversal, actual envelopes/typenames, Unicode maximum fields, selected card/previews, 500 legacy stat extensions, image/text preservation, write effects and reserved/Unicode URLs after browser URL normalization. This is separate from the real SQL/HTTP benchmark. Explicit full rule/article bodies may exceed 10,000 B; a fixture rule is 18,081 B. Images remain binary resources.

DB-gated content/settings/voting tests assert persisted mutation effects, ordering, rollback, authorization, candidate snapshots and clock-after-lock behavior through ACK/page contracts. Browser tests verify initial reads do not drain collections, explicit role replacement retains off-page assignments, and full team editing retains all saved excluded seasons while omitting unchanged uploaded/external logos and untouched lineup fields. Full suite results are recorded with the final integration review rather than inferred from these focused checks.

## Refactor review

Before, broad snapshots and array reads supplied both display views and full replacement editors. The structural change separates bounded display pages from explicit complete saved-field reads; full editors reconstruct saved values before replacement writes. The smallest parity checks cover continuation without missing/duplicate rows and persisted state after edits, including off-page roles/seasons and untouched custom lineup fields. Obsolete list wrappers were removed only after caller searches found no remaining uses.

The final dependency-cruiser review found zero boundary errors: API retained the same eight existing warnings; web retained three existing warnings and removed five baseline cycles, with no new warning. Root's [pinned Brooks advisory review](https://github.com/hyhmrright/brooks-lint/blob/c85f65eada5c56721275ef89e2dd41ac453dcba2/skills/brooks-review/SKILL.md) found and addressed partial-roster editing, stale editors, import snapshot dependencies, mutation response types, HomeNews null/older-history handling and submission attribution/revision consistency. This advisory review supplements typecheck, ESLint and tests.

Ripwire flags increased paging/error/editor-state complexity and the nested complete-value reader, alongside churn and JSX caller-resolution false positives. This is an accepted cost of complete-data and failure handling, not a claim that overall complexity decreased. Admin collection writes restart cursors; complete editor failures remain visible and prevent replacement writes with partial saved data.

## Final integrated validation

The final local `pnpm check` passed generated-document checks, TypeScript, ESLint, tests and production builds. Its API run passed 140 tests with 15 database-dependent skips; all 128 web tests passed. The separate disposable-database integration run then passed all 169 API tests with zero skips, all 128 web tests with zero skips, three packaged-artifact checks and seven SAM runtime checks. Local transcripts are `/private/tmp/napl-logging-payload-final-check.txt` and `/private/tmp/napl-logging-payload-final-integration.txt`; these paths describe this review environment rather than portable checked-in artifacts.

The captured [SAM runtime report](api-sam-runtime.json) records Node.js 24 on arm64 at 128 MiB. Checks cover a real Prisma public read, forged-identity rejection, bearer requirements, base64 public/protected GraphQL and controlled database-failure responses. SAM wall times include local Docker/runtime startup and do not establish deployed latency or capacity.

Final dependency-cruiser results were zero errors: eight existing API warnings and three existing web warnings, with five baseline cycles removed and no new cycles. Root's final quality-delta advisory reported 19 flags (nine gating-labelled and ten minor), mainly churn; review accepted the `createApp` complexity change from 59 to 62 for the safe DTO-ID guard. The broader payload complexity tradeoffs above remain explicit. These advisory labels are not a claim of a failed test gate or reduced overall complexity.

The integrated [logging benchmark review](api-logging.md) records 11,768 to 8,771 application-log bytes for 30 matched local requests. No CloudWatch metrics were collected and no deployment occurred.
