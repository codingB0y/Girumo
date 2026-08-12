# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **multi-context**. Two contexts, with disjoint runtimes, dependency sets, and vocabulary:

| Context           | Path              | What it is                                                                 |
| ----------------- | ----------------- | -------------------------------------------------------------------------- |
| **web**           | `apps/web/`       | Next.js product surface — painel, landing/LPs, API routes, Supabase stores, Stripe, agents |
| **engine**        | `hubflow-engine/` | Express + Baileys runtime — WhatsApp sessions, queues, anti-ban, watchdog, webhooks |

`packages/shared/{constants,contracts,types}` is a **shared kernel**, not a context. Currently empty — treat anything added there as a contract both contexts must agree on, and change it deliberately.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`<context>/CONTEXT.md`** — `apps/web/CONTEXT.md` or `hubflow-engine/CONTEXT.md` for the context you're working in.
- **`docs/adr/`** at the root — system-wide decisions (cross-context contracts, deploy topology, multi-tenancy).
- **Context-scoped decisions**:
  - `hubflow-engine/DECISIONS.md` — **already exists**. The engine's anti-ban decision log, including an explicit "Recusado (evasão)" list. Read it before proposing anything that touches sending, queueing, groups, or fingerprinting; it is binding.
  - `hubflow-engine/CLAUDE.md` — engine-local instructions.
  - `apps/web/docs/adr/` — web-scoped decisions, if present.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved. `hubflow-engine/DECISIONS.md` is the exception — it exists and must be read.

## File structure

```
/
├── CONTEXT-MAP.md                  ← created lazily by /domain-modeling
├── docs/adr/                       ← system-wide decisions
├── apps/web/
│   ├── CONTEXT.md                  ← lazily
│   └── docs/adr/                   ← lazily
├── hubflow-engine/
│   ├── CONTEXT.md                  ← lazily
│   ├── CLAUDE.md                   ← exists
│   └── DECISIONS.md                ← exists (anti-ban)
└── packages/shared/                ← shared kernel
```

## Use the glossary's vocabulary — and name the context

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in that context's `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

Because the contexts have separate languages, **say which context you mean when a term is ambiguous across them**. Known collision:

- **"session"** — in `hubflow-engine` it's a Baileys WhatsApp socket and its connection lifecycle. In `apps/web` it's an auth/painel session. Bugs on this seam are real (see the `fix/session-connected-priority` work). Write "engine session" / "auth session" rather than a bare "session".

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR — or `hubflow-engine/DECISIONS.md` — surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

For anything on the engine's "Recusado (evasão)" list, do not propose it at all: that list is a standing decision, not an open trade-off.
