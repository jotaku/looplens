# Contributing to LoopLens

Thank you for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/jotaku/looplens.git
cd looplens
npm install
```

## Project Structure

```
server/
  index.ts              Express server entry point (port 4244)
  db.ts                 SQLite initialization, schema, migrations, WAL mode
  store.ts              Data storage layer (SQLite via better-sqlite3)
  transcript.ts         Transcript parsing, task label extraction, session enrichment
  __tests__/
    helpers.ts          Test setup/teardown (temp DB per test)
    db.test.ts          Schema, indexes, WAL mode tests
    store.test.ts       CRUD sessions/events, stats, clearAll tests
    routes.test.ts      API integration tests (ingest, sessions, stats)
  routes/
    ingest.ts           POST endpoints for Claude Code hooks & statusline
    sessions.ts         GET endpoints for session list, detail, transcript
    stats.ts            GET endpoints for aggregate analytics & quality
    commits.ts          GET endpoint for Claude Code git commits
src/
  main.tsx              React entry point
  App.tsx               Router (wouter) with all page routes
  api/                  TanStack Query hooks for API calls
  components/           Shared layout, nav, theme components
  views/
    OverviewPage.tsx    KPI dashboard with sparklines
    SessionsPage.tsx    Paginated session list
    SessionDetail.tsx   Single session deep-dive (events, transcript, quality)
    AgentsPage.tsx      Agent breakdown by cost, tokens, sessions
    ToolsPage.tsx       Tool usage frequency
    ModelsPage.tsx      Model usage with cost/token stats
    QualityPage.tsx     Completion rate, error rate, efficiency metrics
    CommitsPage.tsx     Git commits correlated with sessions
  lib/                  Utility functions and formatters
  globals.css           Tailwind CSS base styles
plugin/                 Claude Code hook configuration and statusline script
cli/                    CLI utilities
```

## Commands

```bash
npm run prod           # Build frontend + start server (production, port 4244)
npm run dev            # Start frontend dev server (Vite, port 3001)
npm run dev:server     # Start backend with auto-reload (tsx watch)
npm run start          # Start backend only (port 4244)
npm run build          # Type-check + production build
npm test               # Run tests once
npm run test:watch     # Run tests in watch mode
```

## Code Style

- TypeScript strict mode
- ES modules (`"type": "module"`)
- No default exports (except where framework requires it)
- Minimal dependencies — keep the stack lean
- Use `better-sqlite3` synchronous API in the store layer

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `npm test` passes
4. Ensure `npm run build` passes without errors
5. Test with a live Claude Code session if possible
6. Open a PR against `main`

## Architecture Notes

- **Backend** is a single Express 5 server that ingests Claude Code hook events via HTTP POST, stores them in SQLite, and serves aggregated data via REST API
- **Frontend** is a React 19 SPA using TanStack Query for data fetching with 5–10s polling intervals
- **Storage** uses SQLite (WAL mode) in `~/.looplens/analytics.db` — no external services required
- **Transcript reading** pulls directly from Claude Code's JSONL files in `~/.claude/projects/`
- **Commit correlation** matches git commits to sessions by timestamp + repo path
- **Task labels** are extracted from the first user prompt in each session's transcript for human-readable identification
