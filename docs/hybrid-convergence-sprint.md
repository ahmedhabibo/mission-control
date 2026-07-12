# Mission Control — Hybrid Convergence Sprint Plan

> **Strategy:** Import upstream `builderz-labs/mission-control` panels and infrastructure while keeping your custom chat adapter layer and live model discovery as the unique value.
> **Date:** 2026-07-12
> **Reference:** `docs/upstream-inventory.md` in this repo

---

## Guiding Principles

1. **Keep your differentiators:** live model discovery (191 models via NIM + Mistral), 4-adapter chat layer, composite probe engine, ThinkingResponse UX
2. **Import their infrastructure:** migration system, Zod validation, Zustand state, test harness, RBAC, scheduler
3. **Import their panels:** Tasks Kanban, Skills Hub, Memory Browser, Cost Tracking, Activity Feed — these are well-tested UI components
4. **Bridge, don't rewrite:** your `src/lib/chat/adapters/*` stays as-is; upstream's `src/lib/adapters/*` (framework adapters) is imported alongside as a separate concern
5. **Surgical imports:** copy one file/module at a time, adapt to your schema, verify with `tsc --noEmit` + manual smoke test

---

## Sprint 3A — Foundation (Week 1, 2-3 days)

### A.1 — Migrate from Drizzle to numbered SQL migrations
**Why:** Unlocks sharing migration history with upstream; lets you cherry-pick their migration files
- [ ] Create `src/lib/migrations/` directory with numbered `.sql` files
- [ ] Port your current Drizzle schema to `001_initial.sql` (tasks, conversations, messages, tool_overrides, status_history)
- [ ] Create `src/lib/migrations.ts` — adaptation of upstream's runner (tracks applied migrations in `_migrations` table)
- [ ] Replace `drizzle-kit push` with `pnpm migrate` script
- [ ] Verify: `pnpm migrate && pnpm dev` — app starts, DB works

**Source files:**
- `src/lib/migrations.ts` (upstream) — migration runner
- `src/lib/schema.sql` (upstream) — base schema reference

### A.2 — Add Zod 4 validation
**Why:** Runtime safety on all API routes; matches upstream patterns
- [ ] `pnpm add zod`
- [ ] Create `src/lib/validation.ts` — adaptation of upstream's file
- [ ] Add schemas for: `createTaskSchema`, `updateTaskSchema`, `createConversationSchema`, `registerAgentSchema`
- [ ] Wire into existing API routes: `src/app/api/chat/send/route.ts`, `src/app/api/tasks/` (when added)
- [ ] Verify: POST with invalid body → 400 + Zod error message

**Source files:**
- `src/lib/validation.ts` (upstream)

### A.3 — Add Zustand 5 for state management
**Why:** Upstream panels expect Zustand store; unblocks importing UI components
- [ ] `pnpm add zustand`
- [ ] Create `src/store/index.ts` — adaptation of upstream's store
- [ ] Migrate `src/app/chat/page.tsx` state to Zustand (showThinking, currentModel, messages, streaming)
- [ ] Verify: chat still works, localStorage persistence intact

**Source files:**
- `src/store/index.ts` (upstream)

### A.4 — Add Vitest test harness
**Why:** Safe refactoring for all subsequent imports
- [ ] `pnpm add -D vitest`
- [ ] Create `vitest.config.ts`
- [ ] Write 5 baseline tests: probe composite rollup, task classifier, model picker grouping, chat ID generation, gateway auth check
- [ ] Add `pnpm test` script
- [ ] Verify: `pnpm test` passes 5/5

---

## Sprint 3B — Import Core Panels (Week 2, 3-4 days)

### B.1 — Tasks Kanban Board
**Why:** Your task runner exists but has no UI; upstream has a polished 6-column Kanban
- [ ] Copy `src/app/api/tasks/` route group from upstream (queue, CRUD, comments)
- [ ] Adapt to your `tasks` table schema (add missing columns: `status` enum, `priority`, `assigned_to`, `project_id`, `labels`, `thread_id`)
- [ ] Copy `src/components/panels/TasksPanel.tsx` from upstream
- [ ] Wire to your existing `tasks/runner.ts` via the new API routes
- [ ] Add drag-and-drop (upstream uses `@dnd-kit/core`)
- [ ] Verify: create task from UI → appears in inbox → drag to "in progress" → runner picks it up

**Key upstream files:**
- `src/app/api/tasks/` (route group — queue, CRUD, comments)
- `src/lib/task-dispatch.ts`, `task-routing.ts`, `task-status.ts`
- `src/components/panels/TasksPanel.tsx`

### B.2 — Agents Panel + Heartbeat System
**Why:** Upstream's agent SOUL system + heartbeat is the missing "fleet" layer
- [ ] Copy `src/app/api/agents/` route group (register, sync, heartbeats)
- [ ] Create `agents` table (migration `002_agents.sql`): `id, name, role, soul_config, status, last_heartbeat, default_model, budget_monthly, created_at`
- [ ] Copy `src/lib/agent-templates.ts` — SOUL template system
- [ ] Copy `src/lib/agent-sync.ts` — bidirectional workspace sync
- [ ] Adapt `src/components/panels/AgentsPanel.tsx`
- [ ] Wire your existing chat adapters as agent `default_model` presets
- [ ] Verify: `curl POST /api/agents/register` → agent appears → heartbeat updates status

### B.3 — Skills Hub (simplified)
**Why:** You already have `~/.hermes/skills/` — Skills Hub surfaces them in the UI
- [ ] Copy `src/app/api/skills/` route group (list, install, security-scan)
- [ ] Create `skills` table (migration `003_skills.sql`): `id, slug, name, category, path, source, installed, security_status, created_at`
- [ ] Copy `src/lib/skill-sync.ts` — scan `~/.hermes/skills/` → DB
- [ ] Copy `src/lib/skill-registry.ts` — adapt to read from local skills instead of ClawdHub
- [ ] Copy `src/lib/security-scan.ts` — skill security scanner (prompt injection / SSRF / path traversal / secret detection)
- [ ] Adapt `src/components/panels/SkillsPanel.tsx`
- [ ] Verify: `/skills` page shows installed skills from `~/.hermes/skills/`, security scan runs on click

---

## Sprint 3C — Infrastructure Hardening (Week 3, 2-3 days)

### C.1 — Natural-Language Scheduler
**Why:** Replaces Hermes-level cron with MC-managed scheduling; "every morning at 6am Moscow time" → stored in DB
- [ ] Copy `src/lib/schedule-parser.ts` from upstream (34 unit tests already written)
- [ ] Copy `src/lib/recurring-tasks.ts` — template clone pattern
- [ ] Copy `src/lib/scheduler.ts` — background task scheduler
- [ ] Create `routines` table (migration `004_routines.sql`): `id, title, schedule_cron, schedule_nl, agent_id, task_template, last_run, next_run, enabled`
- [ ] Add `src/app/api/cron/` route group (CRUD + trigger)
- [ ] Wire scheduler to call your `tasks/runner.ts` with the template
- [ ] Verify: `POST /api/cron { "schedule": "every morning at 6am", "agent": "hermes", "template": { "title": "Daily briefing" } }` → cron stored → next_run calculated

### C.2 — Cost Tracking + Budget Enforcement
**Why:** You track tokens in DB but don't enforce; upstream has per-model pricing + budget hard-stops
- [ ] Copy `src/lib/token-pricing.ts` — model → cost mapping
- [ ] Copy `src/lib/task-costs.ts` — per-task cost aggregation
- [ ] Add `budget_monthly_cap` and `tokens_used_this_month` to `agents` table (migration `005_budgets.sql`)
- [ ] In `tasks/runner.ts` → before executing, check `tokens_used_this_month < budget_monthly_cap`; if over, mark task as `budget_exceeded`
- [ ] Add `src/app/api/tokens/` route group (usage stats, budget status)
- [ ] Adapt `src/components/panels/CostTrackingPanel.tsx`
- [ ] Verify: set agent budget to 1000 tokens → send 5 messages → 6th message gets `budget_exceeded` status

### C.3 — Activity Feed
**Why:** Audit trail of all mutations; durable (vs. your current transient pub/sub)
- [ ] Create `activity` table (migration `006_activity.sql`): `id, actor, action, entity_type, entity_id, metadata, created_at`
- [ ] Copy `src/lib/event-bus.ts` from upstream
- [ ] Add event emission to: task create/update/complete, agent register/heartbeat, skill install, conversation create
- [ ] Add `src/app/api/activities/` route group
- [ ] Adapt `src/components/panels/ActivityPanel.tsx`
- [ ] Verify: create a task → activity entry appears → filter by agent/type works

---

## Sprint 3D — Quality + Security (Week 4, optional)

### D.1 — Quality Gate (Aegis-style)
- [ ] Add `requires_review BOOLEAN` + `reviewed_by TEXT` to `tasks` table (migration `007_quality_gate.sql`)
- [ ] Tasks with `priority >= high` auto-set `requires_review = true`
- [ ] Add `POST /api/tasks/:id/review` endpoint — approve/reject with comment
- [ ] Tasks in `review` status cannot move to `done` without approval
- [ ] Adapt UI: Kanban "Quality Review" column + approve/reject buttons

### D.2 — Security Scanner (skill-level)
**Prerequisite:** B.3 Skills Hub completed
- [ ] Copy `src/lib/injection-guard.ts` — prompt injection detection
- [ ] Copy `src/lib/secret-scanner.ts` — secret detection in agent messages
- [ ] Wire into chat stream: scan each assistant message, log findings to `security_events` table
- [ ] Add `security_events` table (migration `008_security.sql`)
- [ ] Adapt `src/components/panels/SecurityPanel.tsx`

---

## Sprint 3E — Upstream Contributions (ongoing)

### E.1 — Contribute live model discovery back
**Your unique value:** `src/app/api/chat/models/route.ts` — live `/v1/models` fetch with cache + merge
- [ ] Clean up the code, add tests
- [ ] Open PR to `builderz-labs/mission-control` with `feat: live provider model discovery`
- [ ] Reference: NIM + Mistral + OpenRouter as examples

### E.2 — Contribute composite probe engine
- [ ] Document `src/lib/probes/composite.ts` pattern
- [ ] Open PR: `feat: composite health probes with rollup modes`

### E.3 — Contribute ThinkingResponse UX
- [ ] Extract `src/components/chat/ThinkingResponse.tsx` as standalone component
- [ ] Open PR: `feat: collapsible thinking blocks with localStorage toggle`

---

## Dependency Graph

```
A.1 Migrations ──┬── A.2 Zod ──┬── B.1 Tasks Kanban ──── C.1 Scheduler
                 │              ├── B.2 Agents Panel ─── C.2 Cost Tracking
                 │              ├── B.3 Skills Hub ───── D.2 Security Scanner
                 │              └── B.4 Activity Feed ─── D.1 Quality Gate
                 └── A.4 Vitest ─┘
                 └── A.3 Zustand ┘
```

## Estimated Effort

| Sprint | Tasks | Effort | Outcome |
|--------|-------|--------|---------|
| **3A Foundation** | 4 | 2-3 days | Migrations, Zod, Zustand, Vitest |
| **3B Panels** | 3 | 3-4 days | Tasks Kanban, Agents, Skills Hub |
| **3C Infrastructure** | 3 | 2-3 days | Scheduler, Cost Tracking, Activity Feed |
| **3D Quality+Security** | 2 | 2 days | Quality Gate, Security Scanner |
| **3E Contributions** | 3 | ongoing | PRs to upstream |
| **Total** | 15 | ~2 weeks | Full hybrid convergence |

## What stays as your custom core (never imported from upstream)

1. `src/lib/chat/adapters/*` — your 4-adapter chat layer (hermes, mistral, opencode, openrouter)
2. `src/app/api/chat/models/route.ts` — live model discovery (191 models)
3. `src/lib/probes/*` — composite probe engine
4. `src/components/chat/*` — ModelPicker, ThinkingResponse
5. `src/server/gateway.ts` — your dev gateway
6. `src/lib/tasks/classifier.ts` — your intent classifier
7. `src/lib/tasks/router.ts` — your routing logic

These are your contribution candidates back TO upstream.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Upstream uses raw `better-sqlite3`; you use Drizzle ORM | Option A: switch to raw SQL (match upstream). Option B: keep Drizzle, translate migrations. **Recommend A** — upstream's raw SQL is simpler and migration-friendly |
| Upstream has 39 migrations already; your schema differs | Start your migration numbering at `001_initial.sql` with your current schema, then selectively port upstream migrations as needed |
| Upstream uses Zustand; you use React state | A.3 migrates chat state first; panels imported later expect Zustand |
| Upstream panels expect auth context | Add a mock `useAuth()` hook that returns `{ role: 'admin', user: 'ahmed' }` — defer real auth until needed |
| Upstream panels expect gateway connection | Set `NEXT_PUBLIC_GATEWAY_OPTIONAL=true` — panels degrade gracefully without gateway |
