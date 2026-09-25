# DevOpsManager 🚀

DevOpsManager is a production-grade, AI-powered software development and repository intelligence platform. It acts as an autonomous, ultra-smart senior engineer that lives directly inside your GitHub repositories. 

Instead of just scanning for static vulnerabilities, DevOpsManager understands your codebase holistically, enforces your custom team guidelines, reviews Pull Requests in real-time, and can even generate complex, cross-file architectural fixes.

---

## ✨ Key Features

### 1. Chat-with-Repo (RAG) 💬
DevOpsManager turns your entire codebase into a conversational knowledge base.
- **How it works:** The platform chunks and indexes your repository files into a local FAISS vector database using Google's embeddings.
- **How to use it:** Go to the "Chat" tab in your project dashboard, hit "Index Repository", and ask complex questions like *"Where is authentication handled?"* or *"How does the payment gateway integration work?"* The AI retrieves the exact context needed to answer accurately.

### 2. Automated PR Reviews (GitHub App Integration) 🤖
Stop waiting for human reviewers. Get instant, inline feedback on every Pull Request.
- **How it works:** DevOpsManager installs as a GitHub App. When a developer opens or updates a Pull Request, the app fetches the Git diff, analyzes the changes against your team's rules, and posts actionable review comments inline on the specific lines of code.

### 3. Cross-File Atomic Fixes 🛠️
Most AI tools can only fix one file at a time. DevOpsManager understands architectural dependencies.
- **How it works:** If a bug spans multiple files (e.g., renaming an exported function in a utility file and updating all its callers across components), the AI proposes a unified "Cross-File Atomic Fix."
- **How to use it:** When reviewing AI-detected issues in the dashboard, multi-file fixes are presented as a stacked list of diff viewers, allowing you to review and approve the entire architectural change at a glance.

### 4. Custom AI Rules & Smart Fingerprinting 🎯
Tailor the AI to your team's exact coding standards.
- **Custom Rules:** Enforce specific guidelines by adding plain-text rules to your project (e.g., *"Always use React Server Components"*). The AI injects these rules into its prompt during reviews and scans.
- **Issue Deduplication:** DevOpsManager uses SHA-256 fingerprinting to track issues across scans. If an issue has already been flagged, it won't spam your dashboard again.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python**: 3.11+
- **Node.js**: 18.x or 20.x
- **Database**: PostgreSQL (or Supabase PostgreSQL)

### Step 1: Clone & Configure Environment
```bash
git clone https://github.com/PranavAD36/DevOpsManager.git
cd DevOpsManager
```
Create `backend/.env` from `backend/.env.example` and populate your API keys (OpenRouter, Gemini, Supabase, GitHub App credentials).

> 💡 **Supabase Connection Note**: If connecting to a Supabase instance from Windows, use the Supabase Session Pooler hostname (`aws-0-<region>.pooler.supabase.com:5432`).

### Step 2: Set Up and Run the Backend API
```bash
cd backend
pip install -r requirements.txt

# Run database migrations to set up your schema
alembic upgrade head

# Start FastAPI dev server
npm start # or `uvicorn app.main:app --reload`
```
- **Backend API**: `http://localhost:8000`
- **Interactive API Docs (Swagger UI)**: `http://localhost:8000/docs`

### Step 3: Set Up and Run the Frontend App
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
- **Frontend Application**: `http://localhost:3000`

### Step 4: Using the Platform
1. Navigate to `http://localhost:3000`.
2. Connect your GitHub account via OAuth.
3. Import a repository into a new Project.
4. Add your **Custom AI Rules** in the project settings.
5. Trigger a full repository scan to detect vulnerabilities and receive **Cross-File Atomic Fixes**.
6. Switch to the **Chat** tab to query your codebase in natural language.
7. Open a Pull Request on GitHub to see the **Automated PR Review** bot in action!

---



## 📂 Architecture Overview

DevOpsManager uses a robust, modern tech stack:
- **Backend:** FastAPI (Python), SQLAlchemy Async ORM, Alembic, LangChain, FAISS (Vector DB).
- **Frontend:** Next.js 14 App Router, React, TailwindCSS.
- **AI Providers:** Google Gemini, OpenRouter.
- **Integrations:** GitHub REST API & Webhooks.
