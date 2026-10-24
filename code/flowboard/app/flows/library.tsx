'use client';
/** The library rail: every recipe in the flows folder, searchable, and a name field to start a new one. */
import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import type { Library as Flows } from './api.ts';
import { NAME, shape } from './draft.ts';
import { Glyph } from './icons.tsx';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ceiling = (b: number | null) => (b === null ? 'no budget set' : b === 0 ? 'no ceiling' : `$${b.toFixed(2)} ceiling`);

export function Library({ flows, open, onOpen, onCreate, creating, createError }: {
  flows: Flows | undefined;
  open: string | undefined;
  onOpen: (name: string) => void;
  onCreate: (name: string) => void;
  creating: boolean;
  createError: string | undefined;
}) {
  const [query, setQuery] = useState('');
  const all = flows?.flows ?? [];
  const q = query.trim().toLowerCase();
  const hits = all.filter((f) => !q || `${f.name} ${f.description}`.toLowerCase().includes(q));
  const nameCheck = (v: string) => (!NAME.test(v) ? 'lowercase letters, digits, - and _ only' : all.some((f) => f.name === v) ? 'a flow has that name' : undefined);
  const form = useForm({
    defaultValues: { name: '' },
    onSubmit: ({ value, formApi }) => {
      onCreate(value.name);
      formApi.reset();
    },
  });

  return (
    <aside className="pane lib">
      <div className="ph">
        <span className="lbl">flow library</span>
        <span className="sp" />
        <span className="lbl">{plural(all.length, 'flow')}</span>
      </div>
      <div className="fl-search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search flows…" aria-label="Search flows" autoComplete="off" />
      </div>
      <div className="fl-list">
        {hits.map((f) => (
          <button key={f.name} type="button" className={`fl-gh${f.name === open ? ' on' : ''}`} aria-current={f.name === open || undefined} onClick={() => onOpen(f.name)}>
            <Glyph shape={shape(f.steps, f.edges)} />
            <span className="fl-nm">
              <b>{f.name}</b>
              <span>{f.description || `${f.name}.yaml`}</span>
            </span>
            {f.errors > 0 ? <span className="fl-count">{plural(f.errors, 'problem')}</span> : <span className="fl-one">{f.name === open ? 'open now' : ''}</span>}
            <span className="fl-stats">
              {plural(f.steps.length, 'step')}
              <span className="sep">·</span>
              {plural(f.gates, 'gate')}
              <span className="sep">·</span>
              {ceiling(f.budgetUsd)}
            </span>
          </button>
        ))}
        {hits.length === 0 && (
          <div className="in-empty">{all.length ? 'No flow matches that. Clear the search.' : `No flows in ${flows?.dir ?? 'the flows folder'} yet. Name one below to start.`}</div>
        )}
      </div>
      <form
        className="fl-new"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name" validators={{ onChange: ({ value }) => (value ? nameCheck(value) : undefined), onSubmit: ({ value }) => (value ? nameCheck(value) : 'name the new flow') }}>
          {(f) => (
            <>
              <input
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
                placeholder="new-flow-name"
                aria-label="New flow name"
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className="act" disabled={creating}>
                New flow
              </button>
              {(f.state.meta.errors.length > 0 || createError) && <em className="in-err">{String(f.state.meta.errors[0] ?? createError)}</em>}
            </>
          )}
        </form.Field>
      </form>
    </aside>
  );
}
