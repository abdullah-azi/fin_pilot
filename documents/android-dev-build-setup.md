# FinPilot Android Dev Build Setup

This is the path from the current Expo Go workflow to a proper Android development build for FinPilot.

## Why move to a dev build

Use a dev build instead of Expo Go when you need more reliable behavior for:

- notifications
- image picking
- document picking
- file sharing
- deep links
- native Android behavior in general

For FinPilot, this is the correct next step.

## Current repo status

Right now:

- `apps/mobile/app.json` already has `scheme: "finpilot"`
- `apps/mobile/app.json` already includes `expo-notifications`
- `apps/mobile` does **not** yet have `eas.json`
- `apps/mobile` does **not** yet include `expo-dev-client`

So dev build setup is not finished yet.

## Prerequisites

You need:

1. an Expo account
2. `eas-cli` installed
3. Android phone with USB debugging enabled
4. backend running locally on port `8001`
5. `adb` available from `C:\platform-tools`

## 1. Install EAS CLI

Run:

```powershell
npm install -g eas-cli
```

Then log in:

```powershell
eas login
```

## 2. Add Expo dev client

From `apps/mobile`:

```powershell
cd "D:\Documents\My Projects\FinPilot\apps\mobile"
npx expo install expo-dev-client
```

## 3. Configure EAS in this app

From `apps/mobile`:

```powershell
eas build:configure
```

This should create `eas.json`.

For FinPilot, a simple starting `eas.json` should look like:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

## 4. Make sure Expo project ID is available

FinPilot’s notification registration code uses the Expo project ID.

After `eas build:configure`, Expo usually links the project and provides the project ID through EAS config. If needed, confirm:

- `apps/mobile/app.json`
- or Expo account project linkage

If push registration later fails, this is one of the first things to check.

## 5. Keep the mobile API pointed at local backend

For USB-based local development, `apps/mobile/.env` should stay:

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8001/api/v1
```

## 6. Start backend

From `apps/api`:

```powershell
cd "D:\Documents\My Projects\FinPilot\apps\api"
.\.venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

If startup hangs, make sure Docker/Postgres is running first.

## 7. Prepare USB reverse

In PowerShell:

```powershell
Remove-Item Env:ANDROID_SDK_ROOT -ErrorAction SilentlyContinue
$env:Path = "C:\platform-tools;$env:Path"

adb devices
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8001 tcp:8001
```

Your phone must show as `device`, not `unauthorized`.

## 8. Build and install the Android dev client

From `apps/mobile`:

```powershell
cd "D:\Documents\My Projects\FinPilot\apps\mobile"
eas build --profile development --platform android
```

After the build finishes:

- install the generated build on your phone
- this becomes your FinPilot dev client app

## 9. Start Metro for the dev client

From `apps/mobile`:

```powershell
npx expo start --dev-client --clear
```

Then open the installed FinPilot dev client on the phone.

If it does not connect automatically, force-open the Metro URL:

```powershell
adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081"
```

## 10. Daily workflow after setup

Each time:

1. start Docker/Postgres if needed
2. start backend on `8001`
3. run USB reverse
4. run:

```powershell
npx expo start --dev-client --clear
```

5. open the installed FinPilot dev client

## Expected benefits

After switching to a dev build, FinPilot should behave more reliably for:

- push notifications
- CSV/XLSX import
- profile image upload
- password reset deep links
- file export/share

## Common failures

### Blank screen on app open

Usually:

- Expo Go cache issue
- wrong connection mode
- trying to use Expo Go instead of a dev build

For FinPilot, prefer the dev build.

### Backend not reachable

Check:

- backend is running
- `adb reverse tcp:8001 tcp:8001` was run
- `EXPO_PUBLIC_API_URL` is `http://127.0.0.1:8001/api/v1`

### Push registration fails

Check:

- physical device, not emulator-only assumptions
- Expo project ID exists
- notifications permission granted
- dev client installed, not Expo Go

## Recommended next repo changes

After using this doc, the next concrete repo work should be:

1. add `expo-dev-client`
2. add `eas.json`
3. create the first Android development build

