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
   - an **MCP endpoint URL** (your Rithmo address + `/api/mcp`), and
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

- **Endpoint:** `https://<your-rithmo-address>/api/mcp`
- **Transport:** HTTP Streamable
- **Auth header:** `Authorization: Bearer rmcp_...` (token must carry the `mcp:read` scope)

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
// result is one of "found" | "found_record" | "no_record" — see the tool reference below.
// Gate on a usable answer: found_record can be on record with a null currentAnswer.
const r = res.structuredContent;
const answer =
  r.result === 'found'        ? r.answer :
  r.result === 'found_record' ? r.subject.currentAnswer :
  null;
if (answer != null && String(answer).trim() !== '') console.log(answer);
else console.log('hold — no answer to act on; do not act on a guess.');
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
| `owner` | string | no | restrict to a named owner (substring match, case-insensitive) |
| `area` | string | no | topical hint to bias retrieval |
| `surface` | string | no | the external system this task concerns (e.g. `"jira"`). When Rithmo does not observe that surface, a miss returns a typed `not_observed` — absence on an unobserved surface is **unknown**, not "no". |

**Output** — a discriminated union on `result` with **three** variants:

| `result` | meaning | where the answer is | actionable? |
|---|---|---|---|
| `found` | live answer from the commitment ledger | `answer` | ✅ yes |
| `found_record` | subject is on record | `subject.currentAnswer` | ✅ **only if non-null** |
| `no_record` | no confident answer; may carry a typed refusal | — | ❌ never |

> ⚠️ **Gate on a usable answer, not on the result value alone.**
> `result === "found"` alone is wrong — it discards valid `found_record` answers.
> `["found", "found_record"].includes(result)` is *also* wrong — a `found_record` can name
> a subject that is genuinely on record while carrying **no answer text**
> (`subject.currentAnswer === null`), and that is not actionable.
>
> ```js
> const answer =
>   r.result === 'found'        ? r.answer :
>   r.result === 'found_record' ? r.subject.currentAnswer :
>   null;
> if (answer != null && String(answer).trim() !== '') { /* act */ } else { /* hold */ }
> ```

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
  "rationale": "<the WHY>", "conditions": "<what it depends on>",   // each or null
  "director": "<who directed it>", "context": { /* payload */ },     // each or null
  "supersedes": { "answer": "...", "decided_at": "ISO", "supersedes": null },  // or null — recurses
  "spine": { "decision_id": "...", "lifecycle_state": "...", "verified": true,
             "board_status": "...|null", "presence": [ ... ], "related_count": 3 },  // or null
  "confidence": 0.71
}

// result: "found_record"
{
  "result": "found_record",
  "subject": { "subjectId": "...", "label": "...", "state": "...", "currentAnswer": "..." },
  "observation": { "sinceMs": 1783606904319, "claim": "...", "surfaces": [ ... ] }   // optional
}

// result: "no_record" — bare, or carrying a typed refusal
{ "result": "no_record" }
{ "result": "no_record", "record": { "status": "closed", "disposition": "superseded",
    "subject": { ... }, "premise_check": { "safe_to_proceed": false, "held_because": "..." } } }
```

**Typed refusals.** When `no_record` carries `record`, `record.status` is `closed`
(with `disposition`: `reversed` | `abandoned` | `superseded`), `no_record` (with `reason`),
or `not_observed` (with `unobserved_surfaces`). Each carries `premise_check`.
`premise_check.safe_to_proceed` is **always `false` when present** — it is a held marker,
not a boolean to evaluate, and `held_because` says why. A `reason` beginning
`record_unavailable:` means the record could not be read at all — hold and retry; it is
neither "no record" nor "we decided no".

**`supersedes` is the supersession history** — a newest-first linked list of the prior
decisions this answer replaced, each with its own `supersedes` pointer. Walk it for the
full chain. Cycle-guarded, capped at 12 hops. `null` when nothing was superseded.

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
| `limit` | integer | no | 1–200, default 50. Out-of-range or non-integer values are a validation error, not silently clamped. |

**Output**

```jsonc
{
  "changes": [
    { "decision_id": "...", "answer": "...",
      "status": "open | in_progress | blocked | fulfilled | dropped | superseded",
      "lifecycle_state": "confirmed",
      "owner": { ... }, "source": { ... }, "decided_at": "ISO", "due_at": "ISO|null",
      "rationale": "...|null", "conditions": "...|null",
      "director": "...|null", "context": {...}|null,
      "changed_at": "ISO" }
  ],
  "cursor": "<opaque — pass as `since` next time>",
  "has_more": true   // page was full; call again to drain the rest
}
```

Each change carries the same record core as `query_decision`'s `found` — including
`rationale`, `conditions`, `director`, and `context` — but **not** `supersedes`, `spine`,
or `confidence`.

Includes reversals — a decision going `dropped` or `superseded` is itself a change, so
`status` here can take those two values, which `found` never returns.

Cursor semantics: the first call (no `since`) returns `changes: []` plus the current head
cursor, so you start from now. `has_more` is simply "the page was full", so an
exactly-full final page yields one more call returning zero changes — that is how the
drain terminates, not an error. When a page returns no rows the `cursor` is echoed back
unchanged, so re-polling is idempotent. Ordering is `(changed_at, decision_id)`.

### `whoami`

No arguments → `{ "org_id": "...", "scopes": ["mcp:read"] }`.

---

## Using it from n8n

n8n's built-in **MCP Client** node calls these tools as normal, deterministic workflow
steps (no AI agent required). Two patterns:

- **Before acting** — `query_decision`, then an IF that proceeds only on a usable answer:
  `found`, or `found_record` whose `subject.currentAnswer` is non-null and non-blank.
- **React to changes** — a Schedule Trigger draining `list_decision_changes`, persisting the
  cursor between runs.

Full setup and an importable, verified workflow are in [`n8n/`](./n8n).

---

## Deployment model

Rithmo is deployed in your own cloud environment, so the endpoint is your own address and the
decision record stays inside your environment. Where Rithmo operates an instance for you, the
endpoint is the address we give you. Same tools, same contract; the token and access control
work identically.

---

## Good practices

- **Treat `no_record` as a first-class branch**, not an error path.
- **Gate on a usable answer, not the result value.** Proceed on `found`, or on
  `found_record` with a non-null `subject.currentAnswer`. Everything else — including a
  null-answer `found_record` — holds.
- **Never proceed when a `premise_check` is present.** It only ever appears with
  `safe_to_proceed: false`.
- **Don't gate on `confidence` equality** — it's a ranked signal; use the result variant to
  decide, and `confidence` only if you want a stricter threshold than ours.
- **Store the token as a secret.** One token = one org's full read access.
- **For change feeds, persist the cursor** and always resume from it; loop while `has_more`.

Questions or access requests: contact your Rithmo team.
