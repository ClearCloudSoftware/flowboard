/**
 * ReplayProvider — an AgentProvider that replays a scripted event stream.
 * Zero spend, deterministic. Use it to test the engine, runner, park/resume,
 * and cost rollups without touching a real CLI. It is the reference proof that
 * the port is implementable, and the fake-`claude` the backlog asks for.
 *
 * Run the self-check:  node docs/reference/adapters/agent/replay/replay-provider.ts
 */
import assert from 'node:assert/strict';
import type {
  AgentProvider,
  AgentRun,
  Capability,
  RunResult,
  RunSpec,
} from '../../../core/ports/agent-provider';
import type { NormalizedEvent, Usage } from '../../../core/ports/events';

export interface ReplayScript {
  events: NormalizedEvent[];
  sessionId?: string;
  pid?: number;
  /** Delay between events, to simulate streaming. 0 (default) = instant, for tests. */
  streamDelayMs?: number;
}

const ZERO_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, numTurns: 0 };
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ReplayProvider implements AgentProvider {
  readonly id = 'replay' as const;
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>([
    'sessions',
    'partial_stream',
    'native_cost',
  ]);

  private readonly script: ReplayScript;
  constructor(script: ReplayScript) {
    this.script = script;
  }

  /** Replay ignores the model; it echoes the logical id back. */
  resolveModel(logical: string): string {
    return logical;
  }

  launch(_spec: RunSpec): AgentRun {
    const { events, streamDelayMs = 0 } = this.script;

    const sessionId =
      this.script.sessionId ??
      events.find(
        (e): e is Extract<NormalizedEvent, { type: 'system' }> => e.type === 'system',
      )?.sessionId ??
      'replay-session';

    let stopped = false;
    let settle!: (r: RunResult) => void;
    const result = new Promise<RunResult>((r) => (settle = r));

    async function* stream(): AsyncGenerator<NormalizedEvent> {
      let usage: Usage = ZERO_USAGE;
      let outcome: 'pass' | 'fail' | undefined;
      for (const ev of events) {
        if (stopped) {
          settle({ usage, exitCode: 130, outcome, error: 'stopped' });
          return;
        }
        if (streamDelayMs) await delay(streamDelayMs);
        if (ev.type === 'result') {
          usage = ev.usage;
          outcome = ev.outcome;
        }
        yield ev;
      }
      settle({ usage, exitCode: 0, outcome });
    }

    return {
      sessionId: Promise.resolve(sessionId),
      pid: this.script.pid ?? -1,
      events: stream(),
      result,
      stop() {
        stopped = true;
      },
    };
  }
}

// --- self-check ------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const usage: Usage = { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, numTurns: 2, costUsd: 0.012 };
  const provider = new ReplayProvider({
    events: [
      { type: 'system', sessionId: 'abc-123' },
      { type: 'assistant_text', text: 'hello' },
      { type: 'result', usage, outcome: 'pass' },
    ],
  });

  const run = provider.launch({
    prompt: { preamble: '', inputs: [], outputs: [], closing: '' },
    model: 'default',
    cwd: '/tmp',
  });

  const seen: string[] = [];
  for await (const ev of run.events) seen.push(ev.type);

  assert.deepEqual(seen, ['system', 'assistant_text', 'result']);
  assert.equal(await run.sessionId, 'abc-123');

  const res = await run.result;
  assert.equal(res.exitCode, 0);
  assert.equal(res.outcome, 'pass');
  assert.equal(res.usage.costUsd, 0.012);

  console.log('ReplayProvider self-check passed');
}
