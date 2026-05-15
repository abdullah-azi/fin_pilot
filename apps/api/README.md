# FinPilot API

FastAPI backend for the FinPilot mobile app.

## Run

```bash
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
copy .env.example .env
python -m app.db.bootstrap
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
