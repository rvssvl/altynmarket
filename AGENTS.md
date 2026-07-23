# Altyn Market Engineering Rules

## Effect v4

- Treat `./repos/effect-smol` as the only source of truth for Effect v4 APIs.
- Read `repos/effect-smol/LLMS.md`, `.patterns/effect.md`, `.patterns/testing.md`, and relevant
  examples before adding Effect runtime code.
- Do not import from `./repos` at runtime.
- Keep `./repos` read-only and gitignored.

## Architecture

- Keep the backend a modular monolith for MVP.
- Domain packages contain contracts and business vocabulary, not database or network code.
- Backend modules own operational logic behind interfaces: auth, catalog, pricing, cart, orders,
  picking, delivery, payments, notifications, admin, metrics.
- Realtime is a notification channel only. Database state plus HTTP/RPC commands remain authoritative.

## Business Rules

- MVP is B2C only.
- Unavailable or poor-quality items are cancelled, not substituted.
- Checkout authorizes payment for the estimated total.
- Final capture happens after picking for the recalculated total.
- Delivery fee is flat in v1.
- Staff/admin accounts are role-based and can be deactivated.

## Code Style

- Use ASCII unless a file already requires another character set.
- Prefer shared contracts from `packages/domain`.
- Preserve historical order prices by snapshotting order item prices.
- Every admin mutation that changes operations should produce an audit log entry.

## Mobile Delivery

- iOS/Android builds and TestFlight uploads go through EAS; read `docs/eas.md` first. TestFlight
  currently uses the personal Apple account with the `.demo` bundle identifiers — the corporate
  account migration is paused (no DUNS yet), and the corporate identifiers must stay unused.
- Both mobile apps have committed native `ios/` directories, so EAS ignores `ios.bundleIdentifier`
  in `app.json`; identifier changes must also be made in the native projects.

## E2E Testing

- E2E lives in `e2e/` (Playwright for backoffice) and `apps/*-mobile/.maestro/` (Maestro flows,
  run on EAS Workflows). Read `docs/e2e.md` before adding or changing cases.
- Agent runbook with exact commands (local runs, TestFlight releases, cloud release runs):
  `.claude/skills/e2e/SKILL.md`. Local suite: `pnpm --filter @altyn-market/e2e local`.
  Debug Maestro flows locally (free); never iterate on paid cloud EAS runs.
- Tests run against staging: dedicated `+77000000xx` accounts, `E2E-*` catalog items, dev OTP
  `666999`. Never point them at production or use real customer data.
- Prepare test state through RPC helpers (`e2e/lib/`), not through the UI.
- Web selectors use existing `data-action`/`data-module` attributes; Maestro taps visible text.
- Scripts built on the Effect RPC client must end with `process.exit(0)`.

## Staging VPS & Secrets

- Staging runs on a VPS at `194.110.55.132` (domains `*-staging.altyn-market.kz`). Operator
  access: `ssh ubuntu@194.110.55.132` with the operator's SSH key (passwordless sudo).
  The `altyn-deploy` user is reserved for CI; do not reuse it interactively.
- Runtime secrets are sops-encrypted in `infra/secrets/*.env` and pushed to
  `/etc/altyn-market/staging.env` by the deploy workflow. Never edit that file on the VPS by
  hand and never commit plaintext secrets; read `docs/secrets.md` first.
- Deploys happen only by pushing the `staging` branch; `main` deploys nothing.
