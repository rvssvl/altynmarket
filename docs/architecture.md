# Altyn Market — system architecture

Updated 2026-07-20. This is the single source of truth for how the system is
built, deployed, and operated. `docs/coding-agent-handoff.md` is the condensed
version for coding agents; `AGENTS.md` holds engineering rules.

Altyn Market is a B2C grocery-delivery MVP (vegetables, fruits, greens,
berries, dried fruits) from Altyn Orda to customers in Almaty and nearby
settlements.

The backend is deliberately a **modular monolith**, not microservices: the MVP
risk is operational and economic (order volume, average check, delivery and
picking cost, gross profit per order), and distributed infrastructure does not
reduce those risks enough to justify its complexity at launch.

## 1. Monorepo layout

| Path | What it is |
| --- | --- |
| `packages/domain` | Shared business vocabulary: branded IDs, entities, money, order lifecycle, input contracts, and the typed RPC contract (`src/rpc.ts`). No DB/network code. |
| `packages/database` | PostgreSQL migrations (`0001`–`0004`: schema, auth/cart/sessions, seed catalog, push subscriptions) and the migration runner. |
| `packages/client` | Typed clients for all frontends: the Effect RPC client (`src/effect-rpc.ts`) and Promise-style factories over it (`src/index.ts`). |
| `apps/api` | The backend: an Effect v4 modular monolith. |
| `apps/backoffice` | Vite + TypeScript admin web app (no framework), talks typed RPC. |
| `apps/landing` | Public marketing landing (Russian/Kazakh), Vite. |
| `apps/customer-mobile` | Expo/React Native customer app (port 8082 in dev). |
| `apps/staff-mobile` | Expo/React Native picker/courier app (port 8083 in dev). |
| `infra/` | Caddy config, docker compose stacks, Dockerfiles, VPS scripts (bootstrap, deploy, postgres backup). |
| `repos/` | Local read-only checkouts used as API reference (`effect-smol` is the Effect v4 source of truth). Git-ignored; never imported at runtime. |

Package dependencies flow one way: `domain` ← `client`/`database` ← `api` /
apps. Apps never import each other.

## 2. Backend architecture (`apps/api`)

Effect v4 (`effect@4.0.0-beta.90`) modular monolith. There is no REST API and
no legacy Promise facade — the typed RPC boundary is the only command/query
surface.

```
transport   /rpc (typed Effect RPC) · /realtime (SSE) · /health · GET /uploads/products/*
            http.ts · effect-rpc.ts
app layer   CatalogApplication · AuthenticationApplication · CustomerShoppingApplication
            StaffOperationsApplication · AdministrationApplication      (application-services.ts)
workflows   OrderFulfillmentWorkflow (checkout → picking → capture/refund delta)
            PaymentAdministration (admin refunds with guards, payment status)
ports       BackendPersistence · PaymentGateway · RealtimePublisher · AuthGateway · ProductImages
            (infrastructure-services.ts)
infra       Store (in-memory | postgres) · AuthService (OTP/JWT sessions) · payment providers
            RealtimeBus (in-memory) · ProductImageStorage (disk)        — Promise-based, behind ports
```

Key rules:

- Capabilities are `Context.Service` classes; implementations are `Layer`s;
  composition happens once in `makeApplicationLayer(BackendDependencies)`.
- Expected failures are typed: `ApiFailure` (status-carrying), `AuthFailure`,
  `BackendInfrastructureFailure`, and the tagged financial errors
  `PaymentNotFound` / `RefundNotAllowed` (defined in the domain RPC contract so
  they travel over the wire).
- RBAC goes through `AuthGateway.requireRole`; every admin mutation writes an
  audit record; realtime events are notification-only (HTTP/RPC + DB remain
  authoritative).
- The store has two implementations: `postgres-store.ts` (used when
  `DATABASE_URL` is set; migrations run on boot) and `in-memory-store.ts`
  (local dev/tests, seeded catalog).

### Business invariants

1. B2C only. Unavailable or bad-quality items are cancelled, never
   substituted.
2. Checkout authorizes the estimated total (goods + flat delivery fee).
3. After picking, capture uses the recalculated total and never exceeds the
   authorized amount; zero-total orders cancel the authorization; a positive
   difference is refunded (refund delta).
4. Admin refunds require a captured payment; cumulative refunds must not
   exceed the captured amount (`RefundNotAllowed` reasons: `invalid_amount`,
   `provider_payment_missing`, `not_captured`, `amount_exceeds_captured`).
5. Order item prices are snapshots; catalog price changes never rewrite
   history. Products/categories with history cannot be deleted.
6. Delivery fee is flat in v1 (`DELIVERY_FLAT_FEE_KZT`).

## 3. API surface

The RPC contract lives in `packages/domain/src/rpc.ts` (~43 operations,
JSON serialization, bearer-token middleware `RpcAuthentication`):

- Public: `Health`, catalog reads, OTP request/verify, session refresh.
- Customer: session, cart CRUD, `Checkout`, own orders, `RegisterPushToken`.
- Staff: picking/delivery task lists, `StartPicking`, `UpdatePickingItem`
  (picked/cancelled), `CompletePicking`, `UpdateDeliveryStatus`.
- Admin: orders list, assign picker/courier, staff profiles CRUD, payments &
  refunds (`RefundPayment`, `UpdatePaymentStatus` with tagged errors), audit
  log (super_admin), metrics, full catalog administration (categories,
  products, availability, pricing, price history), `UploadProductImage`
  (base64).

Non-RPC HTTP endpoints: `/health` (LB checks), `/realtime` (SSE, token via
`Authorization` header or `access_token` query param), `GET
/uploads/products/:file` (product images).

## 4. Frontend clients

`packages/client` wraps the typed RPC client in Promise factories so UI code
stays simple while the wire stays fully typed:

- `createAuthClient` — OTP login, session refresh/restore.
- `createCustomerAppClient` — catalog, cart, checkout, orders, push token.
- `createStaffOperationsClient` — picking/delivery operations.
- `createAdminOperationsClient` — the whole admin surface incl. image upload.

Errors surface as `ApiError { message, status }`. Both mobile apps and the
backoffice consume these factories; nothing in the product talks raw HTTP to
the API anymore.

Mobile apps resolve the API URL from `EXPO_PUBLIC_API_BASE_URL`, defaulting to
the staging API. The customer app subscribes to `/realtime` via EventSource
and falls back to polling. EAS build profiles: `development`, `preview`,
`demo`.

## 5. Auth model

- Customers and staff authenticate by phone + OTP → access token (short TTL) +
  rotating refresh token, persisted per device session.
- Roles: `customer`, `picker`, `courier`, `admin`, `super_admin` (super_admin
  passes every role check). Staff profiles can be deactivated.
- `BOOTSTRAP_ADMIN_PHONE` seeds the first super_admin on boot.
- On staging OTP delivery is `console` and `AUTH_EXPOSE_DEV_CODE=1` returns
  the code (`AUTH_DEV_OTP`) in the response — real SMS delivery is not
  integrated yet.
- The staging backoffice has no extra HTTP gate: access control is the
  phone + OTP login itself. The staging super_admin is `+77474150198` with
  the fixed dev code `666999` (baked into `infra/compose/staging.yml`). Only
  the staging landing preview (`$LANDING_DOMAIN`) keeps the Caddy Basic gate
  (`STAGING_ACCESS_*`).

## 6. Integration status

| Area | Status |
| --- | --- |
| Typed RPC backend + all clients | **Done** — single canonical boundary. |
| PostgreSQL persistence + migrations | **Done** (in-memory fallback for dev/tests). |
| Payments | **Mock provider on staging.** `createKaspiPaymentProvider` builds redirect/deeplink URLs but has no real Kaspi API calls (capture/refund are stubs); `card_pending` is a placeholder. Real acquiring is the biggest open integration. |
| OTP SMS | **Console only** (`OTP_PROVIDER=console`). Real SMS gateway pending. |
| Push notifications | Token registration is done end-to-end; delivery is `console` (no real APNs/FCM send pipeline yet). |
| Realtime | In-memory bus + SSE — works on a single API instance only; needs a shared bus (e.g. Postgres LISTEN/NOTIFY or Redis) before horizontal scaling. |
| Product images | Disk storage on the API container volume (`UPLOAD_DIR`), served by the API. Object storage is a later concern. |
| Metrics | MVP business metrics endpoint; no observability stack (OTLP tracing/logging) wired yet. |

## 7. Environments, branches, CI/CD

### Branches

| Branch | Role |
| --- | --- |
| `main` | Source of truth. Will drive the **production** deploy workflow once production infrastructure exists. Pushing it deploys nothing today. |
| `staging` | Deployment branch. Every push redeploys the staging stack. Normal flow: merge/fast-forward `main` → `staging` and push. |

### Workflows (`.github/workflows/`)

- `deploy-staging.yml` (push to `staging`, or manual): job **verify** builds
  api + backoffice + landing and runs the `apps/api` vitest suite; job
  **deploy** rsyncs an immutable release to
  `/opt/altyn-market/releases/<sha>` on the VPS over SSH and activates it via
  `infra/scripts/deploy-release.sh` (docker compose build + up with
  `/etc/altyn-market/staging.env`).
- `deploy-landing-vps.yml` (push to `staging`, path-filtered to landing
  files): same shape, landing only.
- Planned: `deploy-production.yml` — a copy of the staging workflow targeting
  `main` with production host/secrets, once production infra exists.

Secrets used: `STAGING_SSH_PRIVATE_KEY`, `STAGING_SSH_KNOWN_HOSTS`,
`STAGING_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_PORT` (GitHub environment
`staging`).

### Staging stack (current, VPS)

`infra/compose/staging.yml`: Caddy (TLS via ACME, reverse proxy), `api`
(Node 22, port 4000), `backoffice` (static, 4173), `landing` (static, 4174),
`postgres:16` — isolated `public`/`application`/`database` networks, named
volumes for postgres data, uploads, and Caddy state. Host env lives in
`/etc/altyn-market/staging.env`. `infra/scripts/backup-postgres.sh` backs up
the DB; `bootstrap-vps.sh` provisions a fresh host.

### Legacy: Railway stage

`railway.*.json` + `docs/railway-stage.md` describe the earlier Railway-based
stage. It is still online at `altyn-market-*-stage-production.up.railway.app`
but runs a **pre-migration build** (old REST API) and does not auto-deploy.
Treat it as deprecated; decommission when convenient.

## 8. Domains

| Domain | Serves | Access |
| --- | --- | --- |
| `altyn-market.kz`, `www.altyn-market.kz` | Public landing | Open |
| `api-staging.altyn-market.kz` | Staging API (`/rpc`, `/realtime`, `/health`, `/uploads/*`) | Open (native apps can't pass Basic auth) |
| `admin-staging.altyn-market.kz` | Staging backoffice; Caddy also proxies `/rpc`, `/realtime`, `/health`, `/uploads/*` to the API on the same origin | OTP login (`+77474150198` / `666999`) |
| `$LANDING_DOMAIN` (staging.env) | Staging-gated landing preview | Caddy Basic gate |

DNS is managed at Hoster.kz (see `docs/railway-stage.md` for the record
notes). Production domains are not allocated yet.

## 9. Testing and verification

- `apps/api` vitest suite (12 tests): `application-workflows.test.ts` (core
  checkout → capture → refund-delta flow with metrics, RBAC denial, catalog
  deletion guards, auth sessions), `effect-rpc.test.ts` (wire-level customer
  and admin flows through the real HTTP handler),
  `payment-administration.test.ts` (every refund guard + double-submit),
  `infrastructure-services.test.ts`, `product-image-storage.test.ts`.
- Fast checks: package-scoped `tsc --noEmit` per workspace, `oxfmt`, `oxlint`.
  `pnpm check` runs format + lint + typecheck + tests across the workspace.
- First cold vitest run takes ~2 min (Vite transforms the Effect graph); warm
  runs ~1 s. It is not a hang.
- `packages/domain` and `packages/client` expose built `dist/` via `exports` —
  run `pnpm --filter <pkg> build` after changing them, or dependents typecheck
  against stale declarations.
- Staging smoke probes:

  ```sh
  curl https://api-staging.altyn-market.kz/health
  curl -X POST https://api-staging.altyn-market.kz/rpc -H "Content-Type: application/json" \
    -d '[{"_tag":"Request","id":"1","tag":"Health","payload":null,"traceId":"t","spanId":"s","sampled":false,"headers":[]}]'
  ```

## 10. Known gaps / roadmap

1. **Real payment acquiring** (Kaspi or card processor) behind the existing
   `PaymentGateway` port, including idempotency at the provider boundary.
2. **Real SMS OTP delivery** and **push delivery** (APNs/FCM) behind the
   existing provider seams.
3. **Production environment**: infra (separate VPS/stack or managed),
   `deploy-production.yml` on `main`, production domains, real secrets,
   `AUTH_EXPOSE_DEV_CODE` off.
4. **CI on pull requests / main** (typecheck + tests without deploying) —
   today verification only runs inside deploy workflows.
5. **Shared realtime bus** before running more than one API instance.
6. **Boundary validation hardening**: non-empty strings, positive quantities,
   phone/address constraints in the RPC schemas.
7. Decommission the legacy Railway stage.
