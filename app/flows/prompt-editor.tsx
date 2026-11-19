'use client';
/** A large editor for a step's prompt: its file beside the recipes, or the inline system prompt. */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { promptQuery, savePrompt } from './api.ts';

function Editor({ title, note, text, busy, error, onSave, onClose }: {
  title: string;
  note: string;
  text: string;
  busy?: boolean;
  error?: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(text);
  useEffect(() => setValue(text), [text]);
  useEffect(() => ref.current?.showModal(), []);
  const dirty = value !== text;
  return (
    <dialog
      ref={ref}
      className="pe"
      onCancel={(e) => {
        if (dirty && !confirm('Close without saving?')) e.preventDefault();
      }}
      onClose={onClose}
    >
      <div className="ph">
        <span className="lbl">{title}</span>
        <span className="sp" />
        <span className="lbl hint">{note}</span>
      </div>
      <textarea
        value={value}
        spellCheck={false}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.stopPropagation(); // ⌘S here saves the prompt file only, not the recipe behind the dialog
            if (dirty) onSave(value);
          }
        }}
      />
      <div className="pe-f">
        {error && <em className="in-err">{error}</em>}
        <span className="sp" />
        <button type="button" className="act" onClick={() => ref.current?.close()}>
          {dirty ? 'Discard' : 'Close'}
        </button>
        <button type="button" className="act primary" disabled={!dirty || busy} onClick={() => onSave(value)} title="Save (⌘S)">
          Save
        </button>
      </div>
    </dialog>
  );
}

/** The prompt file at `path`, relative to the flows folder; saved on its own, apart from the recipe. */
export function PromptFileEditor({ path, onClose }: { path: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const file = useQuery(promptQuery(path));
  const save = useMutation({
    mutationFn: (text: string) => savePrompt(path, text, file.data?.version ?? null),
    onSuccess: (f) => {
      queryClient.setQueryData(promptQuery(path).queryKey, f);
      void queryClient.invalidateQueries({ queryKey: ['check'] }); // a new file can clear a "not a file" error
    },
  });
  if (file.isPending) return null;
  if (file.isError) return <Editor title={path} note="cannot open" text="" error={file.error.message} onSave={() => {}} onClose={onClose} />;
  return (
    <Editor
      title={path}
      note={file.data.version === null ? 'new file — saving creates it' : 'the file beside the flow; saved on its own'}
      text={file.data.text}
      busy={save.isPending}
      error={save.error?.message}
      onSave={(t) => save.mutate(t)}
      onClose={onClose}
    />
  );
}

/** The inline system prompt: a change goes into the recipe, saved with it. */
export function SystemPromptEditor({ text, onSave, onClose }: { text: string; onSave: (t: string) => void; onClose: () => void }) {
  return <Editor title="system prompt" note="inline in the flow; saved with it" text={text} onSave={onSave} onClose={onClose} />;
}
