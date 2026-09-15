/**
 * The question schema — one shape that drives three renderers: the ask_user MCP
 * tool return, the /inbox controls, and the Notifier's channel blocks (Slack,
 * Discord, …). Defined once so they cannot diverge. See docs/architecture/04.
 */

export type QuestionKind = 'yes_no' | 'single_select' | 'multi_select' | 'text' | 'number';

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  prompt: string;
  help?: string;
  kind: QuestionKind;
  /** Present for the select kinds. */
  options?: QuestionOption[];
  /** Defaults to true; a run parks only while a *required* question is unanswered. */
  required?: boolean;
}
