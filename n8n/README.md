# Rithmo × n8n

Query Rithmo's decision record from an n8n workflow — before an execution step — and
branch on the answer.

Use n8n's built-in **MCP Client** node (`n8n-nodes-langchain.mcpclient`). It calls a named
MCP tool deterministically as a normal workflow step (no AI Agent / no LLM in the loop).

## Manual setup (the reliable path)

**1. Connection** — in the MCP Client node:

| Field | Value |
|---|---|
| MCP Endpoint URL | `https://<your-rithmo-address>/api/mcp` |
| Server Transport | **HTTP Streamable** |
| Authentication | **Bearer Token** → your `rmcp_...` service token |

Store the token in an n8n **credential**, not inline. The node's tool list should show
`whoami`, `query_decision`, `list_decision_changes`.

**2. Pattern A — look up a decision before acting**

```
[trigger] → [MCP Client: query_decision] → [IF usable answer on record] ─true→ [extract answer] → [proceed]
                                                                        └false→ [hold: no answer to act on]
```

`query_decision` returns **three** result variants — `found`, `found_record`, and
`no_record`. `found` and `found_record` are both real answers, but a `found_record` can
name a subject that is on record while carrying **no answer text**.

> ⚠️ **Gate on a usable answer, not on the result value.**
> Branching on `result == "found"` alone discards valid `found_record` answers.
> Branching on `["found","found_record"]` alone lets a null-answer `found_record` reach
> your Proceed path with nothing to act on. The IF below checks both.

- MCP Client → **Tool:** `query_decision`, **Input Mode:** JSON,
  parameters: `{ "question": "{{ $json.question }}" }` (optional `type`, `owner`, `area`,
  `surface`).
- IF node → **Boolean → is true** on:
  ```
  {{ $json.structuredContent.result === "found"
     || ($json.structuredContent.result === "found_record"
         && $json.structuredContent.subject.currentAnswer !== null
         && String($json.structuredContent.subject.currentAnswer).trim() !== "") }}
  ```
  (The MCP Client node returns the tool result under **`structuredContent`**. The `&&`
  short-circuits, so `subject` is only dereferenced when the result is `found_record`.)
- **Extract answer** (a Set node) normalises the two answer shapes, because they hold the
  answer in different places:
  ```
  {{ $json.structuredContent.result === "found"
       ? $json.structuredContent.answer
       : $json.structuredContent.subject.currentAnswer }}
  ```
  `found` also gives you `.status`, `.owner`, `.source`, `.rationale`, `.conditions`,
  `.director`, `.context`, `.supersedes`, `.spine`, `.confidence`.
  `found_record` gives you `.subject` (`label`, `state`, `currentAnswer`) and an optional
  `.observation`.
- **Hold branch** — reached by `no_record` *and* by a `found_record` whose
  `subject.currentAnswer` is null or blank. Pause, route to a human, or use a safe default.
  `{{ $json.structuredContent.record }}` may carry a typed refusal — `closed` (with a
  `disposition`), `no_record` (with a `reason`), or `not_observed` (with
  `unobserved_surfaces`). Its `premise_check.safe_to_proceed` is **always false** when
  present; it is a held marker, not a condition to test. A `reason` starting
  `record_unavailable:` is a transient read failure — retry rather than treating it as
  "no".

**3. Pattern B — react to decisions changing**

```
[Schedule Trigger] → [load cursor] → [MCP Client: list_decision_changes] → [process changes] → [save cursor]
```

- MCP Client → **Tool:** `list_decision_changes`, parameters:
  `{ "since": "{{ $json.cursor }}", "limit": 100 }`. On the first run omit `since` (returns
  a "from now" watermark). The feed output is under `structuredContent` — the changes are
  `{{ $json.structuredContent.changes }}`, and loop while `{{ $json.structuredContent.has_more }}`
  is true.
- Persist `cursor` between runs in workflow static data:
  ```js
  // before the MCP Client node
  const s = $getWorkflowStaticData('global');
  return [{ json: { cursor: s.mcpCursor ?? undefined } }];
  ```
  ```js
  // after processing, from the MCP Client node's output
  const s = $getWorkflowStaticData('global');
  s.mcpCursor = $input.first().json.structuredContent.cursor;
  return $input.all();
  ```

## Importable workflow

[`query_decision.workflow.json`](./query_decision.workflow.json) is a starter workflow for
Pattern A.

> **Provenance.** An earlier revision of this workflow was imported and executed in n8n
> (built-in **MCP Client** node, `@n8n/n8n-nodes-langchain.mcpClient` v1.1) against a live
> Rithmo MCP server, exercising the `found` and `no_record` branches. The branching has
> since been corrected to handle `found_record` and an **Extract answer** node was added,
> so re-run it in your own instance before relying on it. You create the **HTTP Bearer
> Auth** credential (holding your `rmcp_...` token) in your own n8n instance and select it
> on the node; credentials never travel in a workflow export.
