# Encye Lexicon

A Wikipedia summarizer. Fetch random Wikipedia articles, summarize them with an
LLM agent in a configurable style and length, and curate the results in a
library. A FastAPI + SQLModel backend drives a Google ADK agent; a React +
Vite frontend provides the workspace, library, and settings UI.

## Project structure

```
.
├── backend/        FastAPI app, ADK summarizer agent, SQLModel storage
│   ├── main.py     API routes (summarize, articles, styles, settings)
│   ├── agent.py    Agent definition + web-page fetch tool
│   ├── models.py   SQLModel tables + SQLite engine
│   └── pyproject.toml
├── frontend/       React + Vite single-page app
└── docs/           UX design reference
```

## Prerequisites

- **Python 3.11+** and [uv](https://docs.astral.sh/uv/)
- **Node.js 20+** and [pnpm](https://pnpm.io/)

## Backend

```bash
cd backend
uv sync                              # create .venv and install dependencies
uv run uvicorn main:app --reload     # serve on http://localhost:8000
```

The server creates `database.db` (SQLite) in the `backend/` directory on first
run. Always launch from inside `backend/` so the database and `.env` resolve
correctly.

### Environment variables

Create `backend/.env` with the API key for whichever model provider the agent
is configured to use in [`agent.py`](backend/agent.py):

```
OPENAI_API_KEY=...        # OpenAI models
OPENROUTER_API_KEY=...    # OpenRouter models
GOOGLE_API_KEY=...        # Google / Gemini models
```

The active model is set in `agent.py`. It also supports a local OpenAI-compatible
server (e.g. LM Studio) via the `LM_STUDIO_URL` / `LM_STUDIO_MODEL` variables.

## Frontend

```bash
cd frontend
pnpm install
pnpm dev          # serve on http://localhost:5173
```

The dev server proxies `/api/*` to the backend at `http://localhost:8000`
(the `/api` prefix is stripped), so run the backend alongside it.

Other scripts:

```bash
pnpm build        # type-check and build for production
pnpm lint         # run oxlint
pnpm preview      # preview the production build
```

## Running the full app

Open two terminals:

```bash
# Terminal 1 — backend
cd backend && uv run uvicorn main:app --reload

# Terminal 2 — frontend
cd frontend && pnpm dev
```

Then visit http://localhost:5173.
