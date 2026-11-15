/**
 * The repo analyst's proposal (`internal/repo-analyst/SKILL.md` §3): its stack, its check command and the network
 * hosts its sandbox must reach. The agent read an untrusted repo, so its file is read as untrusted input: only the
 * skill's shape, one-line commands, plain host names, and short lists. No Node imports: the pages use this;
 * `analysis-run.ts` reads it from a run.
 */
import { z } from 'zod';
import type { ProjectView } from './projects.ts';

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

/**
 * The public registries of the skill's table (SKILL.md §2). Any other host is custom: it widens the sandbox, so the
 * page marks it, whatever the agent said, as a hostile repo can steer what the agent says.
 */
export const REGISTRY_HOSTS = new Set([
  'registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org', 'index.crates.io', 'static.crates.io', 'proxy.golang.org', 'sum.golang.org',
  'repo.maven.apache.org', 'plugins.gradle.org', 'rubygems.org', 'api.nuget.org', 'repo.packagist.org',
]);

/** Text a person reads before approving it: no control, format (bidi, zero-width) or line/paragraph separator characters. */
export const VISIBLE = /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+$/u;
const INVISIBLE = 'only characters a person can see: no control, bidi or zero-width characters, and one line';

const level = z.enum(['high', 'medium', 'low']).optional();
const evidence = z.array(z.string().max(300)).max(20).default([]);
const Shape = z.object({
  stack: z.object({ value: z.array(z.string().trim().min(1).max(40).regex(VISIBLE, { error: INVISIBLE })).max(12).nullable(), evidence, confidence: level }),
  check_command: z.object({
    value: z.string().trim().min(1).max(500).regex(VISIBLE, { error: INVISIBLE }).nullable(),
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
      networkHosts: p.network_hosts.value?.map((h) => ({ ...h, custom: h.custom || !REGISTRY_HOSTS.has(h.host.toLowerCase()) })) ?? null,
      evidence: { stack: p.stack.evidence, checkCommand: p.check_command.evidence },
      confidence: { stack: p.stack.confidence, checkCommand: p.check_command.confidence, networkHosts: p.network_hosts.confidence },
      notes: p.notes.slice(0, 1000),
    },
  };
}

/** Each proposal the project already holds: its check command equal, every proposed host in its list. */
export function analysisAccepted(p: Pick<ProjectView, 'checkCommand' | 'networkHosts' | 'analysed'>): { checkCommand: boolean; networkHosts: boolean } {
  const proposal = p.analysed?.proposal;
  const hosts = new Set(p.networkHosts ?? []);
  return {
    checkCommand: !!proposal?.checkCommand && proposal.checkCommand === p.checkCommand,
    networkHosts: !!proposal?.networkHosts?.length && proposal.networkHosts.every((h) => hosts.has(h.host)),
  };
}
