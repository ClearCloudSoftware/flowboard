/**
 * `lr-doctor`: the doctor's report (`doctor.ts`) as a table for a person, or with `--json` as the one document a
 * script or a page reads. Exit 0 when nothing needed is broken, 1 when something is, 2 for a bad argument or a crash.
 */
import { relative } from 'node:path';
import { parseArgs } from 'node:util';
import { type Check, type DoctorOptions, type DoctorReport, runDoctor, type Status } from './doctor.ts';
import { GROUPS, summaryLine } from './doctor-view.ts';
import { TRUST } from './settings.ts';
const OS: Partial<Record<NodeJS.Platform, string>> = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' };
const MARK: Record<Status, [string, string]> = { ok: ['✓', '32'], fail: ['✗', '31'], warn: ['!', '33'], skip: ['–', '2'] };
const LABEL = 13;
const NEEDED_AT = 44;

export function renderReport(r: DoctorReport, color: boolean): string {
  const paint = (code: string, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const { context: c, summary: s } = r;
  const projects = c.projects.length ? c.projects.map((p) => `${p.name} (${TRUST[p.trust].label})`).join(', ') : 'none yet';
  const lines = [
    `Lamproom doctor · ${OS[r.host.platform] ?? r.host.platform} ${r.host.arch} · data ${relative(process.cwd(), c.dataDir) || '.'}`,
    `Projects: ${projects} · new projects: ${TRUST[c.defaultTrust].label}`,
    '',
  ];
  for (const [group, name] of GROUPS) {
    const checks = r.checks.filter((ch) => ch.group === group);
    if (!checks.length) continue;
    const needed = group !== 'core' && checks.find((ch) => ch.needed); // core is always needed
    lines.push(needed ? `${name.padEnd(NEEDED_AT)}${paint('2', `needed: ${needed.why}`)}` : name);
    for (const ch of checks) lines.push(...checkLines(ch, paint));
  }
  lines.push('', summaryLine(s));
  return lines.join('\n');
}

function checkLines(ch: Check, paint: (code: string, s: string) => string): string[] {
  const [mark, code] = MARK[ch.status];
  const head = `  ${paint(code, mark)} ${ch.label.padEnd(LABEL)}${ch.detail}`;
  return ch.fix && ch.status !== 'ok' ? [head, `${' '.repeat(4 + LABEL)}→ ${ch.fix}`] : [head];
}

export async function doctorCli(
  args: string[],
  io: { out: (s: string) => void; err: (s: string) => void; tty: boolean; env: NodeJS.ProcessEnv },
  opts: Partial<DoctorOptions> = {},
): Promise<number> {
  let json: boolean;
  try {
    json = !!parseArgs({ args, options: { json: { type: 'boolean' } }, strict: true }).values.json;
  } catch (e) {
    io.err(`${(e as Error).message}\nusage: lr-doctor [--json]`);
    return 2;
  }
  try {
    const report = await runDoctor({ runner: 'terminal', env: io.env, ...opts });
    io.out(json ? JSON.stringify(report, null, 2) : renderReport(report, io.tty && !io.env.NO_COLOR));
    return report.summary.ready ? 0 : 1;
  } catch (e) {
    io.err(`lr-doctor: ${(e as Error).message}`);
    return 2;
  }
}
