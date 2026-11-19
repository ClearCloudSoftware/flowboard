/** The designer's state: the open recipe, its unsaved draft, what is selected, where steps were dragged. */
import { createStore } from '@tanstack/react-store';
import type { FlowFile } from './api.ts';
import { renameStep, toDraft } from './draft.ts';
import type { Draft } from './draft.ts';

export type Selection = { step: string } | { edge: number } | null;
type XY = { x: number; y: number };

interface EditorState {
  /** The recipe as last read or saved. */
  file: FlowFile | null;
  /** That recipe's draft as JSON: the draft differs from it exactly when there is something to save. */
  base: string;
  draft: Draft | null;
  /** Why the open file cannot be drawn, when it cannot; the check says the rest. */
  unreadable: string | null;
  selection: Selection;
  /** Where steps were dragged to: arrangement only, kept for as long as the page is open. */
  moved: Record<string, XY>;
  /** Bumped whenever the inspector's fields must start over from the draft. */
  generation: number;
}

const read = (file: FlowFile) => {
  const draft = toDraft(file.raw);
  return typeof draft === 'string'
    ? { file, draft: null, base: '', unreadable: draft }
    : { file, draft, base: JSON.stringify(draft), unreadable: null };
};

export const editor = createStore(
  { file: null, base: '', draft: null, unreadable: null, selection: null, moved: {}, generation: 0 } as EditorState,
  ({ setState }) => ({
    open(file: FlowFile) {
      setState((s) => ({ ...s, ...read(file), selection: null, moved: {}, generation: s.generation + 1 }));
    },
    /**
     * The same recipe, written by a save or changed on disk: what is selected stays if it still exists, and the
     * inspector starts over only when the draft itself changed, so a save does not take the focus from a field.
     */
    reread(file: FlowFile) {
      setState((s) => {
        const next = read(file);
        const same = next.draft !== null && next.base === JSON.stringify(s.draft);
        const steps = next.draft?.steps ?? {};
        const selection = s.selection && 'step' in s.selection && !(s.selection.step in steps) ? null : s.selection;
        return { ...s, ...next, ...(same && { draft: s.draft }), selection, generation: same ? s.generation : s.generation + 1 };
      });
    },
    /** A selection the edit removed goes; so does a selected route once routes come or go, as its index moves. */
    edit(change: (d: Draft) => Draft) {
      setState((s) => {
        if (!s.draft) return s;
        const draft = change(s.draft);
        const sel = s.selection;
        const gone =
          sel !== null &&
          ('step' in sel ? !(sel.step in (draft.steps ?? {})) : (draft.edges ?? []).length !== (s.draft.edges ?? []).length);
        return { ...s, draft, selection: gone ? null : sel };
      });
    },
    rename(from: string, to: string) {
      setState((s) => {
        if (!s.draft) return s;
        const draft = renameStep(s.draft, from, to);
        if (draft === s.draft) return s;
        const { [from]: at, ...moved } = s.moved;
        return {
          ...s,
          draft,
          selection: s.selection && 'step' in s.selection && s.selection.step === from ? { step: to } : s.selection,
          moved: at ? { ...moved, [to]: at } : moved,
        };
      });
    },
    select(selection: Selection) {
      setState((s) => (JSON.stringify(s.selection) === JSON.stringify(selection) ? s : { ...s, selection, generation: s.generation + 1 }));
    },
    move(id: string, at: XY) {
      setState((s) => ({ ...s, moved: { ...s.moved, [id]: at } }));
    },
  }),
);

/** The selected step's name, read when an edit lands rather than when its field was drawn: a rename moves it. */
export const selectedStep = () => {
  const s = editor.state.selection;
  return s && 'step' in s ? s.step : undefined;
};
