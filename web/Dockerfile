FROM node:24-alpine
RUN npm install --global pnpm@10.15.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
COPY pkgs/contracts/package.json pkgs/contracts/package.json
RUN pnpm --filter @napl/web... install --frozen-lockfile
COPY tsconfig.base.json ./
COPY web/ web/
COPY pkgs/contracts/ pkgs/contracts/
RUN pnpm --filter @napl/contracts run build
CMD ["pnpm", "--filter", "@napl/web", "run", "dev"]
