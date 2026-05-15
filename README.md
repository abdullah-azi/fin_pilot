# FinPilot

FinPilot is an AI-assisted personal finance mobile app with a React Native client and a FastAPI backend.

## Project Structure

```text
.
|-- apps
|   |-- api
|   |   |-- app
|   |   |   |-- api
|   |   |   |-- core
|   |   |   |-- schemas
|   |   |   `-- services
|   |   |-- pyproject.toml
|   |   `-- .env.example
|   `-- mobile
|       |-- app
|       |-- components
|       |-- constants
|       `-- package.json
|-- documents
`-- package.json
```

## Apps

- `apps/mobile`: Expo Router mobile app for the FinPilot client
- `apps/api`: FastAPI backend for auth, transaction logic, insights, and AI orchestration

## Quick Start

### Local Database

```bash
docker compose up -d
```

This starts a local PostgreSQL database on `localhost:5433` using the credentials defined in [docker-compose.yml](/d:/Documents/My Projects/FinPilot/docker-compose.yml).

### Mobile

```bash
npm install
npm run mobile:start
```

### API

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
copy .env.example .env
python -m app.db.bootstrap
uvicorn app.main:app --reload --port 8001
```

## Next Build Steps

1. Implement transaction CRUD and category endpoints.
2. Add authentication and token handling.
3. Build savings goal APIs and reporting queries.
4. Add AI provider adapters for Grok, DeepSeek, and a Hugging Face fallback.
