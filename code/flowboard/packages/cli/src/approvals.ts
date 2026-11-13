/**
 * What "Allow from now on" saves: a rule on the project record. An edit rule allows every file edit; a shell rule
 * allows commands starting with its prefix. A command that chains or redirects (`; & | < > $ ` ( ) \` or a newline)
 * is never matched by a rule and never saved as one, so a saved `pnpm test` cannot carry `&& rm -rf`. Neither is a
 * command that runs another command (`bash -c`, `node -e`, `pnpm exec`): a rule for it would allow anything.
 */
import type { ApprovalCall } from '@flowboard/core';
import { z } from 'zod';

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
