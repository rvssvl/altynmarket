# Altyn Market: coding-agent handoff

Updated 2026-07-20 after the Effect migration completed. The legacy Promise
facade (`backend-services.ts`), the REST API surface, and all compatibility
shims are gone. Do not reintroduce them.

## Architecture

The backend is an Effect v4 modular monolith (`effect@4.0.0-beta.90`; treat
`repos/effect-smol` as the API source of truth, see `AGENTS.md`).

- **Infrastructure ports** (`apps/api/src/infrastructure-services.ts`):
  `BackendPersistence` (Store operations as Effects), `PaymentGateway`,
  `RealtimePublisher`, `AuthGateway` (OTP/session/RBAC/staff over the Promise
  `AuthService`), `ProductImages` (image storage). All raw dependencies stay
  Promise-based infrastructure behind these ports.
- **Workflows**: `order-fulfillment-workflow.ts` (checkout, picking, capture,
  refund delta) and `payment-administration-workflow.ts` (admin refunds with
  state guard + amount caps, payment status). Tagged financial errors
  `PaymentNotFound` / `RefundNotAllowed` live in `packages/domain/src/rpc.ts`.
- **Application services** (`apps/api/src/application-services.ts`): Catalog,
  Authentication, CustomerShopping, StaffOperations, Administration — all
  Effect-native, composed by `makeApplicationLayer(dependencies, options)`
  from `BackendDependencies { store, auth, paymentProvider, realtime,
  flatDeliveryFee }`.
- **Transport** (`apps/api/src/http.ts`): `/rpc` (typed Effect RPC, the only
  command/query boundary), `/realtime` (SSE, notification-only), `/health`,
  and `GET /uploads/products/*`. The RPC contract is
  `packages/domain/src/rpc.ts`; handlers are `apps/api/src/effect-rpc.ts`.
- **Clients**: `packages/client` wraps the typed RPC client in Promise
  factories (`createAuthClient`, `createCustomerAppClient`,
  `createStaffOperationsClient`, `createAdminOperationsClient`) used by both
  mobile apps and the backoffice.

## Business rules that must remain true

- B2C only; unavailable/bad-quality items are cancelled, never substituted.
- Checkout authorizes the estimated total; capture after picking uses the
  recalculated total and never exceeds the authorized amount (zero-total
  cancellation and refund delta are handled in the fulfillment workflow).
- Admin refunds require a captured payment and cumulative refunds must not
  exceed the captured amount.
- Delivery fee is flat in v1. Staff/admin access is role-based via
  `AuthGateway.requireRole`; every admin mutation writes an audit record.
- Order item prices are snapshots; realtime is notification-only.

## Tests and verification

`apps/api` vitest suite (12 tests): `application-workflows.test.ts` (core
checkout→capture→refund-delta flow, RBAC, catalog deletion guards, auth),
`effect-rpc.test.ts` (wire-level customer + admin flows),
`payment-administration.test.ts` (refund guards), plus infrastructure and
image-storage tests.

```sh
./node_modules/.bin/tsc -p packages/domain/tsconfig.json --noEmit --pretty false
./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit --pretty false
cd apps/api && pnpm exec vitest run --maxWorkers=1 --minWorkers=1
pnpm exec oxfmt --check <files> && pnpm exec oxlint <files>
```

The first cold vitest run takes ~2 minutes (Vite transform of the Effect
dependency graph); warm runs take ~1s. It is not a hang.

`packages/domain` and `packages/client` publish `dist/` via their `exports` —
rebuild them (`pnpm --filter <pkg> build`) after changing their sources or
dependents will typecheck against stale declarations.
