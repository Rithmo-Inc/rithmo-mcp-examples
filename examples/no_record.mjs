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

const RITHMO_MCP_URL = process.env.RITHMO_MCP_URL ?? 'https://app.rithmo.ai/api/mcp';
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

  // A no_record may carry a TYPED REFUSAL explaining why the answer is held.
  const held = answer.record;
  if (held) {
    if (held.status === 'closed') {
      console.log(`   typed refusal: closed · ${held.disposition} (subject: ${held.subject.label})`);
    } else if (held.status === 'not_observed') {
      console.log(`   typed refusal: not_observed — ${held.unobserved_surfaces.join(', ')}`);
      console.log('   Rithmo does not observe that surface. Absence there is UNKNOWN, not "no".');
    } else {
      console.log(`   typed refusal: no_record — ${held.reason}`);
      if (held.reason?.startsWith('record_unavailable:')) {
        console.log('   This is a TRANSIENT read failure, not "we decided no". Hold and retry.');
      }
    }
    // Always false when present. It marks the premise as held, and says why.
    console.log(`   safe_to_proceed: ${held.premise_check.safe_to_proceed}`);
    console.log(`   held_because: ${held.premise_check.held_because}`);
  }
} else if (answer.result === 'found_record') {
  // Even here, a null currentAnswer is a hold — the subject is on record, its answer is not.
  const currentAnswer = answer.subject.currentAnswer;
  if (currentAnswer != null && String(currentAnswer).trim() !== '') {
    console.log(`✓ found_record (unexpectedly): ${currentAnswer}`);
  } else {
    console.log('⏸ found_record with no answer text — still a hold, not an answer.');
  }
} else {
  console.log(`✓ found (unexpectedly): ${answer.answer}`);
}

await client.close();
