# FinPilot Expo Build Guide

This is the full build guide for getting FinPilot onto your Android phone through Expo/EAS.

It covers:

1. one-time setup
2. APK builds
3. dev builds
4. production app bundle builds
5. the exact parts that matter for this repo

## What you are building

For FinPilot, there are 3 useful Android build modes:

1. **development**
   - development client
   - best for native debugging and testing notifications properly

2. **preview**
   - installable APK
   - best for your own phone testing

3. **production**
   - Android App Bundle (`.aab`)
   - used for Play Store distribution later

Current config is already in:

- [apps/mobile/eas.json](</d:/Documents/My Projects/FinPilot/apps/mobile/eas.json>)

## Repo status

This repo already has:

- [apps/mobile/eas.json](</d:/Documents/My Projects/FinPilot/apps/mobile/eas.json>)
- [apps/mobile/app.json](</d:/Documents/My Projects/FinPilot/apps/mobile/app.json>)
- [/.github/workflows/expo-android-build.yml](</d:/Documents/My Projects/FinPilot/.github/workflows/expo-android-build.yml>)

Important mobile app details already present:

- app scheme: `finpilot`
- notifications plugin enabled
- Expo Router setup in place

## What you need before building

You need:

1. an Expo account
2. `eas-cli`
3. project linked with Expo/EAS
4. a real backend URL

For your APK, the backend should normally be the Railway URL, not localhost.

## 1. Install EAS CLI

```powershell
npm install -g eas-cli
```

## 2. Log into Expo

```powershell
eas login
```

## 3. Install mobile dependencies

From `apps/mobile`:

```powershell
cd "D:\Documents\My Projects\FinPilot\apps\mobile"
npm ci
```

## 4. Link the app to Expo/EAS

If this is the first EAS setup for this app:

```powershell
eas build:configure
```

This links the app to Expo/EAS if needed.

Even though `eas.json` already exists in the repo, the project linkage still matters.

## 5. Set the backend URL

Update:

- [apps/mobile/.env](</d:/Documents/My Projects/FinPilot/apps/mobile/.env>)

Use your Railway backend:

```env
EXPO_PUBLIC_API_URL=https://your-service-name.up.railway.app/api/v1
```

Do not leave it as:

- `127.0.0.1`
- `localhost`
- `10.0.2.2`

Those are only for local development and emulator testing.

## 6. Understand the current EAS profiles

Current profiles in [eas.json](</d:/Documents/My Projects/FinPilot/apps/mobile/eas.json>):

### `development`

- `developmentClient: true`
- `distribution: internal`

Use when:

- you want a dev client
- you want better native testing than Expo Go
- you want to test notifications, deep links, file handling more realistically

### `preview`

- `distribution: internal`
- Android `buildType: apk`

Use when:

- you want a directly installable APK
- you want to put FinPilot on your own phone quickly

### `production`

- Android `buildType: app-bundle`

Use when:

- you want the Play Store package later

## 7. Build an APK

From `apps/mobile`:

```powershell
cd "D:\Documents\My Projects\FinPilot\apps\mobile"
eas build --platform android --profile preview
```

This is the command you want for your current goal.

Why:

- `preview` produces an APK
- APK is directly installable on your Android phone

## 8. Install the APK

After the build finishes:

1. Expo gives you a build page URL
2. open it
3. download the APK
4. install it on your phone

If Android blocks the install:

- allow installs from the browser or file manager you used

## 9. Test the installed APK

Once the app is installed:

1. open FinPilot
2. sign up or log in
3. test the hosted backend flow

Minimum tests:

1. signup
2. login
3. forgot/reset password
4. dashboard
5. add transaction
6. history
7. savings goals
8. AI
9. CSV/XLSX import
10. profile image upload
11. profile/settings

## 10. Build a dev client instead

If you want a development build instead of just an APK:

```powershell
eas build --platform android --profile development
```

Use this when:

- Expo Go is unreliable
- you want proper native debugging
- you want more accurate push notification/device behavior

For FinPilot, this is the better long-term development path.

## 11. Run the dev client after install

If you install a development build, then you run Metro separately:

```powershell
cd "D:\Documents\My Projects\FinPilot\apps\mobile"
npx expo start --dev-client --clear
```

The installed dev client app connects to Metro.

That is different from the plain APK preview flow.

## 12. Build for Play Store later

When you want a Play Store package:

```powershell
eas build --platform android --profile production
```

That produces an Android App Bundle (`.aab`), not a directly installable APK.

## 13. Important app-specific notes

### Deep links

FinPilot already uses:

```text
finpilot://
```

That is defined in:

- [apps/mobile/app.json](</d:/Documents/My Projects/FinPilot/apps/mobile/app.json>)

This matters for reset-password links and future app links.

### Notifications

Expo Go is not the right place to trust notification behavior fully.

Use:

- dev build
- or installed APK/dev client

for realistic push/device behavior.

### API environment

The biggest mistake before building is forgetting to switch the mobile app from local backend URLs to the Railway public URL.

## 14. GitHub Actions option

There is a manual GitHub Actions workflow:

- [expo-android-build.yml](</d:/Documents/My Projects/FinPilot/.github/workflows/expo-android-build.yml>)

To use it:

1. add repository secret `EXPO_TOKEN`
2. open GitHub Actions
3. run `Expo Android Build`
4. choose a profile:
   - `development`
   - `preview`
   - `production`

For an APK, choose:

- `preview`

## 15. Local vs hosted backend reminder

### Local development

You may use:

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8001/api/v1
```

but only with USB reverse/dev workflow.

### APK testing on your real phone

Use:

```env
EXPO_PUBLIC_API_URL=https://your-service-name.up.railway.app/api/v1
```

That is the correct setting for a real installed build.

## 16. Recommended first path for FinPilot

The cleanest sequence now is:

1. deploy backend to Railway
2. confirm Railway health endpoints work
3. update `apps/mobile/.env` to Railway URL
4. run:

```powershell
cd "D:\Documents\My Projects\FinPilot\apps\mobile"
eas build --platform android --profile preview
```

5. install APK on phone
6. test end to end

## 17. What not to forget

Before building, confirm:

- `eas login` is done
- `apps/mobile/.env` points to Railway
- backend is actually deployed and reachable
- the app is linked to Expo/EAS
- you are using `preview` for APK, not `production`

## 18. Quick commands

### Build APK

```powershell
cd "D:\Documents\My Projects\FinPilot\apps\mobile"
eas build --platform android --profile preview
```

### Build dev client

```powershell
cd "D:\Documents\My Projects\FinPilot\apps\mobile"
eas build --platform android --profile development
```

### Build Play Store bundle

```powershell
cd "D:\Documents\My Projects\FinPilot\apps\mobile"
eas build --platform android --profile production
```

## 19. Best immediate choice

For your current goal, the best next command is:

```powershell
cd "D:\Documents\My Projects\FinPilot\apps\mobile"
eas build --platform android --profile preview
```

That gets FinPilot onto your phone as an APK with the fewest moving parts.
