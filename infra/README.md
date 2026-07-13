# Staging VPS deployment

This directory deploys the API, backoffice, landing site, and a staging-only
PostgreSQL database to one Ubuntu 24.04 VPS. It is deliberately separate from
production: it uses mock payments and console OTP, and it has no access to
production credentials or data.

## One-time VPS setup

1. Create an Ubuntu 24.04 VPS in Kazakhstan and set the PS Cloud security group
   to allow TCP 80/443 and SSH only from an operator-controlled IP or VPN.
2. Log in as root using an SSH key and run:

   ```bash
   DEPLOY_USER=altyn-deploy bash bootstrap-vps.sh
   ```

3. Add the GitHub Actions deploy public key to
   `/home/altyn-deploy/.ssh/authorized_keys` and set ownership to
   `altyn-deploy:altyn-deploy`.
4. Copy `env/staging.env.example` to `/etc/altyn-market/staging.env`, replace
   every placeholder with a strong secret, and make it readable only by root
   and the `altyn-deploy` group.
5. Point the three staging DNS names at the VPS IPv4 address before the first
   deployment. Caddy obtains and renews the TLS certificates automatically.

The bootstrap script is in `scripts/bootstrap-vps.sh`; copy it to the server
before running it. Do not run it from the release workflow.

## GitHub Actions secrets

Create a GitHub Environment named `staging` and add these secrets:

- `STAGING_HOST` - VPS IPv4 address or hostname.
- `STAGING_SSH_USER` - `altyn-deploy`.
- `STAGING_SSH_PORT` - normally `22`.
- `STAGING_SSH_PRIVATE_KEY` - the private half of a dedicated CI-only ED25519 key.
- `STAGING_SSH_KNOWN_HOSTS` - output of `ssh-keyscan -H <vps-ip>` verified
  against the PS Cloud console.

The deploy workflow uploads a commit-SHA release directory, switches the
`current` symlink only after the release is available, then starts Docker
Compose. Environment secrets stay at `/etc/altyn-market/staging.env`; they are
never copied by CI and never committed.

## Backups

This single-VPS staging database is not a production database. Configure an
encrypted nightly `pg_dump` to a private Kazakhstan-resident object-storage
bucket before using it for customer testing. Test a restore after the first
backup and at least monthly.
