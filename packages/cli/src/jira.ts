/**
 * Jira settings + credentials storage.
 *
 * `jira.json` in the data dir, written with mode 0600. Shape:
 *
 *   {
 *     "credential": { "kind": "atlassian_oauth", ... } | { "kind": "atlassian_api_token", ... },
 *     "defaultJql": "project = KAN ORDER BY updated DESC",
 *     "oauthClientSecret": "ATOA..."
 *   }
 *
 * Separate from `secrets.json` because the credential is more than a single
 * string — OAuth carries five fields (access/refresh/expiresAt/cloudId/
 * siteName), API token carries three (baseUrl/email/token).
 *
 * `oauthClientSecret` is the Atlassian OAuth 2.1 app's confidential-client
 * secret — distinct from the per-user tokens in `credential`. Having it in
 * jira.json (instead of `.env.local`) means rotating it from the UI with
 * no dev-server restart, and Electron builds don't need a bundled env file.
 *
 * This module is the ONLY place the file is read or written. API routes under
 * app/api/jira/ call these helpers; the JiraTaskSource adapter never reads
 * the file directly.
 */

import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceCredentials } from '@lamproom/core';
import { isFile, writeJsonFile } from './config.ts';

/** The credential kinds this module understands. */
export type JiraCredential =
  | Extract<SourceCredentials, { kind: 'atlassian_oauth' }>
  | Extract<SourceCredentials, { kind: 'atlassian_api_token' }>;

export interface JiraSettings {
  credential?: JiraCredential;
  defaultJql?: string;
  /** Atlassian OAuth 2.1 confidential-client secret. Optional: when absent,
   * the refresh helpers fall back to `process.env.ATLASSIAN_CLIENT_SECRET`. */
  oauthClientSecret?: string;
}

const fileOf = (dataDir: string) => join(dataDir, 'jira.json');

export function readJira(dataDir: string): JiraSettings {
  try {
    const path = fileOf(dataDir);
    if (!isFile(path)) return {};
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as JiraSettings;
  } catch {
    return {};
  }
}

export function writeJira(dataDir: string, settings: JiraSettings): void {
  const clean: JiraSettings = {};
  if (settings.credential !== undefined) clean.credential = settings.credential;
  if (settings.defaultJql !== undefined && settings.defaultJql.trim() !== '') {
    clean.defaultJql = settings.defaultJql.trim();
  }
  if (settings.oauthClientSecret !== undefined && settings.oauthClientSecret.trim() !== '') {
    clean.oauthClientSecret = settings.oauthClientSecret.trim();
  }
  if (Object.keys(clean).length === 0) {
    rmSync(fileOf(dataDir), { force: true });
    return;
  }
  writeJsonFile(fileOf(dataDir), clean, 0o600);
}

export function clearJiraCredential(dataDir: string): void {
  const current = readJira(dataDir);
  if (current.credential === undefined) return;
  const next: JiraSettings = {};
  if (current.defaultJql !== undefined) next.defaultJql = current.defaultJql;
  writeJira(dataDir, next);
}

/**
 * Status summary for the UI. Never returns the token itself; shows only the
 * fields the page can safely display.
 */
export interface JiraStatus {
  connected: boolean;
  kind?: 'atlassian_oauth' | 'atlassian_api_token';
  siteName?: string;
  baseUrl?: string;
  email?: string;
  expiresAt?: string;
  defaultJql?: string;
  /** True when an OAuth client secret is stored (via UI or env). Never carries the secret itself. */
  oauthSecretSaved: boolean;
}

export function jiraStatus(dataDir: string): JiraStatus {
  const s = readJira(dataDir);
  const out: JiraStatus = {
    connected: s.credential !== undefined,
    oauthSecretSaved:
      (s.oauthClientSecret !== undefined && s.oauthClientSecret.trim() !== '') ||
      (process.env['ATLASSIAN_CLIENT_SECRET'] !== undefined &&
        process.env['ATLASSIAN_CLIENT_SECRET'].trim() !== ''),
  };
  if (s.defaultJql !== undefined) out.defaultJql = s.defaultJql;
  if (s.credential === undefined) return out;
  out.kind = s.credential.kind;
  if (s.credential.kind === 'atlassian_oauth') {
    out.siteName = s.credential.siteName;
    out.expiresAt = s.credential.expiresAt;
  } else {
    out.baseUrl = s.credential.baseUrl;
    out.email = s.credential.email;
  }
  return out;
}
