# Secrets management

Every runtime secret lives in a sops-encrypted dotenv file committed to this
repository. The encrypted files are safe to commit: variable names are visible,
values are ciphertext. There is exactly one master key (an age keypair) that
decrypts them.

| Where | What |
| --- | --- |
| `infra/secrets/staging.env` | staging environment, deployed by CI to `/etc/altyn-market/staging.env` on the staging VPS |
| `infra/secrets/production.env` | production environment, prepared in advance; a production deploy workflow will push it the same way |
| `~/Library/Application Support/sops/age/keys.txt` (operator laptop) | age private key — **back it up in a password manager**; losing it means losing every encrypted value |
| GitHub secret `SOPS_AGE_KEY` (staging environment) | the same age private key, used by the deploy workflow to decrypt |

## Editing secrets

```bash
brew install sops age        # once per machine
sops infra/secrets/staging.env   # decrypts, opens $EDITOR, re-encrypts on save
sops decrypt infra/secrets/staging.env   # print plaintext to stdout
```

Commit the re-encrypted file like any other change. The deploy workflow
decrypts it and replaces `/etc/altyn-market/staging.env` on every staging
deploy, so the repository — not the VPS — is the source of truth. The deploy
fails on purpose if any value still says `CHANGEME`.

To onboard another operator or machine: generate a keypair with `age-keygen`,
add its public key to `.sops.yaml`, and run `sops updatekeys infra/secrets/*.env`.

## Registry: what each secret is and where it comes from

### Application

| Variable | What it is | Where to get / how to generate |
| --- | --- | --- |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | sign API auth tokens | `openssl rand -hex 32`; unique per environment |
| `DATABASE_URL`, `POSTGRES_*` | compose-internal PostgreSQL | password: `openssl rand -hex 24`; URL-encode it inside `DATABASE_URL` if it ever contains reserved characters |
| `TC_TELECOM_API_KEY` | TC Telecom OMNI SMS gateway (OTP delivery), production only | issued by the TC Telecom account manager; dashboard: <https://acc.tc-telecom.com>. Sender `TC_INFO`, ~14 KZT per SMS — watch the balance |
| `SMS_PROVIDER` | `console` (log the code) or `tc_telecom` (real SMS) | keep `console` on staging so the +77000000xx e2e accounts can log in |
| `PAYMENT_PROVIDER`, `KASPI_*` | payment integration | Kaspi merchant onboarding (pending) |
| `AUTH_DEV_OTP`, `AUTH_EXPOSE_DEV_CODE` | fixed OTP code / return code in API response | staging convenience only; must be absent in production |
| `BOOTSTRAP_ADMIN_PHONE` | phone that gets the super-admin staff profile on boot | operator's real phone in production |

### Staging gate & TLS

| Variable | What it is | Where to get / how to generate |
| --- | --- | --- |
| `STAGING_ACCESS_USER` / `STAGING_ACCESS_PASSWORD_HASH` | HTTP Basic gate in front of staging | hash: `docker run --rm caddy:2.10-alpine caddy hash-password --plaintext '<password>'`, then double every `$` as `$$` for compose |
| `STAGING_ACCESS_SESSION_TOKEN` | staging cookie value Caddy sets after Basic auth | `openssl rand -hex 32` |
| `ACME_EMAIL` | Let's Encrypt account email for Caddy | ops mailbox |

### CI / infrastructure (not in the env files)

| Secret | Where it lives | Purpose |
| --- | --- | --- |
| `SOPS_AGE_KEY` | GitHub → staging environment | decrypt `infra/secrets/*.env` during deploy |
| `STAGING_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_PORT`, `STAGING_SSH_PRIVATE_KEY`, `STAGING_SSH_KNOWN_HOSTS` | GitHub → staging environment | SSH access for the deploy workflow |
| VPS backup credentials (`RESTIC_*`, S3 keys) | `/etc/altyn-market/staging-backup.env` on the VPS, mode 0600 | nightly PostgreSQL backups (see `infra/README.md`) |
| Expo/EAS and App Store credentials | EAS servers / Apple Developer portal | mobile builds; managed via `eas credentials`, not stored here |

When you add a new external service, add its variable to the encrypted env
file(s) **and** a row here saying where the credential came from.
