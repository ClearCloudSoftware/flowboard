/**
 * Records one real OpenCode event stream as JSONL, for the normalizer tests:
 *   FLOWBOARD_OPENCODE_MODEL=<providerID/modelID> node capture-opencode.ts > opencode-read.jsonl
 */
// Re-run to refresh the fixture when OpenCode's event shapes change; costs a few cents.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpencode } from '@opencode-ai/sdk/v2';

const id = process.env.FLOWBOARD_OPENCODE_MODEL;
if (!id) {
  console.error('Set FLOWBOARD_OPENCODE_MODEL to a providerID/modelID, e.g. openrouter/deepseek/deepseek-v4.1-flash');
  process.exit(1);
}
const slash = id.indexOf('/');
const model = { providerID: id.slice(0, slash), modelID: id.slice(slash + 1) };

const directory = mkdtempSync(join(tmpdir(), 'fb-oc-capture-'));
writeFileSync(join(directory, 'hello.txt'), 'fixture-ok\n');

const { client, server } = await createOpencode({ hostname: '127.0.0.1', port: 0, config: { permission: 'allow' } });
try {
  const session = (await client.session.create({ directory })).data!;
  const { stream } = await client.event.subscribe({ directory });
  await client.session.promptAsync({
    sessionID: session.id,
    directory,
    model,
    parts: [{ type: 'text', text: 'Read hello.txt and reply with its exact contents.' }],
  });
  for await (const event of stream) {
    console.log(JSON.stringify(event));
    if (event.type === 'session.idle' && event.properties.sessionID === session.id) break;
  }
} finally {
  server.close();
}
