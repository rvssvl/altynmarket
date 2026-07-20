# Altyn Market

B2C delivery MVP for vegetables, fruits, greens, berries, dried fruits, and related goods from
Altyn Orda to customers in Almaty and nearby settlements.

This project is intentionally separate from the existing Telegram mini app in the parent workspace.

## Shape

- `packages/domain` - shared business types, branded IDs, order workflow, API contracts, errors.
- `packages/database` - PostgreSQL schema, migrations, database boundaries.
- `apps/api` - Effect-first modular monolith backend.
- `packages/client` - shared typed client/session helpers for frontend apps.
- `apps/backoffice` - React web backoffice.
- `apps/landing` - public product landing page (Russian and Kazakh).
- `apps/customer-mobile` - React Native customer app.
- `apps/staff-mobile` - React Native staff app for picker/courier roles.

## First setup

Effect v4 is pre-release. Do not guess APIs from public Effect 3 examples. Populate local references:

```bash
./scripts/setup-worktree.sh
```

Then use `repos/effect-smol` as the Effect v4 API source of truth and
`repos/effect-ai-chat-example` as the architecture reference.

## Commands

```bash
pnpm install
pnpm check
pnpm dev
pnpm db:migrate
pnpm --filter @altyn-market/landing dev
```

## Mobile distribution

Both mobile apps are configured for EAS Build and EAS Update. See
[`docs/eas.md`](docs/eas.md) for build profiles, release commands, and the account
credentials needed before the first store release.

The current scaffold defines the MVP architecture and core contracts. Runtime adapters, actual
Effect layers, payment provider integration, OTP provider integration, and UI implementation should
be added after `./repos` is populated and the exact Effect v4 APIs are verified.
