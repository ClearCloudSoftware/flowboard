/**
 * ClaudeCodeProvider — the AgentProvider for Claude Code, on the Claude Agent
 * SDK. The SDK still runs the installed `claude` CLI as a child process (PRD
 * §17 holds); this adapter spawns it through `RunSpec.exec` and authenticates
 * with the CLI's own login.
 *
 * See docs/FlowBoard/Agent Providers/Claude Code Adapter.md.
 */
import { EventEmitter, on } from 'node:events';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKMessage, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';
import { ZERO_USAGE } from '@flowboard/core';
import type { AgentProvider, AgentRun, Capability, NormalizedEvent, RunResult, RunSpec } from '@flowboard/core';
import { hostExecHost } from '../../exec/host.ts';
import { createNormalizer } from './normalize.ts';
import { buildQuery } from './options.ts';

export type QueryFn = (p: { prompt: string; options: Options }) => AsyncIterable<SDKMessage>;

export class ClaudeCodeProvider implements AgentProvider {
  readonly id = 'claude-code' as const;
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>([
    'effort',
    'sessions',
    'resume_fork',
    'mcp_tools',
    'plugins',
    'allowed_tools',
    'permission_modes',
    'native_cost',
    'partial_stream',
    'budget_cap',
    'tool_hooks',
  ]);

  private readonly claudePath: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly queryFn: QueryFn;

  constructor(opts: { claudePath?: string; env?: NodeJS.ProcessEnv; query?: QueryFn } = {}) {
    this.claudePath = opts.claudePath ?? 'claude';
    this.env = opts.env ?? process.env;
    this.queryFn = opts.query ?? query;
  }

  /** v1: logical ids are Claude aliases (Capability Library Decisions D20). */
  resolveModel(logical: string): string {
    return logical;
  }

  launch(spec: RunSpec): AgentRun {
    const abortController = new AbortController();
    const exec = spec.exec ?? hostExecHost;
    let stopped = false;

    // Created before the pump starts, so events emitted before the first read are buffered.
    const emitter = new EventEmitter();
    const queue = on(emitter, 'event', { close: ['end'] });

    let resolvePid!: (pid: number) => void;
    const pid = new Promise<number>((r) => (resolvePid = r));
    let resolveSession!: (id: string) => void;
    let rejectSession!: (e: Error) => void;
    const sessionId = new Promise<string>((res, rej) => {
      resolveSession = res;
      rejectSession = rej;
    });
    sessionId.catch(() => {}); // a caller that never awaits it must not see an unhandled rejection

    let exited: Promise<number> | undefined;
    let stderrTail = '';
    const spawnClaudeCodeProcess = (o: SpawnOptions) => {
      const child = exec.spawn(o.command, o.args, { cwd: o.cwd ?? spec.cwd, env: o.env });
      resolvePid(child.pid ?? -1);
      exited = new Promise((r) => {
        child.once('exit', (code) => r(code ?? 1));
        child.once('error', () => r(127));
      });
      child.stderr.on('data', (d) => (stderrTail = (stderrTail + d).slice(-4000))); // also drains the pipe
      o.signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true });
      return child;
    };

    const requested = (spec.capabilities ?? []).flatMap((p) =>
      p.mount.kind === 'plugin_dir' ? [path.resolve(p.mount.path)] : [],
    );
    const { prompt, options } = buildQuery(
      { ...spec, model: this.resolveModel(spec.model) },
      { claudePath: this.claudePath, env: this.env, abortController, spawnClaudeCodeProcess },
    );

    const pump = async (): Promise<RunResult> => {
      const normalize = createNormalizer();
      let usage = ZERO_USAGE;
      let error: string | undefined;
      let finished = false; // the result arrived: a later stop() does not relabel the run
      let thrown = false;
      const emit = (ev: NormalizedEvent) => {
        if (ev.type === 'system' && ev.sessionId) resolveSession(ev.sessionId);
        if (ev.type === 'result') {
          usage = ev.usage;
          finished = true;
        }
        if (ev.type === 'error') error ??= ev.message;
        emitter.emit('event', ev);
      };

      try {
        for await (const msg of this.queryFn({ prompt, options })) {
          normalize(msg).forEach(emit);
          if (msg.type === 'system' && msg.subtype === 'init') {
            // The CLI skips a missing plugin dir silently; a run without its skill must fail loudly.
            const loaded = new Set(msg.plugins.map((p) => path.resolve(p.path)));
            const missing = requested.find((p) => !loaded.has(p));
            if (missing) {
              emit({ type: 'error', message: `plugin not loaded: ${missing}`, raw: msg });
              abortController.abort();
              break;
            }
          }
        }
      } catch (e) {
        thrown = true;
        // query() throws after yielding an error result; that result already said why.
        if (error === undefined && !stopped) emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      } finally {
        emitter.emit('end');
      }

      resolvePid(-1);
      rejectSession(new Error(error ?? 'run ended without a session id'));
      const code = exited ? await exited : error ? 1 : 0;
      if (stopped && !finished) return { usage, exitCode: 130, error: 'stopped' };
      // After the result, a stop()'s SIGTERM is ours, not a failure: the result decides.
      const exitCode = stopped ? (error ? 1 : 0) : code;
      // With a custom spawn the SDK never sees stderr, so its exit error says only the code; read once the child is gone.
      if (thrown && error && stderrTail.trim()) error = `${error}\n${stderrTail.trim()}`;
      return { usage, exitCode, error: error ?? (exitCode !== 0 ? stderrTail || `exit code ${exitCode}` : undefined) };
    };

    return {
      sessionId,
      pid,
      events: (async function* () {
        for await (const [ev] of queue) yield ev as NormalizedEvent;
      })(),
      result: pump(),
      stop() {
        stopped = true;
        abortController.abort();
      },
    };
  }
}
