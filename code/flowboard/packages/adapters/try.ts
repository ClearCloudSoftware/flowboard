/**
 * Manual driver: launch one provider run in a scratch folder and print its events.
 *
 *   node packages/adapters/try.ts [claude|opencode] ["prompt"]
 *
 * Env knobs:
 *   MODE=bypassPermissions   permission mode (default acceptEdits)
 *   BUDGET=0.0001            maxBudgetUsd (default 0.5)
 *   RESUME=<sessionId>       fork a previous session
 *   SKILL=1                  mount test/fixtures/fbecho-plugin and invoke /fbecho:echo
 *   RAW=1                    print the native system message (isolation check)
 *   CWD=/some/dir            run there instead of a fresh temp folder
 *   FLOWBOARD_OPENCODE_MODEL providerID/modelID for opencode (default DeepSeek V4.1 Flash on OpenRouter)
 *
 * Ctrl+C calls run.stop(). Claude uses your subscription quota; OpenCode costs OpenRouter credit.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PermissionMode, RunSpec } from '@flowboard/core';
import { ClaudeCodeProvider, OpencodeProvider } from './src/index.ts';

const [which = 'claude', prompt = 'List the files here, then create notes.md saying hello.'] = process.argv.slice(2);
const opencode = which === 'opencode';
const cwd = process.env.CWD ?? mkdtempSync(join(tmpdir(), 'fb-try-'));
const plugin = fileURLToPath(new URL('./test/fixtures/fbecho-plugin', import.meta.url));

const provider = opencode
  ? new OpencodeProvider({
      models: { default: process.env.FLOWBOARD_OPENCODE_MODEL ?? 'openrouter/deepseek/deepseek-v4.1-flash' },
    })
  : new ClaudeCodeProvider();

const spec: RunSpec = {
  prompt: {
    preamble: process.env.SKILL ? '' : prompt,
    inputs: [],
    outputs: [],
    invocation: process.env.SKILL ? '/fbecho:echo' : undefined,
    closing: 'This is a headless run; do not ask questions.',
  },
  model: opencode ? 'default' : 'haiku',
  cwd,
  permissionMode: (process.env.MODE as PermissionMode | undefined) ?? 'acceptEdits',
  guards: { writeRoots: [cwd] },
  limits: { maxTurns: 6, maxBudgetUsd: Number(process.env.BUDGET ?? 0.5) },
  capabilities: process.env.SKILL
    ? [{ id: 'fbecho', provider: provider.id, mount: { kind: 'plugin_dir', path: plugin } }]
    : undefined,
  resume: process.env.RESUME ? { sessionId: process.env.RESUME, fork: true } : undefined,
};

const run = provider.launch(spec);
process.on('SIGINT', () => {
  console.log('\n-- stopping');
  run.stop();
});

console.log(`-- ${provider.id} in ${cwd}`);
run.pid.then((pid) => console.log(`-- pid ${pid}`));
for await (const { raw, ...ev } of run.events) {
  console.log(ev.type.padEnd(14), JSON.stringify(ev).slice(0, 160));
  if (ev.type === 'system' && process.env.RAW) console.dir(raw, { depth: 2 });
}
console.log('-- result', await run.result);
