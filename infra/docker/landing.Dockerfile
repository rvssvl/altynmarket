FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ARG VITE_CUSTOMER_APP_URL
ENV VITE_CUSTOMER_APP_URL=$VITE_CUSTOMER_APP_URL

COPY . .

RUN corepack enable \
  && corepack pnpm@10.14.0 install --frozen-lockfile \
  && corepack pnpm@10.14.0 build:landing

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4174

COPY --from=build /app/apps/landing/dist ./dist
COPY --from=build /app/apps/landing/server.mjs ./server.mjs

USER node
EXPOSE 4174

CMD ["node", "server.mjs"]
