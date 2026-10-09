/**
 * Dump the FULL input schema for each MCP tool so we use real action names
 * and required args instead of guessing from the one-line description.
 *
 * Usage: node scripts/dump-skill-hub-schemas.mjs [toolName]
 */

import { SkillHubClient } from '../dist/skill-hub-client.js';

const only = process.argv[2];
const client = new SkillHubClient();

// Reuse the client's transport but ask for the raw tool definitions.
const status = await client.status();
if (!status.reachable) {
  console.log('MCP unreachable:', status.error);
  process.exit(1);
}

const res = await client.callTool('__nonexistent__', {}).catch(() => null);

// tools/list is the only way to see schemas; call it directly.
const RAW = await (async () => {
  const c = new SkillHubClient();
  await c.connect();
  // Access the private transport via a tools/list round trip through callTool
  // is not possible, so re-run the same rpc the client uses internally.
  return null;
})();

console.log('Use the client directly:\n');

async function listTools(client) {
  // The client exposes only connect(); replicate its rpc for tools/list.
  const url = process.env.BITGET_MCP_URL || 'https://datahub.noxiaohao.com/mcp';
  const init = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agentflow-infra', version: '1.0.0' },
      },
    }),
  });
  const sid = init.headers.get('mcp-session-id');
  await init.text();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'Mcp-Session-Id': sid,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  });
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  return JSON.parse(line.slice(5)).result.tools;
}

const tools = await listTools(client);

for (const t of tools) {
  if (only && t.name !== only) continue;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TOOL: ${t.name}`);
  console.log(`${'='.repeat(70)}`);
  console.log(t.description);
  console.log('\nSchema:');
  console.log(JSON.stringify(t.inputSchema, null, 2));
}
console.log('');
