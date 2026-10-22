/**
 * ReplayProvider — an AgentProvider that replays a scripted event stream.
 * Zero spend, deterministic. Use it to test the engine, runner, park/resume,
 * and cost rollups without touching a real CLI.
 *
 * See docs/FlowBoard/Agent Providers/Replay Provider.md.
 */
import { ZERO_USAGE } from '@flowboard/core';
import type { AgentProvider, AgentRun, Capability, NormalizedEvent, RunResult, RunSpec, Usage } from '@flowboard/core';

export interface ReplayScript {
  events: NormalizedEvent[];
  sessionId?: string;
  pid?: number;
  /** Delay between events, to simulate streaming. 0 (default) = instant, for tests. */
  streamDelayMs?: number;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ReplayProvider implements AgentProvider {
  readonly id = 'replay' as const;
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(['sessions', 'partial_stream', 'native_cost']);

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

    const id =
      this.script.sessionId ??
      events.find((e): e is Extract<NormalizedEvent, { type: 'system' }> => e.type === 'system')?.sessionId;
    // Like a real provider: no session id, no session.
    const sessionId = id === undefined ? Promise.reject(new Error('run ended without a session id')) : Promise.resolve(id);
    sessionId.catch(() => {});

    let stopped = false;
    let settle!: (r: RunResult) => void;
    const result = new Promise<RunResult>((r) => (settle = r));

    // ponytail: like the reference, `result` settles only while `events` is being read. Fine for a test double.
    async function* stream(): AsyncGenerator<NormalizedEvent> {
      let usage: Usage = ZERO_USAGE;
      let outcome: 'pass' | 'fail' | undefined;
      let error: string | undefined;
      for (const ev of events) {
        if (stopped) {
          settle({ usage, exitCode: 130, outcome, error: 'stopped' });
          return;
        }
        if (streamDelayMs) await delay(streamDelayMs);
        if (ev.type === 'usage') usage = ev.usage;
        if (ev.type === 'result') {
          usage = ev.usage;
          outcome = ev.outcome;
        }
        // A scripted error fails the run, as the first error does on a real provider.
        if (ev.type === 'error') error ??= ev.message;
        yield ev;
      }
      settle({ usage, exitCode: error ? 1 : 0, outcome, error });
    }

    return {
      sessionId: Promise.resolve(sessionId),
      pid: Promise.resolve(this.script.pid ?? -1),
      events: stream(),
      result,
      stop() {
        stopped = true;
      },
    };
  }
}
