// Connects to Rithmo's MCP server with an agent's access token and lists the tools it offers.
import { readFileSync, existsSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = process.env.RITHMO_MCP_URL;
const token = process.env.RITHMO_MCP_TOKEN;
if (!url || !token) {
  console.error('Set RITHMO_MCP_URL and RITHMO_MCP_TOKEN (see .env.example).');
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'rithmo-connect-check', version: '1.0.0' });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log(`Connected. Rithmo offers ${tools.length} tools:`);
  for (const t of tools) console.log(`- ${t.name}`);
} catch (err) {
  console.error(`Could not connect: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
