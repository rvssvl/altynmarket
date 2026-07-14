FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

COPY . .

RUN corepack enable \
  && corepack pnpm@10.14.0 install --frozen-lockfile \
  && corepack pnpm@10.14.0 build:api

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Workspace symlinks in node_modules point to these package directories, so
# retain the built workspace layout instead of installing dependencies again.
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages/domain ./packages/domain
COPY --from=build /app/packages/database ./packages/database

RUN mkdir /app/uploads && chown node:node /app/uploads

USER node
EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]
