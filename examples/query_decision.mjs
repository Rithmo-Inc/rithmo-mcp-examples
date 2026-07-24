// query_decision — ask Rithmo what was decided about something, BEFORE you act on it.
//
// Run:  RITHMO_MCP_TOKEN=... node examples/query_decision.mjs "Are we still shipping onboarding?"
//
// Rithmo returns the current answer + owner + source + status, or an explicit "no_record"
// (see no_record.mjs). Read-only: Rithmo emits the record; your workflow acts on it.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const RITHMO_MCP_URL = process.env.RITHMO_MCP_URL ?? 'https://mcp.rithmo.ai/api/mcp';
const RITHMO_MCP_TOKEN = process.env.RITHMO_MCP_TOKEN;
if (!RITHMO_MCP_TOKEN) throw new Error('Set RITHMO_MCP_TOKEN (a Rithmo MCP service token).');

const question = process.argv[2] ?? 'What did we decide about the product roadmap?';

const transport = new StreamableHTTPClientTransport(new URL(RITHMO_MCP_URL), {
  requestInit: { headers: { Authorization: `Bearer ${RITHMO_MCP_TOKEN}` } },
});
const client = new Client({ name: 'rithmo-example', version: '1.0.0' });
await client.connect(transport);

const res = await client.callTool({ name: 'query_decision', arguments: { question } });
const answer = res.structuredContent;

console.log(`\nQ: ${question}`);
if (answer.result === 'found') {
  console.log(`✓ found (confidence ${answer.confidence})`);
  console.log(`  answer: ${answer.answer}`);
  console.log(`  status: ${answer.status}`);
  console.log(`  owner:  ${answer.owner.state === 'owned' ? answer.owner.name ?? '(named, unresolved user)' : 'unowned'}`);
  console.log(
    `  source: ${answer.source.state === 'resolved' ? `${answer.source.system} · ${answer.source.ref}` : 'unresolved'}`,
  );
  console.log(`  decided_at: ${answer.decided_at}`);
} else {
  console.log('∅ no_record — Rithmo has no confident answer. Branch your workflow here.');
}

await client.close();
