/**
 * EnvFileCredentialResolver — the first SourceCredentialResolver adapter.
 *
 * Reads `.lamproom/credentials.json` under a configurable root (usually the
 * Lamproom installation root, not the project repo). The file is a plain
 * JSON object keyed by SourceId, with each value a SourceCredentials union
 * member:
 *
 *   {
 *     "github": { "kind": "github_pat", "token": "ghp_xxx" }
 *   }
 *
 * Two safety rules enforced at read time:
 *
 *   1. On POSIX, the file MUST have mode 0600. Anything broader is refused
 *      with an error naming "mode" — this catches the common mistake of
 *      editing the file in an editor that doesn't preserve permissions.
 *   2. The parsed value's `kind` MUST be known to this resolver (v1: 'none',
 *      'github_pat'). An unknown kind is refused with an error naming the
 *      kind — this catches a config written for a later version of Lamproom
 *      that this build does not yet understand.
 *
 * Errors mention the file path and the reason. They NEVER include a token
 * or any part of the file's contents.
 *
 * See docs/superpowers/specs/2026-11-14-task-source-port-design.md, section
 * "Credentials".
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceCredentials, SourceCredentialResolver, SourceId } from '@lamproom/core';

const KNOWN_KINDS: ReadonlySet<string> = new Set(['none', 'github_pat']);

export interface EnvFileCredentialResolverOptions {
  /** Directory that contains the `.lamproom/credentials.json` file. */
  root: string;
}

export class EnvFileCredentialResolver implements SourceCredentialResolver {
  private readonly path: string;

  constructor(opts: EnvFileCredentialResolverOptions) {
    this.path = join(opts.root, '.lamproom', 'credentials.json');
  }

  async resolve(sourceId: SourceId, _projectId: string): Promise<SourceCredentials> {
    let text: string;
    try {
      await this.assertMode();
      text = await readFile(this.path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'none' };
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`credentials.json: parse failed at ${this.path}`);
    }

    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(`credentials.json: expected an object at ${this.path}`);
    }

    const entry = (parsed as Record<string, unknown>)[sourceId];
    if (entry === undefined) return { kind: 'none' };

    return this.validateEntry(entry);
  }

  private async assertMode(): Promise<void> {
    if (process.platform === 'win32') return;
    const s = await stat(this.path);
    if ((s.mode & 0o077) !== 0) {
      throw new Error(
        `credentials.json: mode ${(s.mode & 0o777).toString(8)} at ${this.path} is broader than 0600`,
      );
    }
  }

  private validateEntry(entry: unknown): SourceCredentials {
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`credentials.json: entry at ${this.path} is not an object`);
    }
    const kind = (entry as { kind?: unknown }).kind;
    if (typeof kind !== 'string') {
      throw new Error(`credentials.json: missing "kind" in entry at ${this.path}`);
    }
    if (!KNOWN_KINDS.has(kind)) {
      throw new Error(`credentials.json: unknown kind '${kind}' at ${this.path}`);
    }
    if (kind === 'none') return { kind: 'none' };
    // kind === 'github_pat'
    const token = (entry as { token?: unknown }).token;
    if (typeof token !== 'string' || token === '') {
      throw new Error(`credentials.json: github_pat entry missing non-empty "token" at ${this.path}`);
    }
    return { kind: 'github_pat', token };
  }
}
