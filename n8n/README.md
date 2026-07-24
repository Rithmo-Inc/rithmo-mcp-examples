# Rithmo × n8n

Query Rithmo's decision record from an n8n workflow — before an execution step — and
branch on the answer.

Use n8n's built-in **MCP Client** node (`n8n-nodes-langchain.mcpclient`). It calls a named
MCP tool deterministically as a normal workflow step (no AI Agent / no LLM in the loop).

## Manual setup (the reliable path)

**1. Connection** — in the MCP Client node:

| Field | Value |
|---|---|
| MCP Endpoint URL | your Rithmo MCP URL, e.g. `https://mcp.rithmo.ai/api/mcp` |
| Server Transport | **HTTP Streamable** |
| Authentication | **Bearer Token** → your `rmcp_...` service token |

Store the token in an n8n **credential**, not inline. The node's tool list should show
`whoami`, `query_decision`, `list_decision_changes`.

**2. Pattern A — look up a decision before acting**

```
[trigger] → [MCP Client: query_decision] → [IF result == "found"] ─true→  [proceed]
                                                                   └false→ [handle no_record]
```

- MCP Client → **Tool:** `query_decision`, **Input Mode:** JSON,
  parameters: `{ "question": "{{ $json.question }}" }` (optional `type`, `owner`, `area`).
- IF node → condition: `{{ $json.result }}` **equals** `found`.
- `found` branch: use `answer`, `status`, `owner`, `source`. `no_record` branch: pause,
  route to a human, or use a safe default.

**3. Pattern B — react to decisions changing**

```
[Schedule Trigger] → [load cursor] → [MCP Client: list_decision_changes] → [process changes] → [save cursor]
```

- MCP Client → **Tool:** `list_decision_changes`, parameters:
  `{ "since": "{{ $json.cursor }}", "limit": 100 }`. On the first run omit `since` (returns
  a "from now" watermark). Loop while `has_more` is true.
- Persist `cursor` between runs in workflow static data:
  ```js
  // before the MCP Client node
  const s = $getWorkflowStaticData('global');
  return [{ json: { cursor: s.mcpCursor ?? undefined } }];
  ```
  ```js
  // after processing, from the MCP Client node's output
  const s = $getWorkflowStaticData('global');
  s.mcpCursor = $input.first().json.cursor;
  return $input.all();
  ```

## Importable workflow

[`query_decision.workflow.json`](./query_decision.workflow.json) is a starter workflow for
Pattern A.

> ⚠️ **Verify on import.** This JSON is a convenience template. The MCP Client node's exact
> parameter names/versions vary between n8n releases, and the auth credential must be
> created in your own instance. If anything looks off after import, follow the manual setup
> above — that's the source of truth. (This template has not yet been round-tripped through
> a live n8n import; do that before relying on it.)
