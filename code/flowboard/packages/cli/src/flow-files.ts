/**
 * The flow designer's files: a folder of recipes, each `<name>.yaml`, checked the way `run-flow --check` checks
 * one. A save writes the edit into the file's own YAML, so the lines it leaves alone stay as they were written.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCollection, isMap, isScalar, isSeq, Pair, parse, parseDocument } from 'yaml';
import type { Document } from 'yaml';
import { isDir, isFile } from './config.ts';
import { loadFlow } from './flow-config.ts';

/** A recipe's name is its file name less `.yaml`, and follows the rule for step names. */
export const FLOW_NAME = /^[a-z0-9][a-z0-9_-]*$/;

/** `--check`'s verdict as `<field>: <message>` lines: errors stop a save, warnings do not. */
export interface FlowCheck { errors: string[]; warnings: string[] }
/** A recipe as read; `version` names its text, so a save can tell that the file changed under it. */
export interface FlowFile { name: string; text: string; version: string; raw: unknown; check: FlowCheck }
/** A library entry; `description` is the file's first line, when that is a comment. */
export interface FlowSummary {
  name: string;
  description: string;
  steps: string[];
  edges: { from: string; to: string; condition: string }[];
  gates: number;
  budgetUsd: number | null;
  errors: number;
}
export type SaveResult = { ok: true; file: FlowFile } | { ok: false; conflict: string } | { ok: false; check: FlowCheck };

const versionOf = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 12);
const pathOf = (dir: string, name: string) => join(dir, `${name}.yaml`);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const parsed = (text: string): unknown => {
  try {
    return parse(text);
  } catch {
    return null; // the check says why
  }
};

/** Checks `text` as the recipe `name` in `dir`, on its own, as `run-flow --check <dir>/<name>.yaml` would. */
export function checkFlow(dir: string, name: string, text: string): FlowCheck {
  const r = loadFlow(`${name}.yaml`, dir, undefined, text);
  if (r.ok) return { errors: [], warnings: r.config.warnings };
  const prefix = `${name}.yaml: `;
  return { errors: r.errors.map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : l)), warnings: [] };
}

export function readFlow(dir: string, name: string): FlowFile | undefined {
  const path = pathOf(dir, name);
  if (!isFile(path)) return undefined;
  const text = readFileSync(path, 'utf8');
  return { name, text, version: versionOf(text), raw: parsed(text), check: checkFlow(dir, name, text) };
}

export function listFlows(dir: string): FlowSummary[] {
  if (!isDir(dir)) return [];
  const names = readdirSync(dir).filter((f) => f.endsWith('.yaml')).map((f) => f.slice(0, -'.yaml'.length));
  return names.filter((n) => FLOW_NAME.test(n)).sort().map((name) => {
    const { text, raw, check } = readFlow(dir, name)!;
    const flow = isRecord(raw) ? raw : {};
    const steps = isRecord(flow.steps) ? flow.steps : {};
    const edges = (Array.isArray(flow.edges) ? flow.edges : []).filter(isRecord);
    return {
      name,
      description: /^#\s?(.*)/.exec(text)?.[1].trim() ?? '',
      steps: Object.keys(steps),
      edges: edges
        .filter((e) => typeof e.from === 'string' && typeof e.to === 'string')
        .map((e) => ({ from: e.from as string, to: e.to as string, condition: typeof e.condition === 'string' ? e.condition : 'always' })),
      gates: Object.values(steps).filter((s) => isRecord(s) && s.gate === 'approval').length,
      budgetUsd: typeof flow.budget_usd === 'number' ? flow.budget_usd : null,
      errors: check.errors.length,
    };
  });
}

/** A new recipe holds only its budget, so it opens with the one thing left to do: add steps. */
const NEW_FLOW = 'budget_usd: 0 # the most the whole flow may spend, in dollars; 0 for no ceiling\n';

/** Undefined when the name is taken. */
export function createFlow(dir: string, name: string): FlowFile | undefined {
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(pathOf(dir, name), NEW_FLOW, { flag: 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return undefined;
    throw e;
  }
  return readFlow(dir, name);
}

/** What saving `draft` over the recipe would write, and what `--check` says of it. */
export function draftFlow(dir: string, name: string, draft: unknown): { text: string; check: FlowCheck } | undefined {
  const path = pathOf(dir, name);
  if (!isFile(path)) return undefined;
  const text = toYaml(readFileSync(path, 'utf8'), draft);
  return { text, check: checkFlow(dir, name, text) };
}

/** Writes `draft` over the recipe opened at `version`, unless the file changed since or the result fails the check. */
export function saveFlow(dir: string, name: string, draft: unknown, version: string): SaveResult {
  const path = pathOf(dir, name);
  if (!isFile(path)) return { ok: false, conflict: `${name}.yaml is no longer in ${dir}` };
  const now = readFileSync(path, 'utf8');
  if (versionOf(now) !== version) return { ok: false, conflict: `${name}.yaml changed on disk after it was opened; open it again to see the change` };
  const text = toYaml(now, draft);
  const check = checkFlow(dir, name, text);
  if (check.errors.length) return { ok: false, check };
  writeFileSync(path, text);
  return { ok: true, file: { name, text, version: versionOf(text), raw: parsed(text), check } };
}

/**
 * `draft` written into the YAML `text`. Nodes the edit leaves alone keep their comments, and lines it leaves alone
 * keep their spacing, so a save changes only the lines whose meaning changed.
 */
export function toYaml(text: string, draft: unknown): string {
  const doc = parseDocument(text);
  doc.contents = merge(doc, doc.errors.length ? undefined : doc.contents, draft, []) as typeof doc.contents;
  const fresh = doc.toString({ lineWidth: 0 });
  // The library respaces every line it prints: keep the old line wherever only the spacing differs.
  const old = text.split('\n');
  const freshLines = fresh.split('\n');
  const kept = align(old.map(spacing), freshLines.map(spacing));
  const out = freshLines.map((line, i) => (kept[i] === undefined ? line : old[kept[i]])).join('\n');
  // Spacing inside a quoted string is not insignificant; if keeping a line changed a value, keep none.
  return JSON.stringify(parsed(out)) === JSON.stringify(parsed(fresh)) ? out : fresh;
}

/** `value` written over the YAML node `node`, in place while their shapes match. `siblings` style a new node. */
function merge(doc: Document, node: unknown, value: unknown, siblings: unknown[]): unknown {
  if (isMap(node) && isRecord(value)) {
    const key = (pair: Pair) => String(isScalar(pair.key) ? pair.key.value : pair.key);
    const before = node.items.map((p) => p.value);
    node.items = Object.entries(value).map(([k, v]) => {
      const pair = node.items.find((p) => key(p) === k);
      if (!pair) return new Pair(doc.createNode(k), create(doc, v, before));
      pair.value = merge(doc, pair.value, v, before);
      return pair;
    });
    return node;
  }
  if (isSeq(node) && Array.isArray(value)) {
    const before = [...node.items];
    node.items = value.map((v, i) => (i < before.length ? merge(doc, before[i], v, before) : create(doc, v, before)));
    return node;
  }
  if (isScalar(node) && !isRecord(value) && !Array.isArray(value)) {
    node.value = value; // keeps its comment, and a number keeps its decimals
    return node;
  }
  return create(doc, value, siblings);
}

/** A new node for `value`, written flow style when its siblings are: a new edge among `- { from: a, to: b }` lines. */
function create(doc: Document, value: unknown, siblings: unknown[]) {
  const node = doc.createNode(value);
  if (isCollection(node) && siblings.some((s) => isCollection(s) && s.flow)) node.flow = true;
  return node;
}

/** A line without its insignificant spacing: around flow brackets and commas, before a comment, at the end. */
const spacing = (line: string) => line.replace(/\s+$/, '').replace(/\s*([[\]{},])\s*/g, '$1').replace(/\s+#/, ' #');

/** For each line of `b`, the line of `a` it matches in a longest common subsequence, if any. */
function align(a: string[], b: string[]): (number | undefined)[] {
  const longest = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      longest[i][j] = a[i] === b[j] ? longest[i + 1][j + 1] + 1 : Math.max(longest[i + 1][j], longest[i][j + 1]);
    }
  }
  const match: (number | undefined)[] = new Array(b.length);
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) match[j++] = i++;
    else if (longest[i + 1][j] >= longest[i][j + 1]) i++;
    else j++;
  }
  return match;
}
