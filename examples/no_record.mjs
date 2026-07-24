// no_record — the behavior nobody expects, and the whole point of a system of record.
//
// Run:  RITHMO_MCP_TOKEN=... node examples/no_record.mjs
//
// Ask about something that was never decided. Rithmo returns "no_record" instead of
// inventing an answer. Your automation branches on this — pause and ask a human rather
// than acting on a guess. A false "yes" from a decision source is far more expensive
// than a blocked workflow.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const RITHMO_MCP_URL = process.env.RITHMO_MCP_URL ?? 'https://mcp.rithmo.ai/api/mcp';
const RITHMO_MCP_TOKEN = process.env.RITHMO_MCP_TOKEN;
if (!RITHMO_MCP_TOKEN) throw new Error('Set RITHMO_MCP_TOKEN (a Rithmo MCP service token).');

const question = process.argv[2] ?? 'Did we decide anything about office snacks?';

const transport = new StreamableHTTPClientTransport(new URL(RITHMO_MCP_URL), {
  requestInit: { headers: { Authorization: `Bearer ${RITHMO_MCP_TOKEN}` } },
});
const client = new Client({ name: 'rithmo-example', version: '1.0.0' });
await client.connect(transport);

const res = await client.callTool({ name: 'query_decision', arguments: { question } });
const answer = res.structuredContent;

console.log(`\nQ: ${question}`);
if (answer.result === 'no_record') {
  console.log('∅ no_record — Rithmo will not fabricate a decision.');
  console.log('   Branch here: pause the automation, route to a human, or use a safe default.');
} else {
  console.log(`✓ found (unexpectedly): ${answer.answer}`);
}

await client.close();
