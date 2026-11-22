# Worker image for Railway. Build from the repository root:
#   docker build -f infra/worker.Dockerfile -t growth-os-worker .
# Whole directories are copied (never file lists) so new files are never forgotten.
FROM node:22-slim

# tini reaps child processes and forwards SIGTERM so shutdown is graceful.
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

RUN pnpm install --frozen-lockfile --filter @growth-os/worker...

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "--filter", "@growth-os/worker", "start"]
