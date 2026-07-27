// list_source_systems — enumerate which data-ingestion connections are REALLY live.
//
// There's no "list connectors" tool. The ground truth for what's wired up is which
// `source.system` values actually appear on real decision records. This backfills the
// full change feed (since "0_") and tallies the distinct source systems it observes —
// so you can compare, e.g., a dev environment vs. main/production.
//
// Run against ONE environment at a time:
//   RITHMO_MCP_URL=<dev-url>  RITHMO_MCP_TOKEN=<dev-token>  node examples/list_source_systems.mjs
//   RITHMO_MCP_URL=<main-url> RITHMO_MCP_TOKEN=<main-token> node examples/list_source_systems.mjs
//
// Read-only. It only drains list_decision_changes; it never writes anything.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const RITHMO_MCP_URL = process.env.RITHMO_MCP_URL ?? 'https://mcp.rithmo.ai/api/mcp';
const RITHMO_MCP_TOKEN = process.env.RITHMO_MCP_TOKEN;
if (!RITHMO_MCP_TOKEN) throw new Error('Set RITHMO_MCP_TOKEN (a Rithmo MCP service token).');

const transport = new StreamableHTTPClientTransport(new URL(RITHMO_MCP_URL), {
  requestInit: { headers: { Authorization: `Bearer ${RITHMO_MCP_TOKEN}` } },
});
const client = new Client({ name: 'rithmo-example', version: '1.0.0' });
await client.connect(transport);

// Confirm which org/environment this token resolves to.
let who = null;
try {
  who = (await client.callTool({ name: 'whoami', arguments: {} })).structuredContent;
} catch { /* whoami optional */ }

// Backfill the whole record from the start and tally source systems.
const systems = new Map();        // system -> count of resolved records
let unresolved = 0;               // records whose source is not resolved
let total = 0;
let cursor = '0_';                // "0_" = backfill from the beginning
let pages = 0;

for (;;) {
  const { changes, cursor: next, has_more } = (
    await client.callTool({ name: 'list_decision_changes', arguments: { since: cursor, limit: 200 } })
  ).structuredContent;

  for (const ch of changes) {
    total++;
    if (ch.source?.state === 'resolved' && ch.source.system) {
      systems.set(ch.source.system, (systems.get(ch.source.system) ?? 0) + 1);
    } else {
      unresolved++;
    }
  }
  pages++;
  cursor = next;
  if (!has_more) break;
}

const env = new URL(RITHMO_MCP_URL).host;
console.log(`\nEnvironment: ${env}`);
if (who) console.log(`Org: ${who.org_id}   scopes: ${(who.scopes ?? []).join(', ')}`);
console.log(`Scanned ${total} decision records across ${pages} page(s).\n`);
console.log('Live ingestion connections (by source.system):');
const ranked = [...systems.entries()].sort((a, b) => b[1] - a[1]);
if (ranked.length === 0) {
  console.log('  (none observed)');
} else {
  for (const [system, count] of ranked) console.log(`  ${system.padEnd(16)} ${count}`);
}
if (unresolved) console.log(`  ${'(unresolved)'.padEnd(16)} ${unresolved}`);

await client.close();
