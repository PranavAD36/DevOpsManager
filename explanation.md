# DevOpsManager Explained

## 1. What This Project Is

DevOpsManager is an AI-powered repository intelligence platform. Its purpose is to connect a GitHub repository, inspect its source code, find software and security problems, explain those problems, suggest fixes, and eventually create pull requests containing approved fixes.

The central idea is:

```text
GitHub repository = the source of truth for a DevOpsManager project
```

A project is not intended to be only a manually entered name or URL. The connected GitHub repository provides the source files, repository metadata, branch information, and the code that the analysis engine reviews.

## 2. Current Product Flow

The current workflow is:

```text
Open the frontend
    |
    v
Authorize GitHub
    |
    v
List repositories accessible to the user
    |
    v
Select a repository
    |
    v
Create or reuse a DevOpsManager project
    |
    v
Synchronize repository metadata
    |
    v
Start an analysis run
    |
    v
Fetch selected source files from GitHub
    |
    v
Send the source to OpenRouter or Gemini
    |
    v
Validate the structured AI response
    |
    v
Save issues, explanations, and proposed code fixes
    |
    v
Review, edit, approve, or reject each fix locally
```

The final GitHub write-back step is planned but is not implemented yet. Approving a fix currently changes the issue record in the database; it does not modify GitHub.

## 3. Architecture Overview

```mermaid
flowchart LR
    Browser[Next.js frontend] -->|HTTP JSON, cookies| API[FastAPI API]
    API --> DB[(PostgreSQL)]
    API --> GH[GitHub OAuth and REST APIs]
    API --> AI[OpenRouter or Gemini]
    API --> Migrations[Alembic migrations]
    API --> Models[SQLAlchemy models]
    Models --> DB
```

### Frontend

The frontend is a Next.js 14 application using React, TypeScript, and Tailwind CSS. It uses the App Router and calls the backend through `frontend/src/lib/api.ts`.

Important screens include:

- `/`: home page with project count and recent projects.
- `/projects`: project list and manual project creation.
- `/projects/[id]`: project details, connected repositories, analysis runs, issues, filtering, and fix approval.
- `/repositories/[id]`: repository metadata and refresh controls.
- `/github/connect`: GitHub authorization, accessible repository list, and repository selection.
- `/github/callback`: browser page that forwards OAuth callback parameters to the backend.
- `DiffViewer.tsx`: displays the issue context and proposed corrected code and allows local editing before saving.

The API client sends `credentials: 'include'`, so browser requests include the HTTP-only GitHub cookie used by the backend.

### Backend

The backend is a FastAPI application created in `backend/app/main.py`.

`main.py` does four important things:

1. Creates the FastAPI application and its lifespan handler.
2. Attempts database initialization during startup.
3. Configures CORS for the frontend origin.
4. Registers the versioned router under `/v1`.

The API is divided into route modules:

- `core_routes.py`: projects, repositories, analysis runs, issues, and fix approval.
- `github_routes.py`: GitHub OAuth and repository selection.
- `ai_routes.py`: standalone AI analysis endpoint.
- `database_routes.py`: database health endpoint.
- `routes.py`: combines all version 1 route modules and exposes `/v1/status`.

### Database

SQLAlchemy uses asynchronous database sessions through `backend/app/db/session.py`. PostgreSQL is the normal runtime database. SQLite is used by tests where configured.

Alembic migrations in `backend/alembic/versions/` create and evolve the database schema. The migration environment imports the SQLAlchemy models so Alembic can compare the complete metadata.

## 4. Domain Model

The main data relationship is:

```text
Project
  |
  +-- Repository
  |     |
  |     +-- AnalysisRun
  |     |     |
  |     |     +-- Issue
  |     |
  |     +-- Issue
  |
  +-- AnalysisRun
  |
  +-- Issue
```

### Project

A project is the DevOpsManager workspace. It contains a name, optional description, status, and timestamps. A project can have repositories, analysis runs, and issues.

Deleting a project cascades to its repositories, analysis runs, and issues.

### Repository

A repository belongs to a project and stores the normalized GitHub identity and metadata:

- provider, owner, name, and `full_name`
- GitHub URL and default branch
- active/private/fork state
- language, stars, forks, open issue count, and size
- GitHub creation, update, and push timestamps

`full_name`, such as `owner/repository`, is the main identity used when checking whether a GitHub repository is already connected.

### AnalysisRun

An analysis run records one attempt to review a repository. It stores:

- project and repository IDs
- status, normally `pending`, `running`, `completed`, or `failed`
- start and completion timestamps
- a summary from the AI provider
- an error message when the run fails

An analysis run is linked to the issues produced during that run.

### Issue

An issue is a detected problem. It can contain:

- title and description
- severity: `low`, `medium`, `high`, or `critical`
- status, initially `open`
- category, file path, and line number
- human-readable `suggested_fix`
- AI-generated `corrected_code`
- `approved_at` when the user approves it

Issues may be manually created through the API or generated by an analysis run.

## 5. GitHub Authorization and Repository Connection

### OAuth flow

1. The frontend asks `GET /v1/github/authorize` for an authorization URL.
2. The backend creates a random OAuth state value and stores it in the HTTP-only `github_oauth_state` cookie.
3. The browser visits GitHub.
4. GitHub redirects to `/v1/github/callback` with `code` and `state`.
5. The backend compares the returned state with the stored state using constant-time comparison.
6. The backend exchanges the code for an access token.
7. The access token is stored in an HTTP-only `github_access_token` cookie.
8. The browser is redirected back to the frontend.

The access token is read server-side by `_get_access_token()`. It can come from the cookie or a Bearer authorization header. The frontend does not need to read the token.

### Selecting a repository

`POST /v1/github/repositories/connect` accepts repository information such as `full_name`, owner, name, URL, branch, and description.

The backend:

1. Normalizes the repository values.
2. Searches for an existing GitHub repository with the same `full_name`.
3. Reuses the existing project and repository when found.
4. Otherwise creates a project named after the repository and creates its repository record.
5. Returns both `project_id` and `repository_id`.

There is also a project-scoped endpoint, `POST /v1/projects/{project_id}/repositories/connect`, which accepts a GitHub URL and fetches current metadata before saving it.

## 6. Repository Analysis

The main analysis endpoint is:

```text
POST /v1/repositories/{repository_id}/analysis-runs
```

The route creates a pending run, gets the GitHub access token, and calls `run_repository_analysis()`.

The analysis service then:

1. Marks the run as `running`.
2. Resolves the configured default branch.
3. Fetches the repository tree from GitHub.
4. Selects relevant source files.
5. Excludes common generated/dependency folders such as `.git`, `node_modules`, `.next`, `dist`, `build`, and virtual environments.
6. Excludes obvious secret or binary-key files such as `.env`, `.pem`, `.key`, `.p12`, and `.pfx`.
7. Limits the review to at most 40 files, 12,000 bytes per file, and 120,000 total bytes.
8. Builds a prompt containing file paths and source contents.
9. Calls the selected AI provider.
10. Parses the response as structured JSON using Pydantic validation.
11. Stores each returned issue in the database.
12. Marks the run `completed` with a summary.

If any step fails, the transaction is rolled back, the run is marked `failed`, and the error is stored on the run.

The current implementation performs this work during the request. It is therefore not yet a background job or queue-based workflow.

## 7. AI Providers

The AI service supports:

- OpenRouter, selected with `AI_PROVIDER=openrouter`.
- Google Gemini, selected with `AI_PROVIDER=gemini`.

The provider must return JSON containing a summary and issue objects. Each issue is validated for required fields and accepted severity values. Invalid JSON or an invalid provider response causes the analysis run to fail.

`POST /v1/ai/analyze-repo` is a standalone dry-run style endpoint. The primary production workflow is the repository analysis-run endpoint because it fetches real source files and persists issues.

## 8. Fix Review and Approval

The frontend project page shows each issue and allows the user to:

- filter issues by severity or status
- view the explanation and proposed corrected code
- edit and save the proposed code
- approve the fix
- reject the fix

The corresponding backend endpoints are:

```text
POST /v1/issues/{issue_id}/update-fix
POST /v1/issues/{issue_id}/approve
POST /v1/issues/{issue_id}/reject
```

The approval gate is deliberately local. Approval currently sets `status = approved` and records `approved_at`. It does not commit code, create a branch, or open a pull request on GitHub.

## 9. Important API Endpoints

### Health and status

```text
GET  /health
GET  /v1/status
GET  /v1/database/health
```

### Projects

```text
POST   /v1/projects
GET    /v1/projects
GET    /v1/projects/{project_id}
PATCH  /v1/projects/{project_id}
DELETE /v1/projects/{project_id}
```

### Repositories

```text
POST   /v1/projects/{project_id}/repositories
GET    /v1/projects/{project_id}/repositories
GET    /v1/repositories/{repository_id}
PATCH  /v1/repositories/{repository_id}
DELETE /v1/repositories/{repository_id}
POST   /v1/repositories/{repository_id}/refresh
```

### Analysis and issues

```text
POST   /v1/repositories/{repository_id}/analysis-runs
POST   /v1/projects/{project_id}/analysis-runs
GET    /v1/projects/{project_id}/analysis-runs
GET    /v1/analysis-runs/{analysis_run_id}
POST   /v1/projects/{project_id}/issues
GET    /v1/projects/{project_id}/issues
GET    /v1/issues/{issue_id}
PATCH  /v1/issues/{issue_id}
DELETE /v1/issues/{issue_id}
```

### GitHub

```text
GET  /v1/github/authorize
GET  /v1/github/callback
GET  /v1/github/me
GET  /v1/github/repositories
POST /v1/github/repositories/connect
```

Interactive API documentation is available at `http://localhost:8000/docs` while the backend is running.

## 10. Configuration

Settings are loaded through Pydantic Settings in `backend/app/core/config.py`. The backend supports environment files at the repository root and inside `backend`.

Important variables include:

```env
APP_NAME=DevOpsManager
ENVIRONMENT=development
DEBUG=true
ALLOWED_ORIGINS=["http://localhost:3000"]
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/devopsmanager
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=your-model
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-1.5-flash
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_PRIVATE_KEY_PATH=secrets/github-app-private-key.pem
GITHUB_REDIRECT_URI=http://localhost:8000/v1/github/callback
```

The database URL is normalized to the asynchronous `asyncpg` driver when a normal PostgreSQL URL is supplied.

The root `.env.example` is a shared starter file and currently contains older variable names in places. For the most accurate backend configuration, follow the backend settings and the setup instructions in `README.md`, then update the example file when configuration conventions change.

## 11. Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Backend URL: `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:3000`

### Docker

`docker-compose.yml` starts three services:

- `db`: PostgreSQL 16 with a persistent Docker volume.
- `backend`: FastAPI service on port 8000.
- `frontend`: Next.js service on port 3000.

The Docker backend uses the database hostname `db`, while a locally run backend normally uses `localhost` or a Supabase connection string.

### Tests and build

```bash
cd backend
python -m pytest tests -q

cd ../frontend
npm run build
```

The backend tests cover health checks, core CRUD behavior, relationship deletion behavior, GitHub integration, OAuth behavior, repository analysis, AI integrations, and fix approval flows.

## 12. Security Boundaries

The project already includes several important safety boundaries:

- API keys and GitHub credentials come from environment configuration.
- GitHub private keys belong in the local `backend/secrets/` directory and should never be committed.
- OAuth state is generated and verified on the server.
- GitHub access tokens are stored in HTTP-only cookies and are not exposed to frontend JavaScript.
- Repository analysis excludes several common secret and binary-key file types.
- AI output is parsed and validated before issue records are stored.
- Fix approval is separate from GitHub modification.
- CORS is configured explicitly through allowed origins.

Before production use, cookie `secure` settings, HTTPS, token storage, authorization between users and projects, rate limits, audit logs, and secret scanning should be strengthened.

## 13. Project Directory Guide

```text
DevOpsManager/
├── backend/
│   ├── app/main.py                 FastAPI application entry point
│   ├── app/api/v1/                 Versioned API route modules
│   ├── app/core/config.py          Environment-backed application settings
│   ├── app/db/                     Async SQLAlchemy engine and sessions
│   ├── app/integrations/            GitHub API and OAuth services
│   ├── app/models/                 Database entities and relationships
│   ├── app/schemas/                Pydantic request/response contracts
│   ├── app/services/               AI and repository analysis workflows
│   ├── alembic/                    Database migrations
│   └── tests/                      Backend automated tests
├── frontend/
│   └── src/
│       ├── app/                    Next.js routes and pages
│       ├── components/             Reusable UI components
│       └── lib/                    API client, types, and constants
├── docker/                         Backend and frontend Dockerfiles
├── docker-compose.yml              Local multi-service environment
├── README.md                       Quick start and phase summary
└── agent.md                        Handoff notes and architectural intent
```

## 14. What Is Complete

The project currently has these completed foundations:

1. FastAPI and Next.js application structure.
2. Async SQLAlchemy database access and Alembic migrations.
3. Project, repository, analysis-run, and issue data model.
4. CRUD APIs for the core entities.
5. GitHub OAuth authorization and server-side token handling.
6. Accessible repository listing and automatic project creation on selection.
7. GitHub metadata synchronization and refresh.
8. Repository source-tree fetching with file and size limits.
9. OpenRouter and Gemini analysis providers.
10. Structured issue persistence with severity and source location.
11. Suggested fixes and corrected code snippets.
12. Local fix editing, approval, and rejection UI.
13. Backend tests for the main workflows.

## 15. Future Updates

### Priority 1: Finish GitHub write-back

Implement the planned Phase 8 workflow:

1. Confirm that an issue has an approved corrected code snippet.
2. Create a dedicated branch such as `devopsmanager/fix-issue-<id>`.
3. Apply the approved change to the correct file.
4. Commit the change through the GitHub API.
5. Open a pull request against the configured default branch.
6. Store branch, commit, and pull-request URLs on the issue or in a separate fix-attempt table.
7. Report GitHub failures without losing the approval record.

Approval should remain separate from automatic merge. The safest default is to open a pull request and let a human review it.

### Priority 2: Move analysis to background jobs

The current analysis call can take a long time because it fetches multiple files and waits for an external AI provider. Move it to a worker and queue system so the API can return a run ID immediately. The frontend can poll the run or receive progress updates.

Suggested state flow:

```text
queued -> running -> completed
                  -> failed
                  -> cancelled
```

### Priority 3: Improve source analysis quality

Add repository-aware controls for:

- file selection and language support
- larger repositories and pagination
- ignored paths configured per project
- duplicate issue detection
- confidence scores
- incremental analysis based on changed files
- deterministic issue fingerprints
- non-AI static analysis tools such as linters and security scanners

AI findings should complement deterministic scanners rather than replace them.

### Priority 4: Strengthen multi-user security

Add authenticated DevOpsManager users and ownership checks. Projects, repositories, issues, analysis runs, and approved fixes should be authorized per user or organization. Replace development cookie settings with secure HTTPS cookies in production, add CSRF protection where appropriate, and avoid putting sensitive error details into public responses.

### Priority 5: Make fixes safer

Before write-back, validate that:

- the source commit has not changed unexpectedly
- the target file still exists
- the proposed patch applies cleanly
- the corrected code passes formatting, linting, and tests where available
- the change does not touch files outside the approved scope

A patch-based representation is safer than replacing an entire file with an AI-generated snippet.

### Priority 6: Improve observability and operations

Add structured logging, correlation IDs, provider latency and token metrics, GitHub rate-limit visibility, retry policies, audit events, and dashboards for failed analysis runs and write-back attempts.

### Priority 7: Align contracts and documentation

Keep the root `.env.example`, README, backend settings, frontend API types, and actual route payloads synchronized. In particular, verify the GitHub repository connect request shape used by `frontend/src/lib/api.ts` against `backend/app/api/v1/github_routes.py` before extending the connection workflow.

## 16. Recommended Development Order

A practical next sequence is:

1. Align environment examples and frontend/backend GitHub connection contracts.
2. Add tests for the complete OAuth-to-project-selection flow.
3. Add a background analysis worker and polling UI.
4. Add a durable fix-attempt model and GitHub branch/commit/PR service.
5. Add patch validation, test execution, and audit logging.
6. Add user and organization authorization before deploying for multiple users.

This order preserves the current architecture while making the most important workflow reliable and production-ready.
