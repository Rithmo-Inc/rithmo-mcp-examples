# Rithmo MCP — Integration Guide

Connect your tools and agents to your organization's **decision record**. Ask what was
decided before you act, and react when decisions change.

> **Status: early access (design partners).** The interface is live and stable; access is
> provisioned by us per organization (see [Getting access](#getting-access)). Not yet
> self-serve.

---

## What it is

Rithmo maintains a single, reconciled record of the decisions your organization makes —
what was decided, who owns it, where it came from, and whether it's still live. This is a
**read-only [MCP](https://modelcontextprotocol.io) server** that lets any MCP-compatible
tool (n8n, AI agents, your own code) reach that record.

**Rithmo emits the record. Your tools act on it.** Rithmo never writes to or takes actions
in your systems.

Three tools:

| Tool | What it does |
|---|---|
| `query_decision` | Look up the current decision for a natural-language question — answer, owner, source, status — or an explicit `no_record`. |
| `list_decision_changes` | Drain a feed of decisions that changed state (made, completed, dropped, reversed). Built for a polling trigger. |
| `whoami` | Return the org + scopes your token resolves to. A quick connection check. |

---

## Getting access

There is no self-serve signup yet. To connect:

1. **Request access** — contact Rithmo (or your Rithmo contact) and ask to enable the MCP
   interface for your organization.
2. **We provision a token** — we create a **per-organization service token** (read-only,
   scoped to exactly your org) and give you:
   - an **MCP endpoint URL** (Rithmo Cloud, or your self-hosted address), and
   - the **token** (a `rmcp_...` string, shown once).
3. **You connect** — drop the URL + token into your MCP client or n8n (below).

Notes:
- The token maps to exactly one organization. Every result is scoped to that org — the org
  boundary is the access control.
- Keep the token in a secret/credential store, never in code or a workflow export.
- Rotation/revocation is handled by us on request.

**Coverage:** `query_decision` answers for decisions Rithmo has captured and indexed for
your org, so its usefulness scales with how much of your decision history Rithmo has
ingested. `list_decision_changes` reads the live record directly.

---

## Connect

The server speaks MCP over **Streamable HTTP**, authenticated with a **Bearer token**.

- **Endpoint:** the URL we provide (e.g. `https://mcp.rithmo.ai/api/mcp`)
- **Transport:** HTTP Streamable
- **Auth header:** `Authorization: Bearer rmcp_...`

Minimal client (Node, using the official MCP SDK):

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(new URL(process.env.RITHMO_MCP_URL), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.RITHMO_MCP_TOKEN}` } },
});
const client = new Client({ name: 'my-app', version: '1.0.0' });
await client.connect(transport);

const res = await client.callTool({
  name: 'query_decision',
  arguments: { question: 'Are we still shipping the new onboarding flow?' },
});
console.log(res.structuredContent); // { result: "found", answer, owner, source, ... } | { result: "no_record" }
```

Runnable versions of this (plus `no_record` and `list_decision_changes`) are in
[`examples/`](./examples).

---

## The tools

### `query_decision`

Look up the current authoritative decision for a natural-language question.

**Input**

| field | type | required | notes |
|---|---|---|---|
| `question` | string | yes | e.g. "Are we still shipping the new onboarding flow?" |
| `type` | `action_item` \| `follow_up` \| `decision` | no | restrict to one type |
| `owner` | string | no | restrict to a named owner |
| `area` | string | no | topical hint to bias retrieval |

**Output** — a discriminated union on `result`:

```jsonc
// result: "found"
{
  "result": "found",
  "answer": "<verbatim decision text>",
  "status": "open | in_progress | blocked | fulfilled",
  "lifecycle_state": "confirmed",
  "owner":  { "state": "owned", "name": "...", "user_id": "..." },   // or { "state": "unowned" }
  "source": { "state": "resolved", "system": "meeting|slack|github|...", "ref": "...", "url": "..." }, // or { "state": "unresolved" }
  "decided_at": "2026-07-19T15:04:00Z",
  "due_at": "2026-07-25T00:00:00Z",   // or null
  "confidence": 0.71
}

// result: "no_record"
{ "result": "no_record" }
```

- **`answer` is deterministic** — byte-identical for the same resolved decision (the record
  verbatim, no LLM in the response path). `confidence` is a ranked-retrieval signal and may
  vary slightly; don't gate on its exact value.
- **`owner` and `source` are discriminated states, never bare nulls.** `unowned` and
  `unresolved` are real, meaningful answers you can branch on.
- **`no_record` is expected, not an error.** Rithmo won't fabricate a decision — branch your
  logic here (pause, ask a human, use a safe default). A false answer from a decision source
  is far more costly than a blocked step.

### `list_decision_changes`

Drain decisions whose state changed, since a cursor. Poll it on a schedule.

**Input**

| field | type | required | notes |
|---|---|---|---|
| `since` | string | no | opaque cursor from a prior call. Omit on the first call to start "from now" (no backfill); pass `"0_"` to backfill from the start. |
| `limit` | number | no | 1–200, default 50 |

**Output**

```jsonc
{
  "changes": [
    { "decision_id": "...", "answer": "...", "status": "...", "lifecycle_state": "confirmed",
      "owner": { ... }, "source": { ... }, "decided_at": "ISO", "due_at": "ISO|null",
      "changed_at": "ISO" }
  ],
  "cursor": "<opaque — pass as `since` next time>",
  "has_more": true   // page was full; call again to drain the rest
}
```

Includes reversals — a decision going `dropped` or `superseded` is itself a change.

### `whoami`

No arguments → `{ "org_id": "...", "scopes": ["mcp:read"] }`.

---

## Using it from n8n

n8n's built-in **MCP Client** node calls these tools as normal, deterministic workflow
steps (no AI agent required). Two patterns:

- **Before acting** — `query_decision`, then an IF on `{{ $json.structuredContent.result }}`
  to branch on `found` vs `no_record`.
- **React to changes** — a Schedule Trigger draining `list_decision_changes`, persisting the
  cursor between runs.

Full setup and an importable, verified workflow are in [`n8n/`](./n8n).

---

## Deployment model

The endpoint points at **Rithmo Cloud**, or — for self-hosted Rithmo — the **same** MCP
server at your own address. Same tools, same contract, different host. Self-hosted keeps the
decision record inside your environment; the token and access control work identically.

---

## Good practices

- **Treat `no_record` as a first-class branch**, not an error path.
- **Don't gate on `confidence` equality** — it's a ranked signal; use the `found`/`no_record`
  result to decide, and `confidence` only if you want a stricter threshold than ours.
- **Store the token as a secret.** One token = one org's full read access.
- **For change feeds, persist the cursor** and always resume from it; loop while `has_more`.

Questions or access requests: contact your Rithmo team.
