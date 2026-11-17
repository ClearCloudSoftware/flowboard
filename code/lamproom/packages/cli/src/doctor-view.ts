/**
 * How the doctor's report reads, for the terminal (`doctor-cli.ts`) and the System status page alike. No Node
 * imports: a client component imports it.
 */
import type { DoctorReport, Group } from './doctor.ts';

/** The report's groups, in the order both show them, with their headings. */
export const GROUPS: readonly [Group, string][] = [
  ['core', 'Core'],
  ['container', 'Containers'],
  ['agents', 'Agents on this machine'],
  ['models', 'Models'],
  ['connections', 'Connections'],
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** `Ready.`, `Ready: 2 warnings.`, or `Not ready: 1 problem stops runs, 2 warnings.` */
export function summaryLine(s: DoctorReport['summary']): string {
  const warnings = plural(s.warn, 'warning');
  if (s.ready) return s.warn ? `Ready: ${warnings}.` : 'Ready.';
  return `Not ready: ${plural(s.fail, 'problem stops', 'problems stop')} runs, ${warnings}.`;
}
