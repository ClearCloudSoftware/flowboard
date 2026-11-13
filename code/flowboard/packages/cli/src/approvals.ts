/**
 * What "Allow from now on" saves: a rule on the project record. An edit rule allows every file edit; a shell rule
 * allows commands starting with its prefix. A command that chains or redirects (`; & | < > $ ` ( ) \` or a newline)
 * is never matched by a rule and never saved as one, so a saved `pnpm test` cannot carry `&& rm -rf`. Neither is a
 * command that runs another command (`bash -c`, `node -e`, `pnpm exec`): a rule for it would allow anything.
 */
import { relative } from 'node:path';
import type { Answers, ApprovalCall, Question } from '@flowboard/core';
import { z } from 'zod';
import { inside } from './flow-config.ts';
import { addApproval, readProjects } from './projects.ts';

export type ApprovalRule = { kind: 'edit' } | { kind: 'shell'; prefix: string };

const CHAINED = /[;&|<>$`()\\\n]/;

/** Programs that run whatever they are given; a command starting with one is asked about every time. */
export const RUNNERS = new Set('sh bash zsh dash ksh csh tcsh fish busybox ssh env sudo doas su xargs eval exec command builtin nohup timeout nice time watch npx pnpx bunx python node nodejs deno bun ruby perl php awk sed find'.split(' '));
const PMS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const WORD = /^[A-Za-z0-9][A-Za-z0-9._-]*$/; // no path, no NAME=value, no flag
/** True when the command starts with a runner: `python3.12` is `python`; a package manager runs anything after `exec`, `dlx` or `x`
 * (a last `x` runs nothing, so `pnpm test --filter x` stays savable). */
const runs = (words: string[]) =>
  RUNNERS.has(words[0].toLowerCase().replace(/[\d.]+$/, '')) || (PMS.has(words[0]) && words.some((w, i) => i > 0 && (w === 'exec' || w === 'dlx' || (w === 'x' && i < words.length - 1))));
const wordsOf = (command: string) => command.trim().split(/\s+/);

export const ApprovalRuleSchema: z.ZodType<ApprovalRule> = z.union([
  z.strictObject({ kind: z.literal('edit') }),
  z.strictObject({ kind: z.literal('shell'), prefix: z.string().trim().min(1).refine((p) => !CHAINED.test(p) && wordsOf(p).every((w) => WORD.test(w)) && !runs(wordsOf(p))) }),
]);

/** The rule "Allow from now on" saves for a call: the command's first word, plus its second unless that is a flag. */
export function ruleFor(call: ApprovalCall): ApprovalRule | undefined {
  if (call.kind === 'edit') return { kind: 'edit' };
  if (CHAINED.test(call.command)) return undefined;
  const [first, second] = wordsOf(call.command);
  if (!first) return undefined;
  const prefix = second && !second.startsWith('-') ? `${first} ${second}` : first;
  return runs(wordsOf(call.command)) || !prefix.split(' ').every((w) => WORD.test(w)) ? undefined : { kind: 'shell', prefix };
}

/** The rule that allows the call, if any. */
export function allowedBy(rules: ApprovalRule[], call: ApprovalCall): ApprovalRule | undefined {
  if (call.kind === 'edit') return rules.find((r) => r.kind === 'edit');
  if (CHAINED.test(call.command)) return undefined;
  const words = wordsOf(call.command);
  if (!WORD.test(words[0]) || runs(words)) return undefined;
  const cmd = words.join(' ');
  return rules.find((r) => r.kind === 'shell' && (cmd === r.prefix || cmd.startsWith(r.prefix + ' ')));
}

export const ruleText = (r: ApprovalRule) => (r.kind === 'edit' ? 'every file edit' : `commands starting "${r.prefix}"`);

/**
 * run-flow's answer to an agent's edit or shell command in a Trusted run: a saved rule allows it at once, else the
 * owner is asked through the step's `ask`, and "Allow from now on" saves the rule on the project. Rules are read
 * fresh at every call. An ask that fails (stopped, no one to answer) rejects, which the adapter takes as no.
 */
export function approver(o: { dataDir: string; projectId: string; folder: string; ask: (qs: Question[], s: AbortSignal) => Promise<Answers>; show(line: string): void; step: string }) {
  return async (call: ApprovalCall, signal: AbortSignal): Promise<boolean> => {
    const saved = allowedBy(readProjects(o.dataDir).find((p) => p.id === o.projectId)?.approvals ?? [], call);
    if (saved) {
      o.show(`-- ${o.step}: allowed by a saved rule (${ruleText(saved)})`);
      return true;
    }
    const path = call.kind === 'edit' && (inside(o.folder, call.path) ? relative(o.folder, call.path) : call.path);
    const what = call.kind === 'edit' ? `editing ${path}` : call.command;
    const rule = ruleFor(call);
    const { approve } = await o.ask([{
      id: 'approve',
      kind: 'single_select',
      prompt: call.kind === 'edit' ? `Edit ${path}?` : `Run ${call.command}?`,
      ...(!rule && { help: 'This command can run other commands, so it can only be allowed once.' }),
      options: [{ value: 'once', label: 'Allow' }, ...(rule ? [{ value: 'always', label: `Allow from now on: ${ruleText(rule)}` }] : []), { value: 'deny', label: 'Deny' }],
    }], signal);
    // Only what was offered allows: a page answer of `always` where it was not offered is a no.
    const yes = approve === 'once' || (approve === 'always' && !!rule);
    o.show(`-- ${o.step}: ${yes ? 'allowed' : 'denied'} ${what}`);
    if (approve === 'always' && rule) {
      const r = addApproval(o.dataDir, o.projectId, rule);
      if (!r.ok) o.show(`-- ${o.step}: could not save the rule: ${r.error}`);
    }
    return yes;
  };
}
