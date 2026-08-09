# DevOpsManager

DevOpsManager is a production-grade, AI-powered software development management platform. The architecture is intentionally modular, scalable, and cleanly decoupled so AI agents, repository analysis engines, and CI/CD automation can be integrated seamlessly.

## Project Goals

- Provide a robust AI-assisted software development lifecycle (SDLC) platform.
- Cleanly decouple FastAPI backend responsibilities from Next.js frontend UI.
- Support direct GitHub App authorization and automated repository-to-project creation.
- Integrate multi-provider Large Language Model (LLM) analysis (OpenAI & Google Gemini) for automated code reviews, vulnerability detection, and issue tracking.

---

## Architecture Overview

The repository is organized into two core application areas:

- **Frontend**: A Next.js 14 application using the App Router, TypeScript, Tailwind CSS, and custom error boundaries (`error.tsx`, `loading.tsx`, `not-found.tsx`).
- **Backend**: A FastAPI application structured with async SQLAlchemy ORM, Pydantic V2 schemas, Alembic migrations, GitHub integrations, and AI analysis routes.

---

## Folder Structure

### Root

- `.env.example`: Shared environment variables template.
- `docker-compose.yml`: Local container orchestration for frontend, backend, and PostgreSQL services.
- `docker/`: Dockerfiles for backend and frontend container builds.
- `agent.md`: Handoff documentation and project phase roadmap.
- `README.md`: Project documentation and setup instructions.

### Frontend

- `frontend/`: Next.js application root.
  - `package.json`: Dependencies and build scripts (`dev`, `build`, `lint`).
  - `tsconfig.json`: TypeScript configuration.
  - `src/app/`: App Router pages, layouts, error boundaries (`error.tsx`), loading indicators (`loading.tsx`), and 404 handler (`not-found.tsx`).
  - `src/lib/`: Shared utilities, constants, and API helpers.

### Backend

- `backend/`: FastAPI application root.
  - `requirements.txt`: Python dependencies (`fastapi`, `uvicorn`, `sqlalchemy`, `asyncpg`, `openai`, `google-generativeai`, `pytest`, `aiosqlite`).
  - `app/`: Application package.
    - `main.py`: FastAPI entry point with CORS middleware and lifespan health handling.
    - `api/v1/`: Versioned API namespace (`core_routes.py`, `ai_routes.py`, `database_routes.py`).
    - `core/`: Application settings and environment configuration ([config.py](file:///d:/vscode/college/5thsem/sgp/DevOpsManager/backend/app/core/config.py)).
    - `db/`: Database session handling ([session.py](file:///d:/vscode/college/5thsem/sgp/DevOpsManager/backend/app/db/session.py)) and Base model ([base.py](file:///d:/vscode/college/5thsem/sgp/DevOpsManager/backend/app/db/base.py)).
    - `models/`: SQLAlchemy ORM models ([core.py](file:///d:/vscode/college/5thsem/sgp/DevOpsManager/backend/app/models/core.py) for `Project`, `Repository`, `AnalysisRun`, `Issue`).
    - `schemas/`: Pydantic V2 request/response validation schemas (`core.py`, `ai.py`).
    - `services/`: Domain logic services (`ai_service.py`).
    - `integrations/`: GitHub API integration client (`github.py`).
  - `alembic/`: Database migration environment and version scripts.
  - `tests/`: Automated pytest test suite (`test_health.py`, `test_ai_routes.py`, `test_core_api.py`, `test_github_integration.py`).

---

## Environment & Configuration

Environment configuration is managed via `.env` files. You can copy `.env.example` to `.env`:

```env
APP_NAME=DevOpsManager
ENVIRONMENT=development
DEBUG=true

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000

# Backend & Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/devopsmanager

# Integrations (Optional)
GITHUB_TOKEN=your-github-personal-access-token
OPENAI_API_KEY=your-openai-api-key
GEMINI_API_KEY=your-gemini-api-key
```

*Note: Standard PostgreSQL URLs starting with `postgresql://` or `postgres://` are automatically converted to `postgresql+asyncpg://` by the settings validator.*

---

## Getting Started

### 1. Start the Backend API
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```
- **Backend API**: `http://127.0.0.1:8000`
- **Interactive Swagger Docs**: `http://127.0.0.1:8000/docs`

### 2. Start the Frontend App
```bash
cd frontend
npm install
npm run dev
```
- **Frontend App**: `http://localhost:3000`

### 3. Run via Docker Compose
To launch the full stack (PostgreSQL + FastAPI + Next.js):
```bash
docker compose up --build
```

---

## Testing

Run the automated backend test suite (includes in-memory SQLite fixture support):
```bash
cd backend
python -m pytest tests
```

Run frontend TypeScript verification:
```bash
cd frontend
npx tsc --noEmit
```

---

## Phase 4: GitHub App & AI Repository Intelligence

In **Phase 4**, DevOpsManager supports direct GitHub repository integration and AI-assisted analysis:

### 1. Repository-to-Project Workflow
1. User authorizes access to their accessible GitHub repositories.
2. Selecting a repository automatically creates or reuses the corresponding **DevOpsManager Project** (`Repository = Project Source`).
3. User is redirected to `/projects/[project_id]`, displaying real-time repository metadata, issue counts, and stargazers.

### 2. AI Repository Analysis Endpoint (`POST /v1/ai/analyze-repo`)
Send analysis requests specifying prompt instructions and LLM providers (`openai` or `gemini`):

```json
{
  "repo_name": "DevOpsManager",
  "branch": "main",
  "prompt": "Analyze security vulnerabilities, code quality, and architecture.",
  "provider": "openai"
}
```

**Response**:
```json
{
  "status": "success",
  "repo_name": "DevOpsManager",
  "branch": "main",
  "provider_used": "openai",
  "summary": "OpenAI analysis completed for repository 'DevOpsManager' on branch 'main'.",
  "recommendations": [
    "Maintain modular service boundaries between API and DB layers.",
    "Enforce strict typing across all schema contracts.",
    "Implement automated regression tests for versioned routes."
  ],
  "timestamp": "2026-08-09T15:18:43Z"
}
```

---

## Next Horizon: Phase 5 Roadmap

- **Deterministic Repository Parsing**: Reading source tree files directly from GitHub API.
- **Automated Issue Generation**: Converting AI analysis findings into DB `Issue` records (`severity`, `file_path`, `line_number`).
- **Safe Code Fixing**: Generating proposed code fixes for user review before pushing back to GitHub.
