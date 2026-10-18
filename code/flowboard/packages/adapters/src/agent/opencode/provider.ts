/**
 * OpencodeProvider — the AgentProvider for OpenCode, on @opencode-ai/sdk/v2.
 * Each run gets its own `opencode serve` (spawned through `RunSpec.exec`) with
 * a per-run password and config, so runs never share state. OpenCode uses
 * its own credentials (XDG_DATA_HOME/opencode/auth.json).
 *
 * See docs/FlowBoard/Agent Providers/OpenCode Adapter.md.
 */
import { randomBytes } from 'node:crypto';
import { EventEmitter, on } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpencodeClient } from '@opencode-ai/sdk/v2';
import type { Event } from '@opencode-ai/sdk/v2';
import { ZERO_USAGE } from '@flowboard/core';
import type { AgentProvider, AgentRun, Capability, NormalizedEvent, RunResult, RunSpec } from '@flowboard/core';
import { hostExecHost } from '../../exec/host.ts';
import { createNormalizer } from './normalize.ts';
import { buildLaunch, pickVariant } from './options.ts';
import { replyFor } from './permissions.ts';
import { ServerStartError, startServer } from './server.ts';
import type { StartedServer } from './server.ts';

const GUARD_PLUGIN = fileURLToPath(new URL('./guard-plugin.ts', import.meta.url));

export class OpencodeProvider implements AgentProvider {
  readonly id = 'opencode' as const;
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

  private readonly models: Record<string, string>;
  private readonly opencodePath: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(opts: { models: Record<string, string>; opencodePath?: string; env?: NodeJS.ProcessEnv }) {
    this.models = opts.models;
    this.opencodePath = opts.opencodePath ?? 'opencode';
    this.env = opts.env ?? process.env;
  }

  /** Logical id -> "providerID/modelID". An id that already names a provider passes through. */
  resolveModel(logical: string): string {
    const id = this.models[logical] ?? (logical.includes('/') ? logical : undefined);
    if (!id) throw new Error(`no OpenCode model for logical id '${logical}'`);
    return id;
  }

  launch(spec: RunSpec): AgentRun {
    const directory = spec.cwd;
    const emitter = new EventEmitter();
    const queue = on(emitter, 'event', { close: ['end'] }); // buffers until the first read

    let resolvePid!: (pid: number) => void;
    const pid = new Promise<number>((r) => (resolvePid = r));
    let resolveSession!: (id: string) => void;
    let rejectSession!: (e: Error) => void;
    const sessionId = new Promise<string>((res, rej) => {
      resolveSession = res;
      rejectSession = rej;
    });
    sessionId.catch(() => {});

    const streamAbort = new AbortController();
    let client: ReturnType<typeof createOpencodeClient> | undefined;
    let sessionID: string | undefined;
    let finished = false; // the result arrived
    let stopped = false; // stop() came before the result
    const STOP = new Error('stopped');
    const live = <T>(p: Promise<T>) =>
      p.then((v) => {
        if (stopped) throw STOP;
        return v;
      });
    // throwOnError makes failures throw, but the SDK still types `data` as optional.
    const ok = <T>(p: Promise<{ data?: T }>) =>
      live(p).then((r) => {
        if (r.data === undefined) throw new Error('empty response from the opencode server');
        return r.data;
      });

    const pump = async (): Promise<RunResult> => {
      let usage = ZERO_USAGE;
      let error: string | undefined;
      let exitCode: number | undefined;
      let configHome: string | undefined;
      let server: StartedServer | undefined;
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
        const model = this.resolveModel(spec.model);
        configHome = await mkdtemp(join(tmpdir(), 'fb-oc-'));
        const password = randomBytes(24).toString('hex');
        const run = buildLaunch({ ...spec, model }, { env: this.env, configHome, password, guardPlugin: GUARD_PLUGIN });

        server = await live(startServer(spec.exec ?? hostExecHost, { opencodePath: this.opencodePath, cwd: directory, env: run.env }));
        resolvePid(server.child.pid ?? -1);
        server.child.once('close', () => streamAbort.abort()); // a dead server ends the event stream
        client = createOpencodeClient({
          baseUrl: server.url,
          directory,
          throwOnError: true,
          headers: { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` },
        });

        const { providers } = await ok(client.config.providers());
        const { providerID, modelID } = run.prompt.model;
        const variants = Object.keys(providers.find((p) => p.id === providerID)?.models[modelID]?.variants ?? {});

        // The SSE stream connects on first read; wait for server.connected so no event is missed.
        const { stream } = await client.event.subscribe({ directory }, { signal: streamAbort.signal, sseMaxRetryAttempts: 1 });
        const events = stream[Symbol.asyncIterator]();
        await live(events.next());

        const session = spec.resume?.fork
          ? await ok(client.session.fork({ sessionID: spec.resume.sessionId, directory }))
          : spec.resume
            ? { id: spec.resume.sessionId }
            : await ok(client.session.create({ directory, permission: run.permission }));
        // A fork drops the session's permission rules, and a resumed session keeps the old run's.
        if (spec.resume) await live(client.session.update({ sessionID: session.id, directory, permission: run.permission }));
        sessionID = session.id;
        emit({ type: 'system', sessionId: session.id, raw: session });

        const normalize = createNormalizer(session.id);
        const cap = spec.limits?.maxBudgetUsd;
        await live(
          client.session.promptAsync({
            sessionID,
            directory,
            ...run.prompt,
            variant: pickVariant(spec.effort, variants),
            agent: 'build',
          }),
        );

        for (let r = await events.next(); !r.done; r = await events.next()) {
          const event = r.value as Event;
          // One server per run: every permission request is this run's, and an unanswered one hangs it.
          if (event.type === 'permission.asked') {
            await client.permission.reply({
              requestID: event.properties.id,
              directory,
              ...replyFor(spec.permissionMode, event.properties.permission),
            });
          }
          for (const ev of normalize(event)) {
            emit(ev);
            if (ev.type === 'usage' && cap !== undefined && (ev.usage.costUsd ?? 0) >= cap && error === undefined) {
              emit({ type: 'error', message: `max_budget: spent $${ev.usage.costUsd!.toFixed(2)} of $${cap.toFixed(2)}` });
              await client.session.abort({ sessionID, directory });
            }
          }
          if (finished) break;
        }
        if (!finished && !stopped && error === undefined) {
          emit({ type: 'error', message: `opencode server ended the run early: ${server.stderrTail().trim()}` });
        }
      } catch (e) {
        if (!stopped) {
          if (e instanceof ServerStartError) exitCode = e.exitCode;
          if (error === undefined) emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      } finally {
        emitter.emit('end');
        streamAbort.abort();
        if (server && server.child.exitCode === null && server.child.signalCode === null) {
          const closed = new Promise((r) => server!.child.once('close', r));
          server.child.kill('SIGTERM');
          await closed;
        }
        if (configHome) await rm(configHome, { recursive: true, force: true });
      }

      resolvePid(-1);
      rejectSession(new Error(error ?? 'run ended without a session id'));
      if (stopped) return { usage, exitCode: 130, error: 'stopped' };
      return { usage, exitCode: exitCode ?? (error ? 1 : 0), error };
    };

    return {
      sessionId,
      pid,
      events: (async function* () {
        for await (const [ev] of queue) yield ev as NormalizedEvent;
      })(),
      result: pump(),
      stop() {
        if (finished) return;
        stopped = true;
        const end = () => streamAbort.abort();
        if (client && sessionID) client.session.abort({ sessionID, directory }).then(end, end);
        else end();
      },
    };
  }
}
