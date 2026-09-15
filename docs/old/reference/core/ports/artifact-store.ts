import type { TaskRef } from './workspace';

export interface FileMeta {
  type: string;
  path: string;
  bytes: number;
  mtimeMs: number;
}

export interface ArtifactMeta {
  taskId: string;
  stepInstanceId?: string;
  type: string;
  path: string;
  bytes?: number;
}

/**
 * ArtifactStore — where step outputs live. Disk + git by default (agents read
 * files natively, git makes them diffable — PRD §6); a remote adapter enables
 * multi-machine later. The DB stores only pointers. Contract validation checks
 * the artifact *type graph*, never bytes, so any store works.
 *
 * See docs/architecture/05-environment-and-registry.md.
 */
export interface ArtifactStore {
  readonly id: string;
  /** Files created/modified since `sinceMtimeMs` whose type matches one of `produces`. */
  scan(task: TaskRef, sinceMtimeMs: number, produces: string[]): Promise<FileMeta[]>;
  /** Absolute path a step should read/write for a given artifact type. */
  resolve(task: TaskRef, type: string): string;
  register(meta: ArtifactMeta): Promise<void>;
}
