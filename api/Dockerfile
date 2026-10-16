FROM node:24-alpine AS bundle
RUN apk add --no-cache openssl zip unzip && npm install --global pnpm@10.15.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
COPY pkgs/contracts/package.json pkgs/contracts/package.json
RUN pnpm --filter @napl/api... install --frozen-lockfile
COPY api/ api/
COPY pkgs/contracts/ pkgs/contracts/
RUN pnpm run prisma:generate && pnpm --filter @napl/contracts run build \
    && pnpm --filter @napl/api run build && unzip -q api/dist/api.zip -d /lambda

FROM node:24-alpine AS adapter
WORKDIR /app
COPY api/scripts/lambda-url.mjs ./
CMD ["node", "lambda-url.mjs"]

FROM public.ecr.aws/lambda/nodejs:24 AS lambda
COPY --from=bundle /lambda/ ${LAMBDA_TASK_ROOT}/
CMD ["lambda.handler"]
