/**
 * What "Allow from now on" saves: a rule on the project record. An edit rule allows every file edit; a shell rule
 * allows commands starting with its prefix. A command that chains or redirects (`; & | < > $ ` ( ) \` or a newline)
 * is never matched by a rule and never saved as one, so a saved `pnpm test` cannot carry `&& rm -rf`.
 */
import type { ApprovalCall } from '@flowboard/core';
import { z } from 'zod';

export type ApprovalRule = { kind: 'edit' } | { kind: 'shell'; prefix: string };

const CHAINED = /[;&|<>$`()\\\n]/;

export const ApprovalRuleSchema: z.ZodType<ApprovalRule> = z.union([
  z.strictObject({ kind: z.literal('edit') }),
  z.strictObject({ kind: z.literal('shell'), prefix: z.string().trim().min(1).refine((p) => !CHAINED.test(p)) }),
]);

/** The rule "Allow from now on" saves for a call: the command's first word, plus its second unless that is a flag. */
export function ruleFor(call: ApprovalCall): ApprovalRule | undefined {
  if (call.kind === 'edit') return { kind: 'edit' };
  if (CHAINED.test(call.command)) return undefined;
  const [first, second] = call.command.trim().split(/\s+/);
  if (!first) return undefined;
  return { kind: 'shell', prefix: second && !second.startsWith('-') ? `${first} ${second}` : first };
}

/** The rule that allows the call, if any. */
export function allowedBy(rules: ApprovalRule[], call: ApprovalCall): ApprovalRule | undefined {
  if (call.kind === 'edit') return rules.find((r) => r.kind === 'edit');
  if (CHAINED.test(call.command)) return undefined;
  const cmd = call.command.trim().split(/\s+/).join(' ');
  return rules.find((r) => r.kind === 'shell' && (cmd === r.prefix || cmd.startsWith(r.prefix + ' ')));
}

export const ruleText = (r: ApprovalRule) => (r.kind === 'edit' ? 'every file edit' : `commands starting "${r.prefix}"`);
