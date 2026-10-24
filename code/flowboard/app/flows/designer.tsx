'use client';
/**
 * The flow designer (docs/FlowBoard/Flow Design/Flow Design Screen.md): a library rail, the canvas, the inspector,
 * and a validation strip that stands between the draft and Save. What it edits is a run-flow recipe file.
 */
import { useEffect, useEffectEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '@tanstack/react-pacer';
import { useSelector } from '@tanstack/react-store';
import { ReactFlowProvider } from '@xyflow/react';
import { ApiError, checkQuery, createFlow, flowQuery, libraryQuery, saveFlow } from './api.ts';
import type { FlowFile } from './api.ts';
import { Canvas } from './canvas.tsx';
import { addStep, conditionOf, edgesOf, stepsOf, toDraft } from './draft.ts';
import { editor, selectedStep } from './editor.ts';
import { Inspector } from './inspector.tsx';
import { Library } from './library.tsx';
import { Strip } from './strip.tsx';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const isField = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);

export function Designer() {
  const queryClient = useQueryClient();
  const library = useQuery(libraryQuery);
  const file = useSelector(editor, (s) => s.file);
  const draft = useSelector(editor, (s) => s.draft);
  const base = useSelector(editor, (s) => s.base);
  const unreadable = useSelector(editor, (s) => s.unreadable);
  const json = draft ? JSON.stringify(draft) : '';
  const dirty = draft !== null && json !== base;
  const [view, setView] = useState<'canvas' | 'yaml'>('canvas');
  const [notice, setNotice] = useState<string>();

  // The live check: the draft, debounced, through the same loader as `run-flow --check`. Name and draft are debounced
  // together, so a flow just opened is never checked with the last one's draft.
  const current = file && draft ? `${file.name}:${json}` : '';
  const [checked] = useDebouncedValue(current, { wait: 250 });
  const at = checked.indexOf(':'); // a flow name has no colon
  const check = useQuery({ ...checkQuery(checked.slice(0, at), checked.slice(at + 1)), enabled: checked !== '' && checked === current });
  // A draft checked before, the one a flow opens with included, has its answer at once.
  const known = file && draft ? queryClient.getQueryData(checkQuery(file.name, json).queryKey) : undefined;
  const result = draft === null ? file ?? undefined : known ?? check.data;
  const checking = draft !== null && !known && (checked !== current || check.isFetching);

  /** A file's own check is its draft's check as read: seeded, so opening a recipe costs one request, not two. */
  const seed = (f: FlowFile) => {
    const d = toDraft(f.raw);
    if (typeof d !== 'string') queryClient.setQueryData(checkQuery(f.name, JSON.stringify(d)).queryKey, { text: f.text, check: f.check });
    queryClient.setQueryData(flowQuery(f.name).queryKey, f);
  };

  const save = useMutation({
    mutationFn: () => saveFlow(file!.name, editor.state.draft, file!.version),
    onSuccess: (f) => {
      seed(f);
      editor.actions.reread(f);
      void queryClient.invalidateQueries({ queryKey: libraryQuery.queryKey });
    },
    // Refused because the file changed on disk: read it again, so the notice can offer to load it.
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409 && file) void queryClient.invalidateQueries({ queryKey: flowQuery(file.name).queryKey });
    },
  });

  const load = (f: FlowFile) => {
    seed(f);
    save.reset();
    editor.actions.open(f);
    window.history.replaceState(null, '', `?flow=${f.name}`);
  };
  const leave = () => !dirty || window.confirm(`Discard your changes to ${file?.name}.yaml?`);

  const open = async (name: string) => {
    if (name === file?.name || !leave()) return;
    try {
      load(await queryClient.fetchQuery({ ...flowQuery(name), staleTime: 0 }));
      setNotice(undefined);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };

  // On arrival: the flow the address names, else the first in the library.
  const names = library.data?.flows.map((f) => f.name) ?? [];
  const asked = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('flow');
  const first = file ? undefined : (names.find((n) => n === asked) ?? names[0]);
  const arrival = useQuery({ ...flowQuery(first ?? ''), enabled: first !== undefined });
  const arrive = useEffectEvent((f: FlowFile) => {
    if (!editor.state.file) load(f);
  });
  useEffect(() => {
    if (arrival.data) arrive(arrival.data);
  }, [arrival.data]);

  // Edited by hand while open: read again when there is nothing to lose; otherwise say so, as a save would be refused.
  const disk = useQuery({ ...flowQuery(file?.name ?? ''), enabled: file !== null });
  const changed = disk.data !== undefined && file !== null && disk.data.name === file.name && disk.data.version !== file.version;
  const reread = useEffectEvent((f: FlowFile) => {
    if (dirty) return;
    seed(f);
    editor.actions.reread(f);
  });
  useEffect(() => {
    if (changed && disk.data) reread(disk.data);
  }, [changed, disk.data]);

  const canSave = dirty && !checking && result?.check.errors.length === 0 && !save.isPending && !changed;

  const create = useMutation({
    mutationFn: createFlow,
    onSuccess: (f) => {
      void queryClient.invalidateQueries({ queryKey: libraryQuery.queryKey });
      load(f);
      setNotice(undefined);
    },
  });

  const keys = useEffectEvent((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (canSave) save.mutate();
    } else if (e.key === 'Escape' && !isField(e.target)) editor.actions.select(null);
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const stay = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', stay);
    return () => window.removeEventListener('beforeunload', stay);
  }, [dirty]);

  const plusStep = () => {
    if (!editor.state.draft) return;
    const [next, id] = addStep(editor.state.draft, selectedStep());
    editor.actions.edit(() => next);
    editor.actions.select({ step: id });
  };

  const dir = library.data?.dir ?? 'flows';
  const errors = result?.check.errors ?? [];
  const steps = draft ? Object.values(stepsOf(draft)) : [];
  const budget = draft?.budget_usd;
  const refusal = save.error?.message;

  return (
    <ReactFlowProvider>
      <div className={`fd${dirty ? ' dirty' : ''}`}>
        <header className="topbar">
          <div className="brand">
            flowboard<em>/</em>
            <span>flows</span>
          </div>
          {file && (
            <span className="vchip">
              <b>{file.name}</b>
              <span className="lbl ident">
                {dir}/{file.name}.yaml
              </span>
              <span className="lbl">{dirty ? 'edited — not saved' : 'saved'}</span>
            </span>
          )}
          <span className="sp" />
          <button type="button" className="act" onClick={plusStep} disabled={!draft}>
            + Step
          </button>
          <button type="button" className="act primary" onClick={() => save.mutate()} disabled={!canSave} title="Save (⌘S)">
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </header>

        {(notice || (changed && dirty)) && (
          <div className="notice" role="status">
            {notice ?? `${file?.name}.yaml changed on disk while you were editing it, so Save would be refused.`}
            <span className="sp" />
            {changed && dirty && disk.data && (
              <button type="button" className="act" onClick={() => window.confirm('Drop your edit and load the file as it is on disk?') && load(disk.data!)}>
                Load the file from disk
              </button>
            )}
          </div>
        )}

        <div className="body">
          <Library
            flows={library.data}
            open={file?.name}
            onOpen={(name) => void open(name)}
            onCreate={(name) => leave() && create.mutate(name)}
            creating={create.isPending}
            createError={create.error?.message}
          />

          <main className="pane cv-pane">
            <div className="ph">
              <span className="tabs" role="group" aria-label="View">
                <button type="button" aria-pressed={view === 'canvas'} onClick={() => setView('canvas')}>
                  canvas
                </button>
                <button type="button" aria-pressed={view === 'yaml'} onClick={() => setView('yaml')}>
                  yaml
                </button>
              </span>
              <span className="sp" />
              <span className="hint">
                {view === 'yaml' ? (dirty ? 'what Save will write' : 'the file as saved') : 'drag to arrange · drag from a step’s right edge to route it · click to edit'}
              </span>
            </div>
            {!file ? (
              <div className="in-empty">{library.isError ? library.error.message : library.data ? 'Pick a flow from the library, or name a new one.' : 'Loading…'}</div>
            ) : view === 'yaml' || !draft ? (
              <>
                {unreadable && <div className="notice">This file cannot be drawn: {unreadable}. Fix it by hand; the strip below says what is wrong.</div>}
                <pre className="yaml">{result?.text ?? file.text}</pre>
              </>
            ) : (
              <div className="cv-wrap">
                <Canvas key={file.name} draft={draft} errors={errors} />
              </div>
            )}
            {draft && (
              <div className="cv-bar">
                <span className="lbl">{plural(steps.length, 'step')}</span>
                <span className="sep">·</span>
                <span className="lbl">{plural(edgesOf(draft).filter((e) => conditionOf(e) !== 'always').length, 'conditional route')}</span>
                <span className="sep">·</span>
                <span className="lbl">{plural(steps.filter((s) => s.gate === 'approval').length, 'approval gate')}</span>
                <span className="sep">·</span>
                <span className="lbl">
                  {typeof budget !== 'number' ? 'no budget set' : budget === 0 ? 'no budget ceiling' : `budget $${budget.toFixed(2)} for the whole flow`}
                </span>
              </div>
            )}
          </main>

          <aside className="pane insp">
            <Inspector errors={errors} />
          </aside>
        </div>

        <Strip
          check={result?.check}
          checking={checking}
          draft={draft}
          refusal={refusal}
          run={file ? `pnpm run-flow --folder <dir> --task <file> ${dir}/${file.name}.yaml` : undefined}
        />
        <footer className="statusbar">
          <span>
            <b>{plural(library.data?.flows.length ?? 0, 'flow')}</b> in {dir}/<span className="sep">·</span>a run pins its own copy of the flow, so
            saving here never changes a run already started
          </span>
          <span className="keys">
            <span className="kbd">del</span> remove<span className="sep">·</span>
            <span className="kbd">esc</span> deselect<span className="sep">·</span>
            <span className="kbd">⌘S</span> save
          </span>
        </footer>
      </div>
    </ReactFlowProvider>
  );
}
