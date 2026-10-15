# Lambda and Vercel deployment

The deployment in this repository serves the Vite frontend on Vercel. Its server-side proxy signs same-origin `/api/*` and `/auth/*` requests to an IAM-protected Lambda Function URL. The API also verifies `ORIGIN_SECRET` before processing those routes; normal user authentication and authorization remain required.

The SAM template creates the Lambda function and `live` alias, its execution role, a 14-day CloudWatch log group, and a Vercel production OIDC invocation role. Defaults are Node 24, ARM64, 512 MiB, a 60-second function timeout, and reserved concurrency 20. It does not provision the database, frontend, API Gateway, CloudFront, VPC, or provisioned concurrency.

## Prepare and validate

Use Node 24, npm 11, AWS credentials for the intended deployment account, and SAM CLI 1.165.0 or later. The commands below run from the repository root. Docker is needed for PostgreSQL integration tests and optional SAM local invocation.

```sh
npm ci
npm run generate
npm run gql:check
npm run typecheck
npm run lint
npm run build
npm run test:integration
sam validate --lint --template-file api/template.yaml --region us-east-1
# Optional: invoke the packaged handler in SAM's local container as well.
npm run test:sam
```

`npm run build` produces `api/dist/api.zip`, containing only the bundled `lambda.js` handler and an ESM `package.json`. It also builds the web assets and checks the Vercel proxy bundle. The integration runner tests the package outside the repository with disposable PostgreSQL data. None of these commands deploys AWS or Vercel resources.

## Configure runtime values

`npm run setup:env` creates `api/.env` from [the example](../api/.env.example) and generates `COOKIE_KEYS` only if no valid existing key ring is present. Fill in production values through a protected local file or deployment environment. Process environment values override the file when generating SAM parameters.

| Values | Purpose |
| --- | --- |
| `DATABASE_URL`, `AUTH_DATABASE_URL` | Separate application and auth database logins, granted `app_runtime` and `gateway_runtime`, respectively. Production URLs must use `sslmode=verify-full`. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Supabase authentication project and publishable key. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID` | Discord OAuth application and membership guild. |
| `PUBLIC_ORIGIN` | Exact HTTPS origin of the public frontend, without a path or trailing slash. Configure provider redirects for this origin. |
| `COOKIE_KEYS` | Persisted JSON key ring shared by every API instance. Each value is a base64-encoded 32-byte key. |
| `ORIGIN_SECRET` | Shared API/proxy secret of at least 32 characters. |
| `VERCEL_TEAM_SLUG`, `VERCEL_PROJECT_NAME` | Exact identifiers used by the Vercel OIDC trust policy. |

Optional values are `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_AUDIENCE` (defaults to `authenticated`), and `DISCORD_TRANSFER_WEBHOOK`. If the AWS account already has the OIDC provider for this Vercel team, set `EXISTING_VERCEL_OIDC_PROVIDER_ARN` to reuse it. The generated trust policy accepts this team's project in the **production** Vercel environment; preview deployments do not inherit production invocation access.

Both database clients have a pool size of one per Lambda environment. Reserved concurrency 20 therefore allows roughly 40 active application/auth connections before accounting for warm environments, version overlap, migrations, and other consumers. Use the database provider's transaction pooler and leave connection headroom. Choose concurrency from the actual database budget; the defaults are not a measured capacity guarantee.

Keep `COOKIE_KEYS` unchanged when moving existing sessions to Lambda. During rotation, add the new key first and retain old keys until their sessions expire. Rollback versions must understand every key still used by live sessions. Never generate a replacement key ring at function startup. Coordinate database cutover/RBAC migrations with the frontend switch; those migrations remove the legacy browser's direct database access.

## Deploy the API

These commands perform an actual deployment and are intended for the operator's deployment workflow after validation and review:

```sh
npm run env:sam
install -m 600 api/.env.sam.json api/.env.sam.yaml
sam deploy \
  --template-file api/template.yaml \
  --stack-name napl-api \
  --region us-east-1 \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --parameter-overrides file://api/.env.sam.yaml \
  --confirm-changeset
```

Choose the intended stack name and region. `env:sam` validates production configuration and the Lambda 4 KiB environment limit, then writes a private, ignored JSON parameter map. SAM CLI 1.165.0's parameter-file loader accepts YAML/TOML extensions, so the `install` command gives the JSON document a YAML filename with private permissions; JSON is valid YAML. This avoids putting secret values in shell arguments. Do not pass this map as `--config-file`, enable debug logging, or save secret parameters in tracked SAM configuration. Remove the generated parameter copies after use. See the [SAM deployment options](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-deploy.html) for stack and change-set controls.

The template's `CodeUri` points at the ZIP produced by `npm run build`; run that build before each deployment. Retain the prior source revision and configuration for rollback. SAM publishes a version and moves the `live` alias. Redeploy the prior compatible revision to roll back code, preserving the key ring and database compatibility; rolling back code does not undo database migrations.

## Configure Vercel

Set the Vercel project root to `web/` and make files outside that root available to the build so the npm workspaces and shared contracts can be resolved. [web/vercel.json](../web/vercel.json) builds the contracts and frontend, serves `dist/`, and routes API/auth traffic to the server function. Use Node 24 for that function.

Set these server-only production environment values:

| Vercel value | Source |
| --- | --- |
| `API_URL` | SAM `FunctionUrl` output. |
| `AWS_ROLE_ARN` | SAM `VercelInvokeRoleArn` output. |
| `AWS_REGION` | Region of the Lambda function. |
| `ORIGIN_SECRET` | The same value supplied to the API. |

Never prefix them with `VITE_`; that exposes values to the browser bundle. Vercel uses its OIDC identity to obtain temporary AWS credentials. The proxy signs requests, forwards cookies, preserves separate auth `Set-Cookie` headers, and marks responses `no-store`. It has a 55-second deadline and does not retry writes. Confirm that the selected Vercel runtime supports that duration.

Deploy the API before switching the public frontend. After rollout, verify public league reads, login, refresh, logout, and an authorized write through the frontend origin. Monitor Lambda errors, throttles and duration alongside database connections. Direct unsigned Function URL requests should fail at IAM, and requests lacking the shared origin secret should fail inside the API.

## Optional staging load check

`npm run test:load -- --help` describes the opt-in runner. It requires `LOAD_STAGE=staging`, an HTTPS `LOAD_BASE_URL` whose hostname contains `staging` or ends in `.vercel.app`, and a positive `LOAD_DB_CONNECTION_BUDGET`. Use an isolated staging project/database that has its own invocation access; the production OIDC policy does not automatically authorize Vercel preview deployments. Check the target yourself: a `.vercel.app` hostname alone does not prove isolation.

The runner bootstraps CSRF, then submits the read-only public league query in sequential bursts of 20, 50, 100, and 200 simultaneous requests, without retries. `LOAD_ROUNDS` is bounded to 1–5, giving 370–1,850 GraphQL requests plus CSRF bootstrap. It records the declared database budget and optional `LOAD_LAMBDA_RESERVED_CONCURRENCY`; it does not enforce that budget or change infrastructure. `LOAD_COOKIE` optionally supplies a staging session, and `LOAD_TIMEOUT_MS` is bounded to 1,000–60,000 milliseconds. Reports default to `/tmp`; `LOAD_REPORT` overrides that path. Supply independently collected database and Lambda observations through `LOAD_MEASUREMENTS_FILE` when available; missing measurements remain unknown. This command is not part of CI and must not be pointed at production.

## Historical architecture

[The archived system diagram](history/system.png) describes the previous NGINX/Redis deployment. It is retained for history and does not describe the Lambda/Vercel topology above.
