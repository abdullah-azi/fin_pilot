# FinPilot Railway Backend Deploy Guide

This is the production-oriented Railway checklist for deploying the FinPilot backend.

It is written for your current repo structure, current FastAPI app, current Postgres setup, and the way the mobile APK will consume the API.

## Recommended architecture

Use:

1. Railway for the FastAPI backend
2. Railway Postgres for the database
3. S3-compatible object storage for profile images and future uploaded files

Do not rely on Railway container-local filesystem for production media persistence.

## Why Railway fits this app

FinPilot's backend is not a tiny stateless function. It already includes:

- auth and session handling
- Postgres-backed data
- CSV/XLSX imports
- AI endpoints
- notifications
- profile image upload
- password reset

That is a better fit for Railway than for function-first platforms.

## Repo structure you are deploying

Backend app root:

```text
apps/api
```

Important backend files:

- [apps/api/app/main.py](</d:/Documents/My Projects/FinPilot/apps/api/app/main.py>)
- [apps/api/requirements.txt](</d:/Documents/My Projects/FinPilot/apps/api/requirements.txt>)
- [apps/api/alembic.ini](</d:/Documents/My Projects/FinPilot/apps/api/alembic.ini>)
- [apps/api/alembic](</d:/Documents/My Projects/FinPilot/apps/api/alembic>)

## Service-wise setup

Set this up service by service in Railway.

### Service 1: PostgreSQL

Create a **PostgreSQL** service first.

What to do:

1. add a new PostgreSQL service in Railway
2. wait for it to finish provisioning
3. copy the generated connection string

What you need from it:

- the Railway Postgres connection string for `DATABASE_URL`

Which connection to use:

- for the **Railway backend service talking to Railway Postgres**, use the **private/internal** connection
- for **your laptop, external DB tools, or anything outside Railway**, use the **public/TCP proxy** connection only when needed

What to remember:

- production does **not** need `TEST_DATABASE_URL`
- this Postgres service should exist before you try migrations or backend boot
- for FinPilot production, `DATABASE_URL` in the backend service should come from the **private** Postgres connection, not the public one

### Service 2: Backend API

Create the backend service from this repo.

Use:

```text
apps/api
```

as the project root / root directory.

If Railway asks what part of the repo to deploy, it should be the backend folder above.

What to set first in this service:

1. root directory: `apps/api`
2. build command
3. start command
4. environment variables
5. `DATABASE_URL` from the **private** Railway Postgres connection

#### Backend build command

Use:

```bash
python -m pip install --upgrade pip && python -m pip install -r requirements.txt
```

#### Backend start command

Use:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Service 3: Object storage

This is not a Railway service in the same sense as Postgres/app, but it is part of the production setup.

Use an S3-compatible provider for:

- profile images
- future uploaded files

Examples:

- Cloudflare R2
- Backblaze B2 S3 API
- AWS S3
- MinIO

This is strongly preferred over Railway local filesystem.

Full S3 env/setup details are in:

- [s3-storage-setup-guide.md](</d:/Documents/My Projects/FinPilot/documents/s3-storage-setup-guide.md>)

## Backend service runtime notes

This backend currently targets modern Python in `pyproject.toml`.

If Railway/Nixpacks gives you a Python version choice, use a recent supported version compatible with your dependencies. If `3.13` causes platform friction, `3.12` is the safer fallback in many hosted environments.

## Backend service database connection

Use the Railway Postgres connection string for:

```env
DATABASE_URL=postgresql+psycopg://...
```

For FinPilot on Railway:

- `DATABASE_URL` should use the **private/internal** Postgres connection string
- do **not** use the public/TCP proxy string for normal backend-to-database communication
- only use the public connection string from outside Railway, for example:
  - local admin tools
  - manual inspection from your laptop
  - external scripts that are not running inside Railway

For production, you do **not** need:

- `TEST_DATABASE_URL`

That is only for local/test automation.

## Backend service environment variables

Set these in Railway.

### Core app

```env
APP_ENV=production
API_V1_PREFIX=/api/v1
JWT_SECRET_KEY=your-long-random-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=30
DATABASE_CONNECT_TIMEOUT_SECONDS=5
```

### Database

```env
DATABASE_URL=postgresql+psycopg://...
```

### AI provider

```env
AI_PROVIDER=deepseek
AI_MODEL=deepseek-v4-flash
AI_BASE_URL=https://api.deepseek.com
AI_API_KEY=...
```

### Password reset email

```env
RESEND_API_KEY=...
RESEND_BASE_URL=https://api.resend.com
RESEND_FROM_EMAIL=FinPilot <onboarding@resend.dev>
RESEND_REPLY_TO_EMAIL=your-email@example.com
PASSWORD_RESET_URL_BASE=finpilot://reset-password
```

Important:

- `PASSWORD_RESET_URL_BASE` should stay the mobile deep link if you want the app to open directly from the email
- `onboarding@resend.dev` is only good for self-use/testing under Resend's restrictions
- for real users, you should later switch to your own verified sender domain

### Storage

Recommended production configuration:

```env
STORAGE_BACKEND=s3
S3_BUCKET_NAME=...
S3_REGION=...
S3_ENDPOINT_URL=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_BASE_URL=https://your-public-storage-url
S3_FORCE_PATH_STYLE=false
```

If you use:

- Cloudflare R2
- MinIO
- Backblaze B2 S3 API
- another S3-compatible provider

then `S3_ENDPOINT_URL` matters.

### Push notifications

Current push config defaults are already sane, but you can still set:

```env
EXPO_PUSH_BASE_URL=https://exp.host/--/api/v2/push/send
EXPO_PUSH_TIMEOUT_SECONDS=15
```

### Allowed origins

For the mobile APK, CORS is not a big issue because native mobile requests are not browser requests.

But if you still want to keep web/dev clients working, set:

```env
ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006
```

Later, if you add a real web frontend, include that origin too.

## PostgreSQL service responsibilities

The Postgres service is responsible for:

1. storing all app data
2. existing before migrations run
3. staying reachable from the backend service

If the backend deploys but `health/ready` fails, the first suspect is still the Postgres service.

## Backend service production behavior

Because `APP_ENV=production`, the backend will **not** auto-run schema bootstrap on startup the same way it does in development.

That is intentional.

Production order should be:

1. Postgres exists
2. env vars are set
3. Alembic migration is run
4. backend starts

## Migrations step

This backend now uses Alembic.

Migration command:

```bash
alembic -c alembic.ini upgrade head
```

Run that against the Railway production database before trusting the deployed API.

You can do this from:

1. Railway shell / command execution
2. Railway CLI
3. a temporary one-off deploy command

Do **not** treat `python -m app.db.bootstrap` as the production migration path anymore.

## Backend public URL

After deploy, Railway gives you a public domain, typically like:

```text
https://your-service-name.up.railway.app
```

Your API base becomes:

```text
https://your-service-name.up.railway.app/api/v1
```

That is what the mobile APK should use.

## Mobile app configuration after backend deploy

Before building the APK, set:

```env
EXPO_PUBLIC_API_URL=https://your-service-name.up.railway.app/api/v1
```

Do not leave it as:

- `127.0.0.1`
- `localhost`
- `10.0.2.2`

Those are only for local development.

## Object storage service choices

### Recommended

Use S3-compatible storage in production.

Reason:

- Railway deploys are not where you want persistent uploaded media to live
- profile images and future files should survive deploys and instance replacement

### Temporary fallback

If you insist on local storage just for short testing:

```env
STORAGE_BACKEND=local
LOCAL_STORAGE_ROOT=uploads
LOCAL_STORAGE_PUBLIC_BASE_URL=/uploads
```

But that is not the real production setup.

## Health checks after backend deploy

Test these first:

```text
GET /api/v1/health/
GET /api/v1/health/live
GET /api/v1/health/ready
```

Especially:

```text
https://your-service-name.up.railway.app/api/v1/health/ready
```

If `ready` fails:

- DB connection is wrong
- Postgres is down
- migrations were not applied

## End-to-end verification after all services are up

After health checks, test in this order:

1. signup
2. login
3. forgot password
4. dashboard load
5. add transaction
6. history
7. savings goals
8. AI purchase check
9. AI savings advice
10. CSV/XLSX import
11. profile image upload
12. export/report flow

## Object storage notes for profile images

The backend now supports:

- local storage backend
- S3-compatible backend

Production should use the S3 backend.

The database stores:

- `profile_image_url`
- `profile_image_storage_key`

So deleting/replacing images no longer depends on parsing local file paths.

## Password reset service notes

The password reset flow is deployed-ready, but the email sender setup still matters.

For self-use:

- Resend with `resend.dev` can be enough

For real users:

- switch to a verified sender/domain later

The mobile deep link is already wired:

```text
finpilot://reset-password?token=...
```

## Notification service notes

The backend notification endpoints can run on Railway, but actual useful device push behavior depends more on the mobile build side than the backend hosting side.

So after Railway deploy:

- backend notification endpoints can work
- you still need a real APK/dev build for realistic device-side testing

## Service-by-service debugging

### If Postgres is the problem

Check:

1. Railway Postgres is provisioned
2. `DATABASE_URL` is copied correctly
3. backend can reach the database
4. migrations actually ran

### If backend is the problem

Check:

1. build command
2. start command
3. app logs
4. `health/live`
5. `health/ready`

### If storage is the problem

Check:

1. `STORAGE_BACKEND`
2. bucket name
3. endpoint URL
4. public base URL
5. access key / secret

## General logs and debugging

If Railway deploy succeeds but app behavior is wrong, inspect:

1. Railway app logs
2. `health/ready`
3. whether `DATABASE_URL` is correct
4. whether Alembic ran
5. whether AI keys are valid
6. whether storage env vars are valid

For image failures specifically, check:

- `STORAGE_BACKEND`
- bucket/endpoint/public URL
- credentials

## Practical first production-like setup

For FinPilot, the best first hosted arrangement is:

1. Railway backend
2. Railway Postgres
3. S3-compatible storage
4. Expo APK pointing to Railway URL

That is enough for your own real-device usage without buying a custom domain yet.

## What not to forget

Before calling the deployment "done", confirm:

- `APP_ENV=production`
- `DATABASE_URL` is from Railway Postgres
- Alembic migration ran
- `EXPO_PUBLIC_API_URL` points to Railway
- storage is **not** relying on local filesystem for real production use
- password reset sender config is present
- backend health endpoints respond publicly

## Recommended deployment order

Use this order exactly:

1. create Railway Postgres
2. copy the **private/internal** Postgres connection string
3. create Railway backend service from `apps/api`
4. set backend environment variables
5. set `DATABASE_URL` in backend service using the **private** Postgres connection
6. run `alembic -c alembic.ini upgrade head`
7. verify `health/ready`
8. update mobile API URL
9. build/install APK
10. test end to end on device
