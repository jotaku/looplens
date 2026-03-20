# LoopLens — Pitch

## The Problem

AI-assisted coding is exploding. Developers and teams using Claude Code have **zero visibility** into what their AI agents are actually doing:

- **How much am I spending?** — Claude Code sessions burn tokens silently. A single complex task can cost $5–50+ with no real-time feedback.
- **What's my ROI?** — Are AI-generated commits actually efficient? How many tokens per line of code? What's the cost per meaningful change?
- **Which tools are being used?** — Is the agent reading files excessively? Are tool calls failing silently?
- **Did it actually finish?** — Sessions can fail mid-task. There's no dashboard to see completion rates across sessions.
- **What happened across sessions?** — No aggregated view of model usage, agent behavior, or quality trends over time.

Today, developers close their Claude Code session and the data is gone — scattered across JSONL transcript files with no way to query, compare, or learn from past sessions.

---

## The Solution

**LoopLens** is a real-time observability dashboard that plugs directly into Claude Code via its native hook system. It captures every session, tool call, cost update, and outcome — then presents it in a clean, actionable dashboard.

### How It Works

1. **Zero-friction setup** — Add 5 HTTP hooks to `~/.claude/settings.json`. No code changes, no SDK, no wrapper scripts.
2. **Real-time ingestion** — Every hook event (SessionStart, PostToolUse, Stop, StopFailure, SessionEnd) and statusline update streams into a local Express server.
3. **Instant dashboard** — Open `localhost:4244` and see everything: cost, tokens, tools, models, quality signals, git commits — all correlated and queryable.

### What You Get

| Insight | Why It Matters |
|---------|---------------|
| **Cost tracking** | See per-session and cumulative spend in real-time |
| **Token analysis** | Input/output/cache breakdown per session and model |
| **Tool usage** | Which tools Claude uses most, and which ones fail |
| **Quality signals** | Completion rate, retry rate, cost-per-line, tokens-per-line |
| **Model comparison** | Side-by-side model usage and efficiency stats |
| **Commit correlation** | Map git commits to the AI session that produced them |
| **Session transcripts** | Full conversation replay for debugging and review |
| **Multi-repo support** | Auto-discovers repos from session working directories |

---

## Target Audience

### Individual Developers
- Track personal AI spending and usage patterns
- Identify which types of tasks are cost-effective to delegate to AI
- Review AI-generated code quality over time

### Engineering Teams & Leads
- Monitor team-wide AI agent usage and costs
- Set budgets and identify cost outliers
- Benchmark model performance across different tasks
- Audit AI-generated commits for quality and compliance

### Organizations Evaluating AI Coding Tools
- Data-driven ROI analysis of Claude Code adoption
- Compare efficiency across models (Sonnet vs Opus vs Haiku)
- Quality metrics to justify or expand AI tooling budgets

---

## Why Now

1. **Claude Code hooks launched recently** — The HTTP hook system makes non-invasive data collection possible for the first time.
2. **AI coding spend is untracked** — Unlike cloud infrastructure (where every team has a cost dashboard), AI coding costs are a blind spot.
3. **No existing solution** — There is no analytics dashboard purpose-built for Claude Code. This is greenfield.
4. **The market is growing fast** — Every developer using Claude Code is a potential user. Anthropic's user base is scaling rapidly.

---

## Technical Differentiators

- **Local-first** — All data stays on your machine. No cloud dependency, no telemetry sent anywhere. SQLite database in `~/.looplens/`.
- **Non-invasive** — Uses Claude Code's native hook system. No wrapper, no proxy, no modified binary.
- **Real-time** — Statusline polling delivers live cost/token updates during active sessions.
- **Lightweight** — Single Express server + React SPA. No Docker, no database server, no infrastructure.
- **Extensible** — Clean REST API makes it easy to build integrations, export data, or connect to external dashboards.

---

## Competitive Landscape

| Tool | Focus | Gap |
|------|-------|-----|
| Anthropic Console | API usage billing | No per-session, per-tool, per-commit granularity |
| LangSmith / LangFuse | LLM observability for custom apps | Not built for Claude Code's hook system |
| Cursor Analytics | Cursor-specific | No Claude Code support |
| Manual log parsing | Claude Code JSONL transcripts | Painful, no aggregation, no real-time |

**LoopLens fills the gap** — purpose-built for Claude Code, local-first, zero-config.

---

## Roadmap

### v0.1 — Current
- Real-time dashboard with 7 views (Overview, Sessions, Agents, Tools, Models, Quality, Commits)
- Session detail with events, transcript, and quality signals
- SQLite storage with indexed queries
- Light/dark theme

### v0.2 — Planned
- **Time-range filters** — View analytics for today, this week, this month
- **Export** — CSV/JSON export of sessions and events
- **Alerts** — Configurable cost thresholds with desktop notifications
- **Session tagging** — Label sessions by project, task type, or team

### v0.3 — Future
- **Team mode** — Aggregate analytics across multiple developers (opt-in)
- **Model recommendations** — Suggest cheaper/faster models based on task patterns
- **MCP server** — Expose analytics as an MCP resource so Claude Code can self-optimize
- **Budget enforcement** — Hard cost caps with automatic session termination

---

## Get Started

```bash
npm install
npm run start
```

Add hooks to `~/.claude/settings.json` and open `http://localhost:4244`.

That's it. Start your next Claude Code session and watch the data flow.

---

**LoopLens** — Know what your AI is doing, what it costs, and whether it's working.
