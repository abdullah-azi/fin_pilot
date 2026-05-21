# FinPilot API

FastAPI backend for the FinPilot mobile app.

## Run

```bash
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8001
```

## Initial Modules

- `app/api`: HTTP routes and versioned routers
- `app/core`: config and app-wide settings
- `app/db`: engine, metadata, and schema bootstrap
- `app/models`: SQLAlchemy ORM models for the application schema
- `app/schemas`: response and request models
- `app/services`: business logic, finance calculations, and AI provider adapters

## AI Provider Config

The backend is configured to use DeepSeek as the default provider through its OpenAI-compatible endpoint.

- `AI_PROVIDER=deepseek`
- `AI_MODEL=deepseek-v4-flash`
- `AI_BASE_URL=https://api.deepseek.com`
- `AI_API_KEY` or `DEEPSEEK_API_KEY`

## Storage Backends

Profile images now use a storage backend abstraction instead of assuming the local filesystem.

- Development default:
  - `STORAGE_BACKEND=local`
  - `LOCAL_STORAGE_ROOT=uploads`
  - `LOCAL_STORAGE_PUBLIC_BASE_URL=/uploads`
- Production-ready S3-compatible option:
  - `STORAGE_BACKEND=s3`
  - `S3_BUCKET_NAME`
  - `S3_REGION`
  - `S3_ENDPOINT_URL` for S3-compatible providers such as Cloudflare R2 or MinIO
  - `S3_ACCESS_KEY_ID`
  - `S3_SECRET_ACCESS_KEY`
  - `S3_PUBLIC_BASE_URL`

Local storage is still mounted by FastAPI at `/uploads`. S3 storage returns the configured public URL directly and does not rely on local file serving.

## Migrations

Alembic is now configured in this app.

Common commands:

```bash
alembic upgrade head
alembic revision -m "describe change"
alembic downgrade -1
```

`app.db.bootstrap` still exists for local/test compatibility, but Alembic should be treated as the migration source of truth going forward.
