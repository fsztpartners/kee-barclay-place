# kee-barclay-place

A B2B lead [eve](https://github.com/vercel-labs/eve) agent, packaged as a
**keemakr Marketplace** entry. It does two things: **source** net-new accounts
that match your ideal customer profile (ICP), and **qualify** them with a
deterministic ICP-fit score.

It's a small, complete Marketplace entry — one root agent, one tool, and a real
set of dependencies (Apollo, Hunter, and an ICP knowledge base) that exercise the
platform's full `register → resolve-dependencies → install` round-trip.

## What's here

| Path | What it is |
| --- | --- |
| `agent/agent.ts` | The single eve root agent (cheap model; calls `score_lead`). |
| `agent/instructions.md` | How the agent behaves — source + qualify leads, nothing else. |
| `agent/tools/score_lead.ts` | The one tool: a deterministic ICP-fit scorer (0–100 + rationale). |
| `agent/channels/eve.ts` | The HTTP entrypoint (dev-login / OIDC / shared-secret). Root-only in eve. |
| `agent/sandbox.ts` | Pinned to `just-bash` — no real shell, no network. |
| `entry.json` | The Marketplace submission (the `EntrySubmission` the platform ingests). |

## The Marketplace entry

`entry.json` is the metadata the keemakr platform's `registerEntry()` reads. It
declares:

- a **department** `sales` with two **agents**, `sourcer` (Lead Sourcer) and
  `qualifier` (Lead Qualifier),
- one **required connection**: **Apollo** (`provider: "apollo"`) — enrich accounts
  and find verified emails,
- one **optional connection**: **Hunter.io** (`provider: "hunter"`) — email
  fallback,
- one **required knowledge base** (`kind: "kb"`) — your ICP, which targeting and
  scoring follow.

When a tenant installs the entry, the platform resolves those dependencies against
the tenant. Until the required Apollo connection and ICP knowledge base are in
place, the install sits in **`pending_deps`** (department + agents seeded but
disabled); once satisfied, a reconcile flips it to **`installed`**.

## The scorer

`score_lead` takes a lead — `company_name` (required) plus optional `industry`,
`employee_count`, and `signals[]` — and returns a deterministic `score` (0–100),
a `tier` (`hot`/`warm`/`cool`/`cold`), and a short `rationale`. The score is an
employee-count band (company-size fit) plus weighted credit for recognised buying
signals (`funding`, `new_exec`, `hiring`, `expansion`, `intent_keyword`,
`tech_adoption`), lightly nudged by industry. Same input → same score.

## Develop

```bash
nvm use            # Node >= 24
npm install
npm run dev:eve    # run the eve agent locally
npm run typecheck  # tsc --noEmit
npm run lint
```

Ask it: *"score Acme Corp, SaaS, 120 employees, signals: funding, hiring"* →
a hot/warm tier with a 0–100 score and a one-line rationale.

## Capability grant (tenant identity from keemakr)

When the keemakr operator delegates to this agent, it attaches a short-lived
**capability grant** — a signed JWT carrying the verified tenant id and the scopes
the install was granted. This repo verifies that grant against keemakr-core's
published JWKS in [`agent/channels/eve.ts`](agent/channels/eve.ts) via the
`grantAuth()` helper in [`agent/lib/grant-auth.ts`](agent/lib/grant-auth.ts), which
surfaces the tenant + scopes on the session auth context.

The grant is **primary** auth, ahead of the legacy shared secret (which now rides
in its own `x-keemakr-secret` header during the migration window).

Configure it with environment variables on the deployed agent:

| Variable | Purpose |
| --- | --- |
| `KEE_CORE_JWKS_URL` | keemakr-core's JWKS endpoint, e.g. `https://app.keemakr.com/.well-known/jwks.json`. If unset, the grant path is off and only dev-login / OIDC / the shared secret apply. |
| `KEE_AGENT_AUDIENCE` | This deployment's audience — its public origin — matching the `aud` the operator mints. |
| `KEE_BARCLAY_PLACE_INBOUND_SECRET` | Optional legacy shared secret (fallback only; being retired). |

> The `grant-auth.ts` helper is the same one published as
> [`@keemakr/agent-sdk`](https://www.npmjs.com/package/@keemakr/agent-sdk)
> (`import { grantAuth } from "@keemakr/agent-sdk"`). It is vendored here for now
> and will be replaced by the package import.
