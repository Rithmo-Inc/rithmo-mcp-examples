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

- `RITHMO_MCP_URL` — the MCP endpoint of your Rithmo deployment: your Rithmo address
  followed by `/api/mcp`.
- `RITHMO_MCP_TOKEN` — a per-organization Rithmo MCP service token (read-only, scoped to
  one org, carrying the `mcp:read` scope).

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

A `no_record` may carry a **typed refusal** explaining *why* it is held:

```
Q: Are we still migrating to the new billing provider?
∅ no_record — held (closed · superseded)
   subject: Billing provider migration
   held_because: That decision was superseded; acting on the old premise is unsafe.
   safe_to_proceed: false
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
| `owner` | string | no | restrict to a named owner (substring match, case-insensitive) |
| `area` | string | no | topical hint to bias retrieval |
| `surface` | string | no | the external system this task concerns (e.g. `"jira"`, `"salesforce"`). When Rithmo does not observe that surface, a miss returns a typed `not_observed` instead of a bare `no_record` — absence on an unobserved surface is **unknown**, not "no". |

**Output** — a discriminated union on `result` with **three** variants:
`"found"`, `"found_record"`, and `"no_record"`.

> ⚠️ **Do not write `result === "found" ? act : treat-as-no-record`.** `found_record` is a
> real answer, and two-state branching silently routes valid answers into your no-record
> path.
>
> But do not flip to `["found", "found_record"].includes(result)` either — that is also
> wrong. A `found_record` can name a subject that is genuinely on record while carrying
> **no answer text** (`subject.currentAnswer === null`). The correct rule gates on a
> *usable answer*:
>
> ```js
> const r = res.structuredContent;
> const answer =
>   r.result === 'found'        ? r.answer :
>   r.result === 'found_record' ? r.subject.currentAnswer :
>   null;
> if (answer != null && String(answer).trim() !== '') { /* act */ }
> else { /* hold — no answer to act on */ }
> ```

#### `result: "found"` — a live answer from the commitment ledger

```jsonc
{
  "result": "found",
  "answer": "<verbatim decision text>",
  "status": "open | in_progress | blocked | fulfilled",
  "lifecycle_state": "confirmed",
  "owner":  { "state": "owned", "name": "...", "user_id": "..." },   // or { "state": "unowned" }
  "source": { "state": "resolved", "system": "meeting|slack|github|...", "ref": "...", "url": "..." }, // or { "state": "unresolved" }
  "decided_at": "2026-07-19T15:04:00Z",
  "due_at": "2026-07-25T00:00:00Z",   // or null
  "rationale":  "<the WHY behind the decision>",   // or null
  "conditions": "<what it depends on>",            // or null
  "director":   "<who assigned/directed it>",      // or null
  "context":    { /* arbitrary payload */ },       // or null
  "supersedes": {                                  // or null
    "answer": "<the decision this one replaced>",
    "decided_at": "2026-06-02T10:00:00Z",
    "supersedes": null                             // recurses — walk it for the full chain
  },
  "spine": {                                       // or null; present when spine context resolves
    "decision_id": "...",
    "lifecycle_state": "<canonical live state>",
    "verified": true,
    "board_status": "..." ,                        // or null
    "presence": [{ "provider": "github", "external_status": "...", "external_url": "..." }],
    "related_count": 3
  },
  "confidence": 0.71
}
```

**`supersedes` is the supersession history.** It is a linked list, newest-first: each node
is a prior decision this answer replaced, with its own `supersedes` pointer. Walk it to
reconstruct how the answer changed over time (e.g. cloud → private env → customer
servers). `null` means this decision superseded nothing. The chain is cycle-guarded and
capped at 12 hops.

#### `result: "found_record"` — a live answer from the subject record

Returned when the subject record holds a current answer that the commitment ledger does
not. **This is an answer, not a refusal.**

```jsonc
{
  "result": "found_record",
  "subject": {
    "subjectId": "...",
    "label": "<human-readable subject>",
    "state": "<subject state>",
    "currentAnswer": "<the current answer>"   // may be null
  },
  "observation": {                            // optional
    "sinceMs": 1783606904319,
    "claim": "<nothing observed since … bears on this subject>",
    "surfaces": [
      { "surface": "slack", "observedFromMs": 0, "observedThroughMs": 0, "basis": "..." }
    ]
  }
}
```

The answer lives at `subject.currentAnswer`, **not** `answer`.

**`currentAnswer` may be `null`, and that case is not actionable.** The subject is
genuinely on record — Rithmo knows what you are asking about — but there is no answer text
to act on. That is a meaningful signal (the subject exists, its answer does not), and it is
distinct from `no_record`, which says Rithmo has no confident match at all. Either way you
must **hold**: route a null-answer `found_record` down the same path as `no_record`.

#### `result: "no_record"` — no confident answer

```jsonc
// bare form — no confident match, no refusal detail
{ "result": "no_record" }

// typed-refusal form — `record` explains WHY
{
  "result": "no_record",
  "record": { /* one of the four shapes below */ }
}
```

When present, `record.status` is one of:

| `record.status` | meaning | extra fields |
|---|---|---|
| `closed` | the subject is settled and the premise is dead | `disposition`: `reversed` \| `abandoned` \| `superseded`; `subject` |
| `no_record` | the record was consulted and genuinely has nothing | `reason` (string) |
| `not_observed` | Rithmo does not observe the surface you asked about, so absence proves nothing | `unobserved_surfaces`: string[] |

All three carry `premise_check`, and `closed`/`no_record`/`not_observed` may also carry an
`observation.surfaces` array describing what was read and over what window.

```jsonc
"premise_check": {
  "safe_to_proceed": false,
  "held_because": "<why acting on this premise is unsafe>"
}
```

**`premise_check.safe_to_proceed` is always `false` when the field is present.** It is not
a boolean to evaluate — it is a marker that the answer is *held*, and `held_because` tells
you why. Never proceed on a `no_record`, with or without a `premise_check`.

One `reason` value is worth special handling: a `record.status: "no_record"` whose
`reason` starts with `record_unavailable:` means the record could not be read (a transient
failure). That is **not** "no record" and **not** "we decided no" — hold and retry.

Notes:
- **Deterministic answer.** For the same resolved decision, every `found` field except
  `confidence` is byte-identical every call (it's the record verbatim — no LLM in the
  response path). `confidence` is a ranked-retrieval signal and may vary slightly; don't
  gate on its exact value.
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
| `limit` | integer | no | 1–200, default 50. Out-of-range or non-integer values are rejected as a validation error, not silently clamped. |

**Output**

```jsonc
{
  "changes": [
    {
      "decision_id": "...",
      "answer": "...",
      "status": "open | in_progress | blocked | fulfilled | dropped | superseded",
      "lifecycle_state": "confirmed",
      "owner": { ... }, "source": { ... },
      "decided_at": "ISO", "due_at": "ISO|null",
      "rationale": "...|null", "conditions": "...|null",
      "director": "...|null",  "context": {...}|null,
      "changed_at": "ISO"
    }
  ],
  "cursor": "<opaque — pass as `since` next time>",
  "has_more": true   // page was full; call again to drain the rest
}
```

Each change carries the **same record core as `query_decision`'s `found`** — including
`rationale`, `conditions`, `director`, and `context`. It does **not** carry `supersedes`,
`spine`, or `confidence`; those are `query_decision`-only.

**`status` is wider here than in `found`.** Reversals are emitted as changes, so `status`
can be `dropped` or `superseded` — values `query_decision`'s `found` never returns
(it only resolves to live rows). If you mirror this feed into your own store, handle those
two values explicitly.

Cursor semantics:
- **First call (no `since`)** returns `changes: []` and the current head cursor. You start
  from now and do not replay history. `has_more` is `false`.
- **`has_more` is `rows.length === limit`** — a full page. It can be `true` on an
  exactly-full final page, so the next call legitimately returns zero changes. That is not
  an error; it is how the drain terminates.
- **When a page returns no rows, `cursor` is echoed back unchanged**, so re-polling with
  it is safe and idempotent.
- Ordering is by `(changed_at, decision_id)`.

### `whoami`

No arguments. Returns `{ org_id, scopes }` — a quick way to verify your token and
connection.

## Auth

Every request carries a per-organization service token as a Bearer header:

```
Authorization: Bearer rmcp_...
```

The token resolves to exactly one organization and must carry the `mcp:read` scope; every
result is scoped to that org. Keep it in a secret/credential store, never in code.

A request with no token, or an unknown token, is rejected with `401`. There is no
anonymous access.

## Registry

Rithmo's MCP server is described by [`server.json`](./server.json) in this repo, under the
registry identity **`ai.rithmo/rithmo`** (version `0.1.0`). Full docs live at
<https://rithmo.ai/mcp>.

## Deployment model

Rithmo is deployed in your own cloud environment, and the MCP server runs at your own
address. Where Rithmo operates an instance for you, it runs at the address we give you —
same tools, same contract.

## Using it from n8n

See [`n8n/`](./n8n/) for an importable workflow (query a decision before an execution
step) and setup notes.
