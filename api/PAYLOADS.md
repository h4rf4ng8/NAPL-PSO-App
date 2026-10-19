# API response contracts

The user-approved requirement sets a 10,000-byte decoded UTF-8 JSON budget for routine responses. GraphQL measurements include the `data` envelope and Apollo `__typename` selections; compression does not change this budget. Lists use byte-aware pages rather than assuming a fixed number of records fits. Smaller responses are valid.

## Reads

| Resource | Routine response | Complete information |
| --- | --- | --- |
| League overview | Current account's selected-season card, counts, bounded headline preview, active voting-period metadata | Separate season, news, team and voting pages |
| Accounts / leaderboard | Filtered, globally sorted account summaries and canonical server ranking | Selected-season player card; trophy pages; explicit raw-history details |
| Teams | Visible team summaries | Selected team metadata; revision-bound lineup/editor fields; member, invitation and excluded-season pages; description/rejection text pages |
| News | Metadata with body/notes resources | UTF-8-safe text pages |
| Rules | Metadata | Explicit `GET /api/rules/:id` full document |
| Articles | Metadata and excerpt resource | Excerpt text pages; explicit `GET /api/articles/slug/:slug` full document |
| Schedule | Selected-season metadata, visible team labels, authenticated all-time W/D/L | Notes text pages; stream redirect; admin original stream-link text resource |
| Transfers | Record pages | All records remain available through continuation |
| Submissions | Authorized metadata pages | Explicit authorized detail field pages, including imported extensions and edits |
| Voting | Period metadata, candidate/winner pages, own votes, authorized vote pages | All rows through continuation; browser choices use server candidate pages |
| Settings / roles / position requests | Entry/record pages | Oversized setting values and request reasons have explicit detail/text resources |
| Standings / Hall of Fame | Globally ranked/filtered pages, including zero-game participating teams | Continue pages and select individual cards/history |
| Match history / opponent totals | Bounded display pages | Explicit raw match details preserve historical extension fields and original long labels |

The only full long-text exceptions are an explicitly selected rule and an explicitly selected article. List responses never embed these documents. Image JSON is not an exception: approved/pending images, logos and covers use media resources backed by existing stored data. External URLs use validated redirects or explicit descriptors; no server-side arbitrary URL fetching is added.

Pages have `{ nodes, pageInfo: { endCursor, hasNextPage }, totalCount }` (the pre-existing match page retains its smaller `nodes/pageInfo` shape). `first` is an upper bound; the byte budget can return fewer rows. Cursors bind filter/viewer scope and a source snapshot. A changed collection returns `409 stale_cursor`; callers restart from page one. No rows are silently dropped.

Imported match and submission schemas deliberately preserve arbitrary extra JSON fields. Their explicit edit/detail resources expose small field values directly and link large values to UTF-8-safe text pages containing a serialized `{key,value}` pair. These are domain detail resources, not a universal response-fragment transport. Detail links bind the exact source record revision, so reordering or editing between requests returns `409` instead of combining different records. Admin editors reconstruct all fields before writing them back.

Trophy cabinets and the headline ticker are explicitly bounded previews, with counts/more indicators and complete paged history available. Long legacy trophy labels indicate that the preview is shortened and retain a full detail link. Browser code does not recalculate league ratings or standings rules.

## Writes and media

Successful JSON writes in the existing account/user, team, content, schedule, transfer, submission, voting, settings, role and position-request route families return `{ok:true,id?}`. Domain validation/rejection errors, 204 responses, redirects, binary bodies and GraphQL reads retain their own contracts. Callers needing updated state perform the relevant bounded read. Match import retains a bounded result summary and explicit skipped-player details instead of a generic acknowledgment. Existing transactions, validation and authorization remain responsible for effects; acknowledgments do not imply a skipped or partial write succeeded.

Media resource versions derive from stored content without a migration. The same source has one stable URL across DTO layers; changed content changes its version. Pending account images require owner/admin authorization; pending team logos use the same visibility rules as the team. Explicit image-review writes copy stored pending content rather than saving the generated media URL. Original source-link resources support editing without persisting generated API paths.

## Parity evidence

`test/routes/payload.test.ts` checks byte-aware traversal, Unicode/escaped text round trips, selected-season projection, revision-bound raw-field reads and stable media versions. `test/routes/payload-responses.test.ts` exercises actual API responses and complete collection traversal using the synthetic 105-account stress fixture. Existing DTO tests now read the complete selected resource after successful writes and retain private-column assertions. Authentication, ranking, history-cursor and GraphQL tests retain the corresponding behavior assertions through the new contracts.

Matched local SQL/HTTP results, scripted user-action bytes, complete-data transfer costs, source guidance and limitations are recorded in [the payload evidence review](../docs/reviews/api-payload-evidence.md).

Match imports return a bounded result with counts, team names, score, matchId and skippedIndexes (at most 30 input roster positions). The browser reconstructs every skipped name/ID from the exact retained upload; no skipped row is discarded. Import account matching is a separate admin-only paged lookup for the explicit uploaded Strikers IDs.

Numeric stats extensions retain their previous public visibility through the selected card statsUrl. This explicit paged field resource omits private account fields, binds continuation cursors to the source, and binds large field value links to the full stats revision.
