FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ARG PUBLIC_API_BASE_URL
ENV PUBLIC_API_BASE_URL=$PUBLIC_API_BASE_URL

COPY . .

RUN corepack enable \
  && corepack pnpm@10.14.0 install --frozen-lockfile \
  && corepack pnpm@10.14.0 build:backoffice

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173

COPY --from=build /app/apps/backoffice/dist ./dist
COPY --from=build /app/apps/backoffice/server.mjs ./server.mjs

USER node
EXPOSE 4173

CMD ["node", "server.mjs"]
