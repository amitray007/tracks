# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.node.json ./
COPY packages/core-model/package.json packages/core-model/package.json
COPY packages/live-protocol/package.json packages/live-protocol/package.json
COPY apps/cloud/package.json apps/cloud/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

COPY packages/core-model packages/core-model
COPY packages/live-protocol packages/live-protocol
COPY apps/cloud apps/cloud
COPY apps/web apps/web

RUN pnpm --filter @tracks/core-model build \
  && pnpm --filter @tracks/live-protocol build \
  && pnpm --filter @tracks/web build \
  && pnpm --filter @tracks/cloud build \
  && pnpm --filter @tracks/cloud --prod deploy --legacy /opt/tracks-cloud

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV TRACKS_CLOUD_HOST=0.0.0.0
ENV TRACKS_CLOUD_PORT=8787
ENV TRACKS_CLOUD_WEB_DIR=/app/web-dist

WORKDIR /app

COPY --from=build --chown=node:node /opt/tracks-cloud/package.json ./package.json
COPY --from=build --chown=node:node /opt/tracks-cloud/dist ./dist
COPY --from=build --chown=node:node /opt/tracks-cloud/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/web/dist ./web-dist

USER node

EXPOSE 8787

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "dist/index.js"]
