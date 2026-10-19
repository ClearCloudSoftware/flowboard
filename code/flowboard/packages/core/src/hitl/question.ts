/**
 * Questions an agent asks a human, and the ask protocol between the ask_user
 * shim and a broker (the run-agent terminal today, the worker later).
 *
 * See docs/FlowBoard/Human In The Loop/Questions.md and Ask User MCP Server.md.
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
  /** Defaults to true. */
  required?: boolean;
}

/** yes_no → boolean, single_select → option value, multi_select → values, text → string, number → number; a skipped optional question → null. */
export type AnswerValue = boolean | string | string[] | number | null;
export type Answers = Record<string, AnswerValue>;

/** One request per socket connection, as one JSON line. */
export interface AskRequest {
  questions: Question[];
}

/** The broker's reply. The park reply comes from the worker broker; the shim relays any non-error reply verbatim. */
export type AskReply = { answers: Answers } | { error: string } | { status: 'no_answer_yet'; instruction: string };

/** First problem found, or undefined when the batch is askable. */
export function checkQuestions(questions: Question[]): string | undefined {
  if (!questions.length) return 'no questions';
  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.id)) return `duplicate question id "${q.id}"`;
    seen.add(q.id);
    if (!q.prompt.trim()) return `question "${q.id}" has no prompt`;
    if ((q.kind === 'single_select' || q.kind === 'multi_select') && !q.options?.length) return `question "${q.id}" needs options`;
  }
  return undefined;
}
