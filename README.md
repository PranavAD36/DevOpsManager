# DevOpsManager

DevOpsManager is a production-grade, AI-powered software development and repository intelligence platform. It seamlessly connects GitHub repositories, fetches source trees, runs multi-provider LLM analysis (OpenRouter & Google Gemini), detects code vulnerabilities & quality issues, generates proposed code corrections, and provides an interactive UI for local code fix review and approval.

---

## 🚀 Quick Start Guide (Where to Begin)

If you are a new developer or contributor taking over or testing this project, follow these steps to get up and running:

### Prerequisites

- **Python**: 3.11+ (Python 3.13 tested)
- **Node.js**: 18.x or 20.x
- **Database**: PostgreSQL (or Supabase PostgreSQL)

---

### Step 1: Clone & Configure Environment

```bash
git clone https://github.com/PranavAD36/DevOpsManager.git
cd DevOpsManager
```

Create `backend/.env` from `backend/.env.example`:

```env
APP_NAME=DevOpsManager-App
ENVIRONMENT=development
DEBUG=true

# AI Provider Keys
OPENROUTER_API_KEY=your-openrouter-api-key
GEMINI_API_KEY=your-gemini-api-key
AI_PROVIDER=openrouter
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free

# Supabase PostgreSQL Connection String (Session Pooler recommended for Windows)
DATABASE_URL=postgresql+asyncpg://postgres.wrbgyhgpyysslbafarbz:YOUR_PASSWORD@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres

# GitHub App Integration
GITHUB_APP_ID=4530123
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_PRIVATE_KEY_PATH=secrets/github-app-private-key.pem
GITHUB_REDIRECT_URI=http://localhost:8000/v1/github/callback
```

> 💡 **Supabase Connection Note**: If connecting to a Supabase PostgreSQL instance from Windows, always use the **Supabase Session Pooler** hostname (`aws-0-<region>.pooler.supabase.com:5432`) with the `postgres.<project-ref>` user format to ensure IPv4 DNS resolution compatibility.

---

### Step 2: Set Up and Run the Backend API

```bash
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start FastAPI dev server
uvicorn app.main:app --reload
```

- **Backend API**: `http://localhost:8000`
- **Interactive API Docs (Swagger UI)**: `http://localhost:8000/docs`

---

### Step 3: Set Up and Run the Frontend App

Open a new terminal window:

```bash
cd frontend

# Install Node dependencies
npm install

# Start Next.js development server
npm run dev
```

- **Frontend Application**: `http://localhost:3000`
- **Connect GitHub Page**: `http://localhost:3000/github/connect`
- **Projects Overview**: `http://localhost:3000/projects`

---

### Step 4: Run Tests & Verification

```bash
# Run backend test suite (19 tests)
cd backend
python -m pytest tests -q

# Run frontend TypeScript & build verification
cd frontend
npm run build
```

---

## 🎯 Completed Feature Roadmap (Phases 1 - 7)

| Phase       | Feature Module                  | Status            | Highlights                                                                                                          |
| ----------- | ------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Phase 1** | Project Foundation              | ✅ Complete       | FastAPI backend, Next.js 14 frontend, SQLAlchemy async ORM, Alembic migrations.                                     |
| **Phase 2** | Core Data & API                 | ✅ Complete       | Full CRUD for Projects, Repositories, Analysis Runs, and Issues.                                                    |
| **Phase 3** | Analysis Workflow               | ✅ Complete       | Relationship cascade fixes, workflow state transitions, SQLite test suite.                                          |
| **Phase 4** | GitHub App Integration          | ✅ Complete       | GitHub OAuth flow, server-side token cookie handling, auto repository-to-project flow.                              |
| **Phase 5** | Real Repository Analysis Engine | ✅ Complete       | Recursively fetches source tree from GitHub REST API, triggers LLM code review, creates structured `Issue` records. |
| **Phase 6** | AI Fix & Code Generation        | ✅ Complete       | AI explains _why_ issues occur, provides human-readable `suggested_fix`, and generates `corrected_code` snippets.   |
| **Phase 7** | Safe Code Fixing & Approval UI  | ✅ Complete       | Interactive `DiffViewer` component, inline fix customization, `Approve Fix` and `Reject Fix` local approval engine. |
| **Phase 8** | GitHub Write-Back Workflow      | ⏳ _Next Horizon_ | Automatic Git branch creation, committing approved code fixes, and opening GitHub Pull Requests.                    |

---

## 📂 Codebase Structure

```
DevOpsManager/
├── backend/
│   ├── alembic/              # Database migration scripts
│   ├── app/
│   │   ├── api/v1/          # Versioned REST endpoints (core, github, ai, database)
│   │   ├── core/            # ConfigParser, Pydantic settings, environment rules
│   │   ├── db/              # Async database session & Base metadata
│   │   ├── integrations/    # GitHub App & OAuth integration service
│   │   ├── models/          # SQLAlchemy ORM models (Project, Repository, AnalysisRun, Issue)
│   │   ├── schemas/         # Pydantic validation schemas
│   │   └── services/        # AI analysis engine & repository source fetcher
│   ├── tests/               # Pytest suite (health, core API, GitHub OAuth, analysis engine)
│   └── requirements.txt     # Python requirements
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router (home, projects, repositories, github connect)
│   │   ├── components/      # Reusable UI components (DiffViewer.tsx)
│   │   └── lib/             # API client, TypeScript types, and constants
│   ├── package.json
│   └── tsconfig.json
├── agent.md                 # Full project roadmap and handoff guide
└── README.md                # Project documentation
```

---

## 🔒 Security & Safety Rules

1. **Local Approval Gate**: Phase 7 handles local approval only. No code is modified on GitHub without explicit user approval.
2. **Secrets Protection**: Private keys, GitHub secrets, and API keys are stored in environment variables and local secret folders (`secrets/`), never committed to git (`.gitignore`).
3. **OAuth Cookie Security**: OAuth state and access tokens use HTTP-only, host-matching cookies (`localhost:8000`).

---

## 🔮 Next Horizon: Phase 8 (GitHub Write-Back Workflow)

Once code fixes are approved in Phase 7:

1. **Feature Branch Creation**: Create `devopsmanager/fix-issue-#<id>` branch via GitHub REST API.
2. **Git Commit**: Commit approved `corrected_code` to the repository branch.
3. **Pull Request**: Automatically open a Pull Request targeting `main`/`master` branch on GitHub.
