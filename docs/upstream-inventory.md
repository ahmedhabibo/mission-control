# Upstream builderz-labs/mission-control — File Inventory

> Captured 2026-07-12 from main branch (v2.1.0+, post-Tailwind v4 migration)
> Source: https://github.com/builderz-labs/mission-control

## API Route Groups (49 directories under src/app/api/)

activities, adapters, agent-runtimes, agents, alerts, audit, auth, backup,
channels, chat, claude-tasks, claude/sessions, cleanup, connect, cron, debug,
diagnostics, docs, events, exec-approvals, export, frameworks, gateway-config,
gateways, github, gnap, health, hermes, index, integrations, local, logs,
mcp-audit/verify, memory, mentions, nodes, notifications, onboarding,
openclaw, pipelines, provision, security-audit, security-scan, sessions,
settings, setup, skills, spawn, standup, status, super, system-monitor,
tasks, tokens, v1, webhooks, workflows, workload, workspaces

## src/lib/ — Key Files (100+ files)

### Core infrastructure
- db.ts — SQLite (better-sqlite3, WAL mode)
- migrations.ts — 39 schema migrations
- schema.sql — base schema
- auth.ts — session + API key auth, RBAC
- password.ts — scrypt hashing
- session-cookie.ts — cookie management
- google-auth.ts — OAuth integration
- rate-limit.ts — rate limiting
- csp.ts — Content Security Policy
- config.ts — config management
- validation.ts — Zod 4 schemas

### Agent lifecycle
- agent-evals.ts — 4-layer eval framework
- agent-optimizer.ts — model optimization
- agent-runtimes.ts — runtime detection (Claude/Codex/OpenCode/Hermes)
- agent-sync.ts — bidirectional workspace sync
- agent-templates.ts — SOUL templates
- agent-workspace.ts — workspace resolution
- agent-card-helpers.ts — UI helpers
- local-agent-sync.ts — native agent discovery
- coordinator-routing.ts — multi-agent routing
- task-dispatch.ts — task assignment
- task-routing.ts — routing logic
- task-status.ts — status machine
- task-costs.ts — per-task cost tracking
- runs.ts — execution runs
- spawn-history.ts — sub-agent spawn tracking
- recurring-tasks.ts — NL scheduling
- schedule-parser.ts — "every morning at 9am" → cron
- cron-utils.ts, cron-occurrences.ts — cron logic
- scheduler.ts — background task scheduler

### Provider / Gateway
- gateway-runtime.ts — gateway management
- gateway-url.ts — URL building
- openclaw-gateway.ts — OpenClaw adapter
- models.ts — model catalog
- token-pricing.ts — cost per model
- token-utils.ts — token counting
- provider-subscriptions.ts — multi-provider
- hermes-memory.ts, hermes-sessions.ts, hermes-tasks.ts — Hermes bridge
- claude-sessions.ts, claude-tasks.ts — Claude Code bridge
- codex-sessions.ts — Codex bridge
- opencode-sessions.ts — OpenCode bridge

### Security
- secret-scanner.ts — secret detection
- security-events.ts — trust scoring + event log
- security-scan.ts — skill security scanner
- injection-guard.ts — prompt injection detection
- mcp-audit.ts — MCP tool call auditing
- hook-profiles.ts — minimal/standard/strict profiles
- exec-approval-utils.ts — execution approvals
- browser-security.ts — client-side security
- device-identity.ts — device fingerprinting

### Skills
- skill-registry.ts — ClawdHub / skills.sh client
- skill-sync.ts — bidirectional disk ↔ DB sync

### Integrations
- github.ts, github-sync-engine.ts, github-sync-poller.ts, github-label-map.ts
- webhooks.ts — outbound webhooks with HMAC + retry
- gnap-sync.ts — GNAP auth sync
- tailscale-serve.ts — Tailscale integration

### UI / State
- themes.ts — theme management
- dashboard-widgets.ts — widget system
- navigation.ts, navigation-metrics.ts — nav system
- office-layout.ts — org chart layout
- use-smart-poll.ts — smart polling hook
- use-server-events.ts — SSE hook
- use-focus-trap.ts — a11y
- chat-utils.ts — chat helpers

### PTY / Terminal
- pty-manager.ts — PTY process management
- pty-websocket.ts — PTY over WebSocket

### Data / Export
- backup.ts, export.ts — backup/export
- transcript-parser.ts — session transcripts
- memory-search.ts, memory-utils.ts, memory-path.ts — memory graph
- docs-knowledge.ts — knowledge base

### Tests
- __tests__/ — 1091+ unit tests
- config.test.ts, google-auth.test.ts, proxy.test.ts — top-level tests

## Tech Stack (matches your fork + additions)
- Next.js 16, React 19, TypeScript 5.7
- better-sqlite3 (WAL) — you use Drizzle, they use raw SQL
- Zustand 5 — you don't have
- Recharts 3 — you have
- Zod 4 — you don't have
- Tailwind CSS v4 — you have
- Vitest + Playwright — you don't have
- WebSocket + SSE — you have SSE only
