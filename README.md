# Rithmo MCP — examples

Runnable examples for connecting to **Rithmo's read-only MCP server**.

Rithmo is a system of record for decisions. This server lets your tools **query the
decision record before they act** — *"what did we actually decide about X?"* — and
**react when decisions change**. Rithmo emits the record; your tools act on it. Rithmo
never takes actions in your systems.

It speaks the [Model Context Protocol](https://modelcontextprotocol.io), so it works with
[n8n](./n8n/), AI agents, and anything else that speaks MCP.

> **New here? Start with the [Integration Guide](./INTEGRATION.md)** — what it is, how to get
> access, how to connect, and the full tool reference.

## Run it in a few minutes

```bash
git clone https://github.com/Rithmo-Inc/rithmo-mcp-examples
cd rithmo-mcp-examples
npm install
cp .env.example .env      # then edit .env
```

Set two values in `.env`:

- `RITHMO_MCP_URL` — the MCP endpoint of a Rithmo instance (Rithmo Cloud, or your
  self-hosted address).
- `RITHMO_MCP_TOKEN` — a per-organization Rithmo MCP service token (read-only, scoped to
  one org).

Then:

```bash
node examples/query_decision.mjs "What did we decide about GitHub integration?"
node examples/no_record.mjs
node examples/list_decision_changes.mjs
```

## What you'll see

**`query_decision`** — the current decision, or `no_record`:

```
Q: What did we decide about GitHub integration?
✓ found (confidence 0.66)
  answer: Look into GitHub integration details, including permissions and OAuth requirements.
  status: open
  owner:  participant_50332672
  source: meeting · <source ref>
  decided_at: 2026-07-09T14:39:48.296Z
```

**`no_record`** — Rithmo will not fabricate a decision (the differentiator):

```
Q: Did we decide anything about office snacks?
∅ no_record — Rithmo will not fabricate a decision.
   Branch here: pause the automation, route to a human, or use a safe default.
```

**`list_decision_changes`** — a cursor-drained feed of decisions changing state:

```
changes: 20   has_more: true
next cursor: 1783606904319_f901849e-...   ← pass this as the argument on the next poll
  [open] Push the local build after the meeting ends.  (changed 2026-07-09T14:21:44.319Z)
  ...
```

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

Notes:
- **Deterministic answer.** For the same resolved decision, `answer` is byte-identical
  every call (it's the record verbatim — no LLM in the response path). `confidence` is a
  ranked-retrieval signal and may vary slightly; don't gate on its exact value.
- **`owner` and `source` are discriminated states**, never bare nulls — `unowned` and
  `unresolved` are real, meaningful answers your code can branch on.
- **`no_record` is expected**, not an error. Treat it as a branch: Rithmo has no confident
  answer, so don't act on a guess.

### `list_decision_changes`

Drain decisions whose state changed, since a cursor. Built for a polling trigger.

**Input**

| field | type | required | notes |
|---|---|---|---|
| `since` | string | no | opaque cursor from a prior call. Omit on the first call to start "from now" (no backfill); pass `"0_"` to backfill from the start. |
| `limit` | number | no | 1–200, default 50 |

**Output**

```jsonc
{
  "changes": [
    {
      "decision_id": "...",
      "answer": "...", "status": "...", "lifecycle_state": "confirmed",
      "owner": { ... }, "source": { ... },
      "decided_at": "ISO", "due_at": "ISO|null",
      "changed_at": "ISO"
    }
  ],
  "cursor": "<opaque — pass as `since` next time>",
  "has_more": true   // page was full; call again to drain the rest
}
```

Includes reversals — a decision going `dropped` or `superseded` is a change.

### `whoami`

No arguments. Returns `{ org_id, scopes }` — a quick way to verify your token and
connection.

## Auth

Every request carries a per-organization service token as a Bearer header:

```
Authorization: Bearer rmcp_...
```

The token resolves to exactly one organization; every result is scoped to that org. Keep
it in a secret/credential store, never in code.

## Deployment model

The `RITHMO_MCP_URL` above points at **Rithmo Cloud**. Self-hosted Rithmo deployments
expose the **same** MCP server at the customer's own address — same tools, same contract,
different host.

## Using it from n8n

See [`n8n/`](./n8n/) for an importable workflow (query a decision before an execution
step) and setup notes.
