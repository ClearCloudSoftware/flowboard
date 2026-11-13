/**
 * The repo analyst's proposal (`internal/repo-analyst/SKILL.md` §3): its stack, its check command and the network
 * hosts its sandbox must reach. The agent read an untrusted repo, so its file is read as untrusted input: only the
 * skill's shape, one-line commands, plain host names, and short lists. No Node imports: the pages use this;
 * `analysis-run.ts` reads it from a run.
 */
import { z } from 'zod';

export type Level = 'high' | 'medium' | 'low';
export interface ProposedHost { host: string; evidence: string[]; custom: boolean }
/** A null value: the analyst found nothing to go on, and says why in `notes`. */
export interface Proposal {
  stack: string[] | null;
  checkCommand: string | null;
  networkHosts: ProposedHost[] | null;
  evidence: { stack: string[]; checkCommand: string[] };
  confidence: { stack?: Level; checkCommand?: Level; networkHosts?: Level };
  notes: string;
}

/**
 * An analysis as the pages show it: `running` while its run goes; `done` with the proposal; `failed` or `paused`
 * with why. `spentUsd`: what the run has cost.
 */
export interface AnalysisView { run: string; status: 'running' | 'done' | 'failed' | 'paused'; spentUsd: number; error?: string; proposal?: Proposal }

/** A DNS name: letters, digits and hyphens in dotted labels; no scheme, path or port. */
export const HOST = /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;
export const MAX_HOSTS = 20;

const level = z.enum(['high', 'medium', 'low']).optional();
const evidence = z.array(z.string().max(300)).max(20).default([]);
const Shape = z.object({
  stack: z.object({ value: z.array(z.string().min(1).max(40)).max(12).nullable(), evidence, confidence: level }),
  check_command: z.object({
    value: z.string().min(1).max(500).regex(/^[^\r\n]+$/, { error: 'one line' }).nullable(),
    evidence,
    confidence: level,
  }),
  network_hosts: z.object({
    value: z.array(z.object({ host: z.string().regex(HOST, { error: 'a host name, with no scheme, path or port' }), evidence, custom: z.boolean().default(false) })).max(MAX_HOSTS).nullable(),
    confidence: level,
  }),
  notes: z.string().default(''),
});

const WRONG = 'the proposal is not in the shape the analyst writes: ';

/** The analyst's file, read: its JSON object (a ```json fence around it is allowed), or why it is refused. */
export function parseProposal(text: string): { ok: true; proposal: Proposal } | { ok: false; error: string } {
  const body = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/, '$1');
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { ok: false, error: `${WRONG}not JSON` };
  }
  const r = Shape.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, error: `${WRONG}${i.path.join('.') || 'the file'}: ${i.message}` };
  }
  const p = r.data;
  return {
    ok: true,
    proposal: {
      stack: p.stack.value,
      checkCommand: p.check_command.value,
      networkHosts: p.network_hosts.value,
      evidence: { stack: p.stack.evidence, checkCommand: p.check_command.evidence },
      confidence: { stack: p.stack.confidence, checkCommand: p.check_command.confidence, networkHosts: p.network_hosts.confidence },
      notes: p.notes.slice(0, 1000),
    },
  };
}
