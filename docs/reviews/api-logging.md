# API logging review

This layer replaces Fastify's incoming/completed/error chatter with one `api.request.completed` event for each completed request. It keeps every completion, including authentication rejections, malformed requests, unmatched routes, CORS preflights, and GraphQL errors. It adds no sampling, log-size caps, dependencies, or changes to HTTP response data.

## Contract and traceability

Production emits minified JSON with `timestamp`, `level`, `component`, `event`, `request_id`, `method`, matched `route`, HTTP `status`, and rounded `duration_ms`. Authenticated requests include verified `actor_id`; Lambda adds its function `version`. `request_id` comes from `context.awsRequestId`; ordinary local requests get a UUID. Browser-supplied IDs cannot replace it. The response returns `X-Request-Id`, exposed by CORS.

`ERROR` requires attention, `WARN` records a handled unexpected failure, `INFO` records meaningful completion, and `DEBUG` is opt-in. Ordinary 4xx rejections stay INFO and retain a safe reason code. GraphQL errors contribute diagnostic codes even when their HTTP response is 200. Failed provider calls retain dependency, operation, failure kind, and upstream HTTP status when available. A saved roster with a failed notification records WARN with the team ID.

Errors expose classifications, optional Prisma `db_code`, actual SQLSTATE, and one safe source frame. They omit raw error messages, arbitrary causes, SQL, query strings, headers, request/response bodies, tokens, provider responses, and validation values. The build has no source maps: deployed source frames identify `lambda.js:line:column`, not original TypeScript. Use the function version to find the matching deployment artifact. Each production event name is a static literal with one emission site, checked through the TypeScript AST in the logging tests.

One completion cannot cover a timeout, process death, initialization failure, broken output sink, or an error occurring after completion. Lambda system INFO logs remain enabled. Late framework warnings/errors emit a separate safe diagnostic carrying the request ID/version when available; completion releases the retained request reference. Non-request GraphQL lifecycle failures retain a safe reason. Configuration/runtime creation failures before a logger exists remain bootstrap/runtime exceptions. Native listen prose is replaced by `api.server.ready`; listen failures emit `api.server.start_failed`. Output sink failures preserve the HTTP outcome and cannot recursively log.

## Local output and configuration

`NODE_ENV=development` renders the same fields as:

```text
2026-10-18T00:00:00.000Z INFO api api.request.completed request_id="one" method="GET" route="/api/accounts" status=200 duration_ms=4
```

Production uses JSON; tests normally disable logs, while logging-specific tests run the production logger. `LOG_LEVEL=info` is the default. `LOG_LEVEL=debug` opts into DEBUG without suppressing INFO completions. On Lambda, observing DEBUG also requires changing its application logging control from INFO to DEBUG; changing the app environment alone is insufficient. System logging stays INFO, retaining successful invocation reports as well as failures.

## Measured application bytes

The reproducible benchmark runs the same injected real API traffic against the unchanged PR26 checkout (`b41fd67`) and this layer using Node 24.22.0: ten fixed public GraphQL reads (200), ten authenticated provisioning calls with an injected provider failure (503), and ten missing-bearer rejections (401). Dependencies are synthetic; no cloud, provider, or database is queried. Both runs use JSON output. Counts include UTF-8 stdout JSON plus line terminators and all application lines emitted during the run.

| Matched traffic | Before events | Before bytes | After events | After bytes |
|---|---:|---:|---:|---:|
| 10 HTTP 200 | 20 | 3,441 | 10 | 2,431 |
| 10 HTTP 401 | 20 | 3,439 | 10 | 2,590 |
| 10 HTTP 503 | 30 | 4,894 | 10 | 3,750 |
| Total: 30 requests | 70 | 11,774 | 30 | 8,771 |

The observed application mean fell from 392.47 to 292.37 bytes/request while adding route, UUID correlation and safe error diagnostics. Timing digits, hostnames and request IDs affect exact reruns. This is a local matched-fixture result; it supersedes earlier synthetic-route measurements. It does not establish CloudWatch ingestion bytes, platform-log bytes, billing savings, or a universal percentage reduction. The pasted local runtime/emulator lines are not a CloudWatch baseline. A later deployed comparison must report application and platform bytes separately, with matched routes/statuses and cold/warm invocation counts. No deployment or system-log suppression is part of this layer.

From the repository root, with dependencies/generated Prisma client/contracts built in each checkout:

```sh
pnpm --filter @napl/api exec node --import tsx test/logging-benchmark.mjs /path/to/before/api
pnpm --filter @napl/api exec node --import tsx test/logging-benchmark.mjs
```

The fixture and benchmark are checked in; the captured aggregate results accompany this review. Separate integration coverage loads the actual built Lambda artifact, induces a database connection failure, and checks the response ID, function version and bundled source frame.

## Sources and validation

The canonical completion approach follows the repository-provided `logging-best-practices` skill (version 1.0.0, author boristane; its reference is [Logging Sucks](https://loggingsucks.com)); the requested four levels and readable local rendering override its two-level/JSON-only defaults. [Fastify Logging](https://github.com/fastify/fastify/blob/main/docs/Reference/Logging.md) documents Pino/custom streams and warns about accepting client request IDs. [Fastify LogController](https://github.com/fastify/fastify/blob/main/docs/Reference/Server.md#logcontroller) documents lifecycle-log controls; [Fastify serverless guidance](https://github.com/fastify/fastify/blob/main/docs/Guides/Serverless.md) describes structured completion logging. Context7 library ID: `/fastify/fastify`. These were checked through Context7 and against installed Fastify 5.12.7 source.

[Apollo's logger option](https://www.apollographql.com/docs/apollo-server/api/apollo-server#logger) and [plugin event reference](https://www.apollographql.com/docs/apollo-server/integrations/plugins-event-reference) document logger replacement, incomplete context failures and unexpected pipeline errors. Context7 library ID: `/apollographql/apollo-server`. Installed Apollo 5.5.1 call sites were inspected so cache/lifecycle warnings are retained without emitting their raw prose. [AWS Node.js logging](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-logging.html) and [Lambda log-level filtering](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-log-level.html) (Context7 library ID checked in the approved rubric: `/websites/aws_amazon_lambda_dg`) explain JSON fields and independent application/system controls; these mechanisms do not prove a byte or cost result.

Validation covers secret canaries, real malformed input/404/CORS, GraphQL 200/503 errors, overlapping local and Lambda requests, safe source frames and database classifications, broken sinks, post-completion warnings, level defaults and static event uniqueness. Typecheck, ESLint, API tests and packaged-artifact checks are recorded with the final review. Database-dependent tests require their explicit fixture and remain skipped when it is absent.

[Stripe canonical log lines](https://stripe.com/blog/canonical-log-lines) supplies the completion-event rationale; [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) supports excluding credentials and sensitive data while retaining diagnostic context. SQLSTATE classification follows the [PostgreSQL error-code appendix](https://www.postgresql.org/docs/current/errcodes-appendix.html); arbitrary five-character filesystem codes are not database states.
