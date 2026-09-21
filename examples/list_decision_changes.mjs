// list_decision_changes — drain Rithmo's decision change-feed.
//
// Run:  RITHMO_MCP_TOKEN=... node examples/list_decision_changes.mjs [cursor]
//
// Poll this on a schedule. The FIRST call (no cursor) returns an empty set + a "from now"
// watermark cursor, so you don't replay history. Pass the returned cursor next time to get
// changes since then. Pass "0_" once to backfill from the beginning. Includes reversals
// (a decision going dropped/superseded is a change). Rithmo never pushes — you pull.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const RITHMO_MCP_URL = process.env.RITHMO_MCP_URL ?? 'https://app.rithmo.ai/api/mcp';
const RITHMO_MCP_TOKEN = process.env.RITHMO_MCP_TOKEN;
if (!RITHMO_MCP_TOKEN) throw new Error('Set RITHMO_MCP_TOKEN (a Rithmo MCP service token).');

const since = process.argv[2]; // omit for "from now"; pass "0_" to backfill from the start

const transport = new StreamableHTTPClientTransport(new URL(RITHMO_MCP_URL), {
  requestInit: { headers: { Authorization: `Bearer ${RITHMO_MCP_TOKEN}` } },
});
const client = new Client({ name: 'rithmo-example', version: '1.0.0' });
await client.connect(transport);

const res = await client.callTool({
  name: 'list_decision_changes',
  arguments: since ? { since, limit: 20 } : { limit: 20 },
});
const feed = res.structuredContent;

console.log(`\nchanges: ${feed.changes.length}   has_more: ${feed.has_more}`);
console.log(`next cursor: ${feed.cursor}   ← pass this as the argument on the next poll`);
for (const ch of feed.changes) {
  // `status` is WIDER here than in query_decision's `found`: reversals are changes too,
  // so dropped/superseded appear in this feed and must be handled explicitly.
  const reversal = ch.status === 'dropped' || ch.status === 'superseded';
  console.log(`  [${ch.status}]${reversal ? ' ⟲ reversal' : ''} ${ch.answer}  (changed ${ch.changed_at})`);
  if (ch.rationale) console.log(`      rationale: ${ch.rationale}`);
  if (ch.conditions) console.log(`      conditions: ${ch.conditions}`);
}

// has_more is simply "the page was full", so an exactly-full final page means one more
// call returns zero changes. That is how the drain terminates, not an error. When a page
// returns no rows the cursor is echoed back unchanged, so re-polling is idempotent.
if (feed.has_more) console.log('\nhas_more=true — call again with the cursor above to drain the rest.');

await client.close();
