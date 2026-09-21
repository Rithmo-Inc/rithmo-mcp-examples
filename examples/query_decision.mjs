// query_decision — ask Rithmo what was decided about something, BEFORE you act on it.
//
// Run:  RITHMO_MCP_TOKEN=... node examples/query_decision.mjs "Are we still shipping onboarding?"
//
// Rithmo returns the current answer + owner + source + status, or an explicit "no_record"
// (see no_record.mjs). Read-only: Rithmo emits the record; your workflow acts on it.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const RITHMO_MCP_URL = process.env.RITHMO_MCP_URL ?? 'https://app.rithmo.ai/api/mcp';
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

// query_decision returns THREE variants: "found", "found_record", and "no_record".
// `found_record` is a real answer sourced from the subject record rather than the
// commitment ledger — do NOT lump it in with no_record.
if (answer.result === 'found') {
  console.log(`✓ found (confidence ${answer.confidence})`);
  console.log(`  answer: ${answer.answer}`);
  console.log(`  status: ${answer.status}`);
  console.log(`  owner:  ${answer.owner.state === 'owned' ? answer.owner.name ?? '(named, unresolved user)' : 'unowned'}`);
  console.log(
    `  source: ${answer.source.state === 'resolved' ? `${answer.source.system} · ${answer.source.ref}` : 'unresolved'}`,
  );
  console.log(`  decided_at: ${answer.decided_at}`);
  if (answer.rationale) console.log(`  rationale: ${answer.rationale}`);
  if (answer.conditions) console.log(`  conditions: ${answer.conditions}`);
  if (answer.director) console.log(`  director: ${answer.director}`);
  // supersedes is a newest-first linked list of the decisions this answer replaced.
  for (let prior = answer.supersedes, hop = 1; prior; prior = prior.supersedes, hop++) {
    console.log(`  supersedes[${hop}]: ${prior.answer}  (decided ${prior.decided_at})`);
  }
  if (answer.spine) {
    console.log(`  spine: ${answer.spine.lifecycle_state} · verified=${answer.spine.verified} · related=${answer.spine.related_count}`);
  }
} else if (answer.result === 'found_record') {
  // The answer lives on `subject.currentAnswer`, not `answer` — and it MAY BE NULL.
  // A null answer is NOT actionable: the subject is genuinely on record, but there is no
  // answer text to act on. Gate on a usable answer, never on the result value alone.
  const currentAnswer = answer.subject.currentAnswer;
  const usable = currentAnswer != null && String(currentAnswer).trim() !== '';
  console.log(`  subject: ${answer.subject.label}  [${answer.subject.state}]`);
  if (usable) {
    console.log('✓ found_record (from the subject record)');
    console.log(`  answer:  ${currentAnswer}`);
  } else {
    console.log('⏸ found_record, but NO ANSWER TEXT — hold.');
    console.log('  The subject is on record; its answer is not. Do not act on this.');
  }
  if (answer.observation?.claim) console.log(`  observation: ${answer.observation.claim}`);
} else {
  // no_record — may carry a typed refusal explaining WHY it is held.
  const held = answer.record;
  if (!held) {
    console.log('∅ no_record — Rithmo has no confident answer. Branch your workflow here.');
  } else if (held.status === 'closed') {
    console.log(`∅ no_record — held (closed · ${held.disposition})`);
    console.log(`  subject: ${held.subject.label}`);
  } else if (held.status === 'not_observed') {
    console.log(`∅ no_record — held (not_observed: ${held.unobserved_surfaces.join(', ')})`);
    console.log('  Rithmo does not observe that surface, so absence proves nothing.');
  } else {
    const transient = held.reason?.startsWith('record_unavailable:');
    console.log(`∅ no_record — held${transient ? ' (record_unavailable — transient; retry)' : ''}`);
    console.log(`  reason: ${held.reason}`);
  }
  // premise_check, when present, is ALWAYS safe_to_proceed: false. Never act on it.
  if (held?.premise_check) {
    console.log(`  safe_to_proceed: ${held.premise_check.safe_to_proceed}`);
    console.log(`  held_because: ${held.premise_check.held_because}`);
  }
}

await client.close();
