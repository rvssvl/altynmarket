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
