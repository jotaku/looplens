# LoopLens — Technical Implementation Document

## 1. System Overview

LoopLens is a local-first analytics platform that captures, stores, and visualizes data from Claude Code sessions. It consists of three layers:

1. **Ingestion** — HTTP endpoints that receive hook events and statusline updates from Claude Code
2. **Storage** — SQLite database with indexed tables for sessions and events
3. **Presentation** — React SPA that polls the REST API and renders dashboards

```
┌─────────────────────────┐
│   Claude Code           │
│                         │
│  hooks (HTTP POST) ─────┼──────┐
│  statusline (script) ───┼──────┤
└─────────────────────────┘      │
                                 ▼
                    ┌─────────────────────────┐
                    │  Express Server :4244   │
                    │                         │
                    │  /api/ingest/hook       │──┐
                    │  /api/ingest/statusline │  │
                    │                         │  │
                    │  /api/sessions          │  │    ┌──────────────────┐
                    │  /api/stats             │◄─┼───▶│  SQLite (WAL)    │
                    │  /api/commits           │  │    │  analytics.db    │
                    │  /api/health            │  │    └──────────────────┘
                    │  /api/reset             │──┘
                    └──────────┬──────────────┘
                               │ serves static
                    ┌──────────▼─────────────┐
                    │  React SPA             │
                    │  TanStack Query        │
                    │  Tailwind CSS 4        │
                    │  wouter routing        │
                    └────────────────────────┘
```

---

## 2. Data Ingestion

### 2.1 Hook Events

Claude Code fires HTTP POST requests to configured hook URLs at specific lifecycle points. The server receives these at `POST /api/ingest/hook`.

**Supported hook events:**

| Event | When Fired | Key Data |
|-------|-----------|----------|
| `SessionStart` | New session begins | `session_id`, `model`, `cwd` |
| `PostToolUse` | After every tool invocation | `tool_name`, `tool_input`, `tool_response` |
| `Stop` | Agent completes normally | `last_assistant_message`, `reason` |
| `StopFailure` | Agent fails or errors | `error`, `error_details`, `last_assistant_message` |
| `SessionEnd` | Session terminates | `reason` |

**Processing logic (`server/routes/ingest.ts`):**

1. Validate `session_id` and `hook_event_name` are present
2. Ensure the session row exists (upsert) — required before inserting events (FK constraint)
3. Persist `agent_id`, `agent_type`, and `transcript_path` from any event that carries them
4. Create a `HookEvent` record with timestamp and all available fields
5. Append to the `events` table
6. Update the `sessions` table based on event type:
   - `SessionStart` → create/update session with model, cwd, start time
   - `PostToolUse` → increment tool count, track files changed (for Write/Edit tools)
   - `Stop` → store last assistant message and stop reason
   - `StopFailure` → store error info
   - `SessionEnd` → set ended_at timestamp

### 2.2 Statusline Updates

Claude Code supports a `statusLine` script that outputs JSON periodically. A companion shell script POSTs this data to `POST /api/ingest/statusline`.

**Data extracted from statusline:**

| Field | Source Path in Payload |
|-------|----------------------|
| `total_cost_usd` | `cost.total_cost_usd` |
| `total_duration_ms` | `cost.total_duration_ms` |
| `total_api_duration_ms` | `cost.total_api_duration_ms` |
| `total_input_tokens` | `context_window.total_input_tokens` |
| `total_output_tokens` | `context_window.total_output_tokens` |
| `cache_read_tokens` | `context_window.current_usage.cache_read_input_tokens` |
| `cache_creation_tokens` | `context_window.current_usage.cache_creation_input_tokens` |
| `total_lines_added` | `cost.total_lines_added` |
| `total_lines_removed` | `cost.total_lines_removed` |
| `context_window_size` | `context_window.context_window_size` |
| `used_percentage` | `context_window.used_percentage` |
| `model_id` | `model.id` |
| `model_name` | `model.display_name` |

This provides **real-time cost and token tracking** during an active session, unlike hook events which only fire at discrete points.

---

## 3. Storage Layer

### 3.1 SQLite Database

**Location:** `~/.looplens/analytics.db`

SQLite was chosen over the previous JSON file approach for:
- **Concurrent safety** — WAL mode handles parallel writes from multiple Claude Code sessions
- **Indexed queries** — O(log n) lookups instead of full-file scans
- **SQL aggregation** — Stats computed by the database engine, not in JS
- **Scalability** — Handles millions of rows without memory pressure
- **Simplicity** — Still a single file, no external services

**Implementation:** `better-sqlite3` (synchronous API, drop-in replacement for existing store functions)

### 3.2 Schema

```sql
-- Core session data
CREATE TABLE sessions (
    session_id          TEXT PRIMARY KEY,
    model_id            TEXT DEFAULT '',
    model_name          TEXT DEFAULT '',
    cwd                 TEXT DEFAULT '',
    started_at          TEXT NOT NULL,
    ended_at            TEXT,
    end_reason          TEXT,
    total_cost_usd      REAL DEFAULT 0,
    total_duration_ms   INTEGER DEFAULT 0,
    total_api_duration_ms INTEGER DEFAULT 0,
    total_input_tokens  INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    cache_read_tokens   INTEGER DEFAULT 0,
    cache_creation_tokens INTEGER DEFAULT 0,
    total_lines_added   INTEGER DEFAULT 0,
    total_lines_removed INTEGER DEFAULT 0,
    context_window_size INTEGER DEFAULT 0,
    used_percentage     REAL DEFAULT 0,
    tools_used          TEXT DEFAULT '{}',    -- JSON object: { "Read": 5, "Edit": 3 }
    files_changed       TEXT DEFAULT '[]',    -- JSON array: ["/path/to/file.ts"]
    last_assistant_message TEXT,
    version             TEXT,
    stop_reason         TEXT,
    agent_id            TEXT,
    agent_type          TEXT,
    transcript_path     TEXT
);

CREATE INDEX idx_sessions_started_at ON sessions(started_at);
CREATE INDEX idx_sessions_agent_id ON sessions(agent_id);
CREATE INDEX idx_sessions_cwd ON sessions(cwd);

-- Hook event timeline
CREATE TABLE events (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id          TEXT NOT NULL,
    timestamp           TEXT NOT NULL,
    event               TEXT NOT NULL,
    tool_name           TEXT,
    tool_input          TEXT,       -- JSON
    tool_response       TEXT,       -- JSON
    model               TEXT,
    source              TEXT,
    reason              TEXT,
    error               TEXT,
    error_details       TEXT,
    last_assistant_message TEXT,
    agent_id            TEXT,
    agent_type          TEXT,
    transcript_path     TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX idx_events_session_id ON events(session_id);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_event ON events(event);
```

### 3.3 Store API

The store module (`server/store.ts`) exposes the same function signatures as before, backed by SQLite:

| Function | SQL Operation |
|----------|--------------|
| `getSessions()` | `SELECT * FROM sessions ORDER BY started_at DESC` |
| `getSession(id)` | `SELECT * FROM sessions WHERE session_id = ?` |
| `upsertSession(id, update)` | `INSERT ... ON CONFLICT(session_id) DO UPDATE SET ...` |
| `getEvents()` | `SELECT * FROM events ORDER BY timestamp ASC` |
| `getEventsForSession(id)` | `SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC` |
| `appendEvent(event)` | `INSERT INTO events (...) VALUES (...)` |
| `getStats()` | `SELECT SUM/COUNT/AVG ... FROM sessions` + `GROUP BY` for breakdowns |
| `clearAll()` | `DELETE FROM sessions; DELETE FROM events;` |

### 3.4 Migration from JSON

For users upgrading from the JSON-based storage:

1. On first startup, check if `sessions.json` and `events.json` exist
2. If they do, read them and bulk-insert into SQLite tables
3. Rename the JSON files to `sessions.json.bak` and `events.json.bak`
4. Log a message confirming migration

---

## 4. REST API

### 4.1 Ingest Endpoints

#### `POST /api/ingest/hook`

Receives Claude Code hook events.

**Request body** (from Claude Code):
```json
{
  "session_id": "abc-123",
  "hook_event_name": "PostToolUse",
  "tool_name": "Read",
  "tool_input": { "file_path": "/src/app.ts" },
  "tool_response": { "filePath": "/src/app.ts" },
  "model": "claude-sonnet-4-20250514",
  "agent_id": "agent-xyz",
  "agent_type": "main",
  "transcript_path": "/home/user/.claude/projects/..."
}
```

**Response:** `{ "ok": true }`

#### `POST /api/ingest/statusline`

Receives statusline JSON snapshots.

**Request body:** Full statusline JSON from Claude Code (contains `cost`, `context_window`, `model`, `workspace` objects).

**Response:** `{ "ok": true }`

### 4.2 Read Endpoints

#### `GET /api/stats`

Returns aggregate KPIs across all sessions.

**Response:**
```json
{
  "totalSessions": 42,
  "totalCostUsd": 15.73,
  "totalInputTokens": 2450000,
  "totalOutputTokens": 890000,
  "totalDurationMs": 3600000,
  "totalLinesAdded": 1200,
  "totalLinesRemoved": 340,
  "avgCostPerSession": 0.37,
  "avgDurationPerSession": 85714,
  "modelBreakdown": {
    "claude-sonnet-4-20250514": {
      "sessions": 30,
      "costUsd": 8.50,
      "inputTokens": 1800000,
      "outputTokens": 650000
    }
  },
  "toolBreakdown": { "Read": 450, "Edit": 120, "Bash": 80 },
  "agentBreakdown": { ... },
  "recentSessions": [ ... ]
}
```

#### `GET /api/stats/quality`

Returns aggregate quality signals.

**Response:**
```json
{
  "sessions": 42,
  "signals": {
    "completionRate": 0.85,
    "failureRate": 0.07,
    "toolErrorRate": 0.02,
    "avgCostPerLine": 0.013,
    "avgTokensPerLine": 742,
    "totalLinesChanged": 1540,
    "totalToolCalls": 650,
    "totalToolErrors": 13,
    "sessionsWithOutput": 38,
    "avgTurnsPerSession": 15.5
  },
  "perSession": [ ... ]
}
```

#### `GET /api/sessions?page=1&limit=50`

Paginated session list, sorted by `started_at` descending.

**Response:**
```json
{
  "sessions": [ ... ],
  "total": 42,
  "page": 1,
  "limit": 50,
  "totalPages": 1
}
```

#### `GET /api/sessions/:id`

Single session with full event timeline and computed quality signals.

**Response:**
```json
{
  "session": { ... },
  "events": [ ... ],
  "quality": {
    "completionStatus": "success",
    "stopFailures": 0,
    "totalStops": 1,
    "retryRate": 0,
    "toolCalls": 23,
    "toolErrors": 0,
    "toolErrorRate": 0,
    "linesChanged": 45,
    "costPerLine": 0.0089,
    "tokensPerLine": 520,
    "turnCount": 3,
    "hasCommit": true
  }
}
```

#### `GET /api/sessions/:id/transcript`

Reads the Claude Code JSONL transcript file and returns parsed conversation messages.

**Transcript discovery logic:**
1. Check `session.transcript_path` (stored from hook data)
2. If not found, compute expected path: `~/.claude/projects/<cwd-encoded>/<session_id>.jsonl`
3. Fallback: scan all directories in `~/.claude/projects/` for matching session file

**Response:**
```json
{
  "messages": [
    { "role": "user", "content": "Fix the login bug", "timestamp": "2025-03-20T01:00:00Z" },
    { "role": "assistant", "content": "I'll look at the auth module...", "timestamp": "2025-03-20T01:00:05Z" }
  ],
  "source": "/home/user/.claude/projects/-Users-pi-myapp/abc-123.jsonl"
}
```

#### `GET /api/commits?page=1&limit=50&showAll=false`

Git commits correlated with Claude Code sessions.

**Commit correlation algorithm:**
1. Collect unique git roots from all session `cwd` paths
2. Parse `git log` from each repo (up to 200 commits)
3. For each commit, check if it falls within a session's time window (start → end + 60s buffer) for the same repo
4. Detect agent commits via: git trailers (`Agent-Id`, `Agent-Model`), author name patterns (`/claude|cursor|copilot|.../i`), or session correlation
5. Enrich agent commits with session cost, tokens, model, and duration

**Response:**
```json
{
  "commits": [ ... ],
  "total": 15,
  "page": 1,
  "limit": 50,
  "totalPages": 1,
  "agentCommitCount": 12,
  "totalCommitCount": 45,
  "agentBreakdown": { ... },
  "repos": [
    { "path": "/Users/pi/myapp", "name": "myapp" }
  ]
}
```

### 4.3 Management Endpoints

#### `POST /api/reset`

Clears all data (deletes all rows from sessions and events tables).

#### `GET /api/health`

Returns `{ "status": "ok", "version": "0.1.0" }`.

---

## 5. Frontend Architecture

### 5.1 Stack

| Library | Version | Purpose |
|---------|---------|---------|
| React | 19 | UI framework |
| Vite | 6 | Build tool and dev server (port 3001) |
| Tailwind CSS | 4 | Utility-first styling |
| TanStack Query | 5 | Data fetching with automatic polling |
| wouter | 3 | Lightweight client-side routing |

### 5.2 Routing

All routes defined in `src/App.tsx`:

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `OverviewPage` | KPI dashboard with sparklines, top agents/models/tools |
| `/sessions` | `SessionsPage` | Paginated session list |
| `/sessions/:id` | `SessionDetail` | Full session deep-dive |
| `/agents` | `AgentsPage` | Agent breakdown |
| `/tools` | `ToolsPage` | Tool usage frequency |
| `/models` | `ModelsPage` | Model usage and cost stats |
| `/quality` | `QualityPage` | Completion rate, error rate, efficiency |
| `/commits` | `CommitsPage` | Git commits correlated with sessions |

### 5.3 Data Fetching

TanStack Query hooks in `src/api/` handle all API communication:
- **Polling interval:** 5–10 seconds (configurable per query)
- **Stale time:** Matched to polling interval to avoid redundant requests
- **Error handling:** Queries retry 3 times with exponential backoff

### 5.4 Theme System

- Light and dark themes stored in `localStorage`
- CSS variables for all colors, toggled by a class on `<html>`
- Default follows system preference via `prefers-color-scheme`

---

## 6. Quality Signals

Quality signals are computed per-session and aggregated across all sessions.

### 6.1 Per-Session Quality

Computed in `server/routes/sessions.ts → computeQuality()`:

| Signal | Computation |
|--------|------------|
| `completionStatus` | `success` if session ended with Stop events; `failure` if only StopFailure events; `unknown` if still running |
| `retryRate` | `stopFailures / (stops + stopFailures)` |
| `toolErrorRate` | `stopFailures / totalToolCalls` |
| `costPerLine` | `total_cost_usd / (lines_added + lines_removed)` — null if no lines changed |
| `tokensPerLine` | `total_output_tokens / (lines_added + lines_removed)` — null if no lines changed |
| `turnCount` | Count of user messages in the JSONL transcript (excludes system/command messages) |

### 6.2 Aggregate Quality

Computed in `server/routes/stats.ts → GET /api/stats/quality`:

| Signal | Computation |
|--------|------------|
| `completionRate` | `completedSessions / totalSessions` |
| `failureRate` | `failedSessions / totalSessions` |
| `toolErrorRate` | `totalToolErrors / totalToolCalls` |
| `avgCostPerLine` | `totalCost / totalLinesChanged` |
| `avgTokensPerLine` | `totalOutputTokens / totalLinesChanged` |
| `avgTurnsPerSession` | `totalTurns / totalSessions` |

---

## 7. Commit Correlation

### 7.1 Multi-Repo Discovery

1. Iterate all sessions and extract unique `cwd` paths
2. For each `cwd`, resolve the git root via `git rev-parse --show-toplevel`
3. Cache results to avoid redundant `git` calls
4. Parse `git log` from each unique root

### 7.2 Agent Commit Detection

A commit is classified as a Claude Code commit if **any** of:
- Has a `Co-Authored-By` line from Anthropic (e.g. `Co-Authored-By: Claude ... <noreply@anthropic.com>`)
- Falls within a tracked Claude Code session's time window for the same repo

### 7.3 Session Enrichment

When a commit matches a session, it inherits:
- `sessionCostUsd` — Total cost of the session
- `sessionInputTokens` / `sessionOutputTokens`
- `sessionModel` — Model used
- `sessionAgentId` — Agent identifier
- `sessionDurationMs` — Total duration

---

## 8. Deployment

### 8.1 Development

```bash
# Terminal 1: Backend with auto-reload
npm run dev:server    # tsx watch server/index.ts → localhost:4244

# Terminal 2: Frontend with HMR
npm run dev           # vite --port 3001 → proxied to :4244 for API
```

### 8.2 Production

```bash
npm run build         # tsc --noEmit && vite build → dist/
npm run start         # tsx server/index.ts (serves API + static dist/)
```

The Express server serves the built SPA from `dist/` in production, so only one process is needed.

### 8.3 Claude Code Configuration

**Required hooks** in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "type": "http", "url": "http://localhost:4244/api/ingest/hook?event=SessionStart" }],
    "PostToolUse":  [{ "type": "http", "url": "http://localhost:4244/api/ingest/hook?event=PostToolUse" }],
    "Stop":         [{ "type": "http", "url": "http://localhost:4244/api/ingest/hook?event=Stop" }],
    "StopFailure":  [{ "type": "http", "url": "http://localhost:4244/api/ingest/hook?event=StopFailure" }],
    "SessionEnd":   [{ "type": "http", "url": "http://localhost:4244/api/ingest/hook?event=SessionEnd" }]
  }
}
```

**Optional statusline** for real-time cost/token updates:

```json
{
  "statusLine": {
    "command": "~/.claude/plugins/looplens/scripts/statusline.sh"
  }
}
```

---

## 9. Security Considerations

- **Local-only by default** — Server binds to `localhost`, not `0.0.0.0`
- **No authentication** — Acceptable for local use; if exposed to network, add auth middleware
- **No data leaves the machine** — All storage is local SQLite, transcripts read from local filesystem
- **CORS** — Configured for dev cross-origin (Vite at :3001 → API at :4244); production serves from same origin
- **Input validation** — Hook payloads validated for required fields; malformed data rejected with 400
- **JSON body limit** — 1MB max to prevent abuse

---

## 10. Performance Characteristics

- `getStats()` — Single SQL query with `GROUP BY`, O(n) but in the database engine with indexed access
- `getEventsForSession()` — Indexed lookup, O(log n + k) where k = events for that session
- `upsertSession()` — Single `INSERT ... ON CONFLICT DO UPDATE`, O(log n)
- `appendEvent()` — Single `INSERT`, O(log n)
- **No event cap** — No truncation; all events are retained
- **Concurrent safe** — WAL mode allows readers during writes

### Estimated Scale
- 1,000 sessions with 100 events each = ~100K rows → sub-millisecond queries
- 10,000 sessions with 500 events each = ~5M rows → still under 10ms for indexed queries
- Database file size: ~50MB for 5M event rows (conservative estimate)

---

## 11. Dependencies

### Runtime
| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^5.1.0 | HTTP server |
| `better-sqlite3` | ^11.7.0 | SQLite database driver |
| `lucide-react` | latest | Icon library |
| `react` | ^19.0.0 | UI framework |
| `react-dom` | ^19.0.0 | React DOM renderer |
| `@tanstack/react-query` | ^5.64.0 | Data fetching and caching |
| `wouter` | ^3.7.0 | Client-side routing |

### Development
| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.8.2 | Type checking |
| `vite` | ^6.0.0 | Build tool |
| `@vitejs/plugin-react` | ^4.4.0 | React Fast Refresh |
| `tailwindcss` | ^4.0.0 | CSS framework |
| `@tailwindcss/vite` | ^4.0.0 | Tailwind Vite plugin |
| `tsx` | ^4.19.0 | TypeScript execution for server |
| `@types/better-sqlite3` | ^7.6.12 | Type definitions |
| `vitest` | ^4.1.0 | Test framework |

---

## 12. Future Enhancements (enabled by SQLite)

The SQLite migration is complete (schema, store rewrite, JSON auto-migration, indexed queries, SQL aggregation). Remaining opportunities:

- **Time-range filtering** — `GET /api/stats?from=2025-03-01&to=2025-03-20`
- **`daily_stats` materialized view** — Pre-aggregated historical trend data
- **Full-text search** — Search session messages and events
- **Cursor-based pagination** — For very large datasets
- **Export endpoints** — `GET /api/export/csv`, `GET /api/export/json`
- **SQL-based quality computation** — Move more quality signal logic into SQL

---

## 13. File Map

```
looplens/
├── server/
│   ├── index.ts                 # Express app setup, CORS, route mounting, static serving
│   ├── db.ts                    # SQLite initialization, schema, WAL mode, JSON migration
│   ├── store.ts                 # Data access layer (SQLite prepared statements)
│   ├── __tests__/
│   │   ├── helpers.ts           # Test setup/teardown (temp DB per test)
│   │   ├── db.test.ts           # Schema, indexes, WAL mode tests
│   │   ├── store.test.ts        # CRUD sessions/events, stats, clearAll tests
│   │   └── routes.test.ts       # API integration tests (ingest, sessions, stats)
│   └── routes/
│       ├── ingest.ts            # POST /api/ingest/hook, POST /api/ingest/statusline
│       ├── sessions.ts          # GET /api/sessions, GET /api/sessions/:id, transcript
│       ├── stats.ts             # GET /api/stats, GET /api/stats/quality
│       └── commits.ts           # GET /api/commits (multi-repo git log + correlation)
├── src/
│   ├── main.tsx                 # React entry point, QueryClientProvider
│   ├── App.tsx                  # wouter Router with all page routes
│   ├── globals.css              # Tailwind base + theme CSS variables
│   ├── api/                     # TanStack Query hooks (useStats, useSessions, etc.)
│   ├── components/              # Layout, Sidebar, ThemeToggle
│   ├── views/                   # Page components (Overview, Sessions, Agents, etc.)
│   └── lib/                     # Formatters, utilities
├── plugin/                      # Claude Code hook config + statusline script
├── cli/                         # CLI utilities
├── package.json
├── tsconfig.json                # Frontend TypeScript config
├── tsconfig.server.json         # Backend TypeScript config
├── vite.config.ts               # Vite config with Tailwind + React plugins
├── index.html                   # SPA entry HTML
├── README.md                    # User-facing documentation
├── CONTRIBUTING.md              # Developer guide
├── PITCH.md                     # Project pitch document
├── TECHNICAL.md                 # This document
└── LICENSE                      # MIT
```
