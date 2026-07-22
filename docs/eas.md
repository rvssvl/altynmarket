# EAS mobile delivery

Both applications have separate EAS projects and update channels:

| Application | EAS project | Temporary TestFlight ID | Corporate release ID |
| --- | --- | --- |
| Customer | `@rassul.rakhimzhan/altyn-market-customer` | `kz.altynmarket.customer.demo` | `kz.altynmarket.customer` |
| Staff | `@rassul.rakhimzhan/altyn-market-staff` | `kz.altynmarket.staff.demo` | `kz.altynmarket.staff` |

The `development`, `preview`, and `production` profiles live in each app's
`eas.json`. They all currently use the deployed Railway API URL. The URL is public
configuration baked into the app as `EXPO_PUBLIC_API_BASE_URL`, not a secret.

## Build commands

The commands use a pinned EAS CLI, so no global installation is required.

```bash
# Customer preview build for internal testing
pnpm --filter @altyn-market/mobile-customer eas:build:preview

# Staff preview build for internal testing
pnpm --filter @altyn-market/mobile-staff eas:build:preview

# Personal-account TestFlight demo builds
pnpm --filter @altyn-market/mobile-customer eas:build:demo
pnpm --filter @altyn-market/mobile-staff eas:build:demo

# Upload the most recent iOS build for each app to TestFlight
pnpm --filter @altyn-market/mobile-customer eas:submit:demo
pnpm --filter @altyn-market/mobile-staff eas:submit:demo

# Store-ready builds
pnpm --filter @altyn-market/mobile-customer eas:build:production
pnpm --filter @altyn-market/mobile-staff eas:build:production
```

`preview` creates an internally distributable build. `production` creates a store
build and increments the remote build number. The first Android build lets EAS
create and securely retain an Android signing key.

The `demo` profile produces Store-distribution iOS binaries for the first
TestFlight round on the personal Apple account. It uses a separate `demo` update
channel and temporary identifiers so the corporate identifiers remain available
for the future client-owned release. Before the corporate TestFlight build,
switch the identifiers and display names in the mobile app configurations to the
corresponding values in the final column above.

Before the first demo upload, create two App Store Connect app records under the
personal Apple Developer account. Use the temporary identifiers from the table,
unique SKUs such as `altyn-market-customer-demo` and `altyn-market-staff-demo`,
and do not submit either app to App Review. EAS will ask for Apple Developer
credentials the first time it creates a store build; enter them only in the
interactive terminal prompt, never in source files or chat.

## OTA updates

After a compatible build has been installed, release JavaScript, styling, and
asset-only changes to a channel:

```bash
pnpm --filter @altyn-market/mobile-customer eas:update:production -- --message "Fix checkout"
pnpm --filter @altyn-market/mobile-staff eas:update:preview -- --message "Update picker flow"
pnpm --filter @altyn-market/mobile-customer eas:update:demo -- --message "Prepare client demo"
```

Do not use EAS Update for a native dependency, permission, Expo SDK, or native
configuration change. Make a new binary instead. Android updates use the Expo
app version (`0.1.0` initially) as their runtime version; the existing iOS native
projects use `1.0.0`. Bump the relevant runtime version before releasing a binary
that changes native code.

## Corporate account migration (attempted 2026-07-22, paused)

We tried to move both apps to the client's App Store Connect account and rolled
everything back the same day. TestFlight uploads continue on the personal
account with the `.demo` identifiers until the client has a DUNS number and a
proper Organization enrollment.

Client account facts: Account Holder "Win Light" (contact@altyn-market.kz),
provider name "Adlet Jumashev", ASC provider ID 129171349, enrolled as
Individual. Rassul's Apple ID (personal team `L3Q4L68M3P`, Individual) holds an
ASC Admin role on the client team but has no developer-portal access there, so
EAS cannot sign builds for that team under his login.

Lessons that cost a day — read before retrying:

- Both apps have committed native `ios/` directories, so EAS Build ignores
  `ios.bundleIdentifier` in `app.json` and reads the native code. An identifier
  change must be made in each app's `project.pbxproj` (two
  `PRODUCT_BUNDLE_IDENTIFIER` entries) and `Info.plist` (display name, URL
  scheme, associated bundle ID), or via `expo prebuild --clean`.
- The EAS "Select a Provider" prompt is App Store Connect only; it does not
  affect signing. The signing team is the developer-portal team, printed as
  `› Team <name> (<id>)`. If no "Select a team" prompt appears, the Apple ID
  belongs to a single portal team and EAS picks it silently.
- An ASC Admin role does not grant developer-portal access. That requires the
  separate "Access to Certificates, Identifiers & Profiles" (Developer
  Resources) permission on the user, set by the Account Holder — or a one-time
  EAS login as the Account Holder via `EXPO_APPLE_ID=<apple id>` (their 2FA
  device is needed once; the resulting credentials are stored on EAS servers
  and later builds run without Apple login).
- EAS caches the Apple session, including the team choice, in `~/.app-store`.
  `rm -rf ~/.app-store` forces a fresh login.
- Side effect left in place: `kz.altynmarket.customer` and
  `kz.altynmarket.staff` are registered as identifiers (with stray provisioning
  profiles) on the personal team `L3Q4L68M3P`. Harmless; delete them at
  developer.apple.com → Identifiers when convenient. No ASC app records were
  created with them, so the corporate team can still register them.
- Keep it that way: do NOT create App Store Connect app records with the
  corporate identifiers on the personal account — an ASC app record locks its
  bundle ID to that account permanently.

Resume checklist once the corporate (Organization) account exists: switch the
identifiers and display names in `app.json` and the native iOS projects to the
corporate values from the table above, drop the old `ascAppId` values from both
`eas.json` files, obtain portal access to the corporate team (permission above
or Account Holder login), and decline reusing the `L3Q4L68M3P` distribution
certificate and push key so EAS creates fresh ones under the corporate team.
After the first `eas submit`, pin the new numeric app IDs as
`submit.demo.ios.ascAppId`.

## Required account setup before store release

1. Apple: an active Apple Developer Program membership for `rassul.rakhimzhan`.
   During the first iOS build, sign in when EAS requests it and allow it to create
   or reuse the distribution certificate and provisioning profile.
2. Google: a Google Play Console developer account before the first Play Store
   submission. It is not needed for an Android preview APK.
3. Push notifications: create an Apple APNs authentication key and a Firebase
   project with FCM v1 credentials before enabling production push delivery. EAS
   can then upload the native credentials; the backend must use the resulting Expo
   push tokens.
