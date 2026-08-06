# DevOpsManager

DevOpsManager is a production-grade, AI-powered software development management platform foundation designed for future growth. The architecture is intentionally modular, scalable, and clean so new capabilities can be added without large-scale refactoring.

## Project Goals

- Provide a strong foundation for an AI-assisted software development lifecycle platform.
- Keep frontend and backend responsibilities clearly separated.
- Support future modules such as planning, automation, repository intelligence, and delivery insights.
- Avoid premature implementation of business logic, dashboards, or user-specific features.

## Architecture Overview

The repository is organized into two core application areas:

- Frontend: a Next.js application using the App Router, TypeScript, Tailwind CSS, and shadcn/ui-compatible structure.
- Backend: a FastAPI application structured for modular services, API routes, and integrations.

## Folder Structure

### Root

- .env.example: shared environment variables for local development.
- docker-compose.yml: local container orchestration for frontend and backend services.
- docker/: Dockerfiles for backend and frontend images.
- README.md: project overview and architecture documentation.

### Frontend

- frontend/: Next.js application root.
  - package.json: frontend dependencies and scripts.
  - tsconfig.json: TypeScript configuration.
  - next.config.mjs: Next.js configuration.
  - postcss.config.js: PostCSS configuration used by Tailwind.
  - tailwind.config.ts: Tailwind CSS setup.
  - src/app/: App Router pages and layout.
    - layout.tsx: root layout wrapper.
    - page.tsx: initial landing page.
    - globals.css: global styling entry point.
  - src/components/: reusable UI components for future feature modules.
  - src/lib/: shared frontend utilities, constants, and configuration helpers.
  - src/shared/: shared types and contracts intended for cross-module reuse.
  - src/styles/: centralized styling assets when additional UI patterns evolve.

### Backend

- backend/: FastAPI application root.
  - requirements.txt: Python dependencies for the API and AI integrations.
  - .env.example: backend-specific environment configuration template.
  - app/: application package.
    - main.py: FastAPI application entry point.
    - api/: API routing layer.
      - v1/: versioned API namespace.
        - routes.py: endpoint definitions for future versioned modules.
        - **init**.py: package marker.
    - core/: shared application configuration and infrastructure concerns.
      - config.py: environment-based settings handling.
    - services/: service layer for future domain logic and orchestration.
    - schemas/: request and response models for future endpoints.
    - integrations/: external service integration adapters such as GitHub, OpenAI, and Gemini.
    - agents/: LangGraph and LangChain orchestration modules for future AI workflows.
    - shared/: shared constants and cross-cutting utilities.
  - tests/: backend verification tests and future regression coverage.

## Configuration and Environment

- The project uses environment-based configuration via .env files.
- The root .env.example contains shared values.
- The backend/.env.example contains backend-specific values for local development.

## Container Support

Docker support is included to make local development and deployment easier:

- docker-compose.yml orchestrates backend and frontend containers.
- Dockerfiles are provided for both services.

## What Was Not Implemented

This foundation intentionally excludes:

- authentication
- dashboard UI
- AI chat workflows
- repository analysis
- database models
- business logic

The focus is solely on a clean and extensible foundation.

## Getting Started

1. Copy .env.example to .env and adjust values as needed.
2. Start the backend:
   - cd backend
   - pip install -r requirements.txt
   - uvicorn app.main:app --reload
3. Start the frontend:
   - cd frontend
   - npm install
   - npm run dev
4. Alternatively, use Docker Compose:
   - docker compose up --build
