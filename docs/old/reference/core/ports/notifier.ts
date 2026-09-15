import type { Question } from '../hitl/question';

/** Context the channel shows alongside the question (PRD §10: title + question text only, never artifact bodies). */
export interface QuestionContext {
  taskTitle: string;
  stepName: string;
  /** Deep link to the live session / inbox row. */
  sessionUrl?: string;
}

/** A handle on a posted message, for later chat.update-style reconciliation. */
export interface PostedRef {
  channel: string;
  /** Provider message id — Slack's `ts`, a Discord message id, an email thread id. */
  ref: string;
}

/**
 * Notifier — escalation channel behind one port. Slack Block Kit is one adapter;
 * Discord, email, and webhook are others. Reconciliation (first-write-wins,
 * repaint on answer/undo) is channel-independent and lives in core/hitl; the
 * adapter only renders and verifies signatures.
 *
 * See docs/architecture/04-hitl-and-notify.md.
 */
export interface Notifier {
  readonly id: string;
  /** `inline_answer` renders native controls; `link_only` sends a deep link to /inbox. */
  readonly capabilities: ReadonlySet<'inline_answer' | 'link_only'>;
  postQuestion(q: Question, ctx: QuestionContext): Promise<PostedRef>;
  updateResolved(ref: PostedRef, by: string): Promise<void>;
}
