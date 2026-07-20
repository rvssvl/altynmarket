# Railway Stage Deployment

This project deploys to Railway as three stage-named services:

- `altyn-market-api-stage` - backend API.
- `altyn-market-admin-stage` - web admin frontend.
- `altyn-market-landing-stage` - public product landing page.

Mobile apps are not deployed in this stage.

Current Railway placement:

- Project: `altyn-market-team-helper`
- Railway environment: `production`
- Stage naming is handled at the service/domain level with `*-stage` services.
- API URL: `https://altyn-market-api-stage-production.up.railway.app`
- Admin URL: `https://altyn-market-admin-stage-production.up.railway.app`
- Landing URL: `https://altyn-market-landing-stage-production.up.railway.app`

The root `railway.json` file is intentionally not committed because Railway CLI reads only one
default config. For manual deploys, copy the matching service config to `railway.json` temporarily,
deploy, then remove it.

## Backend

Use `railway.backend.json`.

- Build: `pnpm build:server`
- Start: `pnpm --filter @altyn-market/server start`
- Healthcheck: `/health`

Deploy command used:

```bash
cp railway.backend.json railway.json
railway up --service altyn-market-api-stage --environment production --detach
rm railway.json
```

Required variables:

- `NODE_ENV=production`
- `WEB_ORIGIN=https://admin.altyn-market.kz,https://altyn-market-admin-stage-production.up.railway.app`
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (required; without it the API
  starts an in-memory demo catalog and no staff or catalog changes persist)
- `JWT_ACCESS_SECRET=<secret>`
- `JWT_REFRESH_SECRET=<secret>`
- `PAYMENT_PROVIDER=mock`
- `OTP_PROVIDER=console`
- `PUSH_PROVIDER=console`
- `DELIVERY_FLAT_FEE_KZT=1500`

### Persistent product photos

The backoffice can save a product's external `imageUrl` without additional
storage. To use its **Upload photo** control in Railway, attach a persistent
Railway Volume to `altyn-market-api-stage` at `/data` and set
`UPLOAD_DIR=/data/uploads` in that service. Otherwise uploaded files are kept
only in the API container and can disappear after a redeploy.

## Admin

Use `railway.admin.json`.

- Build: `pnpm build:admin`
- Start: `pnpm --filter @altyn-market/admin start`
- Healthcheck: `/health`

Deploy command used:

```bash
cp railway.admin.json railway.json
railway up --service altyn-market-admin-stage --environment production --detach
rm railway.json
```

Required variables:

- `NODE_ENV=production`
- `PUBLIC_API_BASE_URL=https://altyn-market-api-stage-production.up.railway.app`
- `PUBLIC_REALTIME_URL=wss://altyn-market-api-stage-production.up.railway.app/realtime`

## Landing

Use `railway.landing.json`.

- Build: `pnpm build:landing`
- Start: `pnpm --filter @altyn-market/landing start`
- Healthcheck: `/health`

Deploy command used:

```bash
cp railway.landing.json railway.json
railway up --service altyn-market-landing-stage --environment production --detach
rm railway.json
```

Optional build variable:

- `VITE_CUSTOMER_APP_URL=<customer app universal link>`

## Custom Domains

Keep the domain on Hoster.kz nameservers. In the Hoster.kz DNS records interface, add the
following CNAME records and leave the TTL at its default value:

| Name | Type | Value | Service |
| --- | --- | --- | --- |
| `www` | `CNAME` | `gusqqlbf.up.railway.app` | `www.altyn-market.kz` landing |
| `admin` | `CNAME` | `visrs5xr.up.railway.app` | `admin.altyn-market.kz` backoffice |

The root domain already has MX and SPF records, so do not add a standard root CNAME alongside
them. If Hoster.kz offers an `ALIAS`/`ANAME` or CNAME-flattening record, point it to
`ucf7h7i1.up.railway.app`; otherwise configure Hoster.kz URL forwarding from
`altyn-market.kz` to `https://www.altyn-market.kz`.

The API `WEB_ORIGIN` variable permits both the custom admin domain and its Railway fallback URL
while DNS propagates.
