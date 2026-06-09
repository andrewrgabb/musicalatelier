# API image (Node + Express). Build context is the REPO ROOT (it needs the
# pnpm workspace), so deploy with, from the repo root:
#   fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile .
#
# We install fresh inside the image (node_modules is .dockerignored) so native
# binaries — notably Prisma's query engine — match Linux, not your Mac.

FROM node:22-slim

# Prisma needs OpenSSL at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /repo

# Copy the whole workspace and install. (A more optimized image would copy just
# the manifests first for better layer caching; kept simple here on purpose.)
COPY . .
RUN pnpm install --frozen-lockfile

# prisma generate + tsup bundle (inlines @musical-atelier/contracts).
RUN pnpm --filter @musical-atelier/api run build

WORKDIR /repo/apps/api
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Run the bundled server. Database migrations are applied separately via the
# Fly release_command (see fly.toml): `pnpm exec prisma migrate deploy`.
CMD ["node", "dist/index.js"]
