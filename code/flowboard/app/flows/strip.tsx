'use client';
/** The validation strip: `run-flow --check` on the draft, one button per problem, and what is in the way of a save. */
import { useReactFlow } from '@xyflow/react';
import type { FlowCheck } from './api.ts';
import { stepsOf, target } from './draft.ts';
import type { Draft } from './draft.ts';
import { editor } from './editor.ts';
import { OkIcon, WarnIcon } from './icons.tsx';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const field = (line: string) => line.slice(0, line.indexOf(': '));
const message = (line: string) => line.slice(line.indexOf(': ') + 2);

export function Strip({ check, checking, draft, refusal, run }: {
  check: FlowCheck | undefined;
  checking: boolean;
  draft: Draft | null;
  refusal: string | undefined;
  run: string | undefined;
}) {
  const flow = useReactFlow();
  /** Selects what the line is about, so it can be fixed without hunting for it. */
  const pick = (line: string) => {
    const t = target(line);
    if ('step' in t && draft && t.step in stepsOf(draft)) {
      editor.actions.select({ step: t.step });
      void flow.fitView({ nodes: [{ id: t.step }], duration: 150, maxZoom: 1 });
    } else editor.actions.select('edge' in t ? { edge: t.edge } : null);
  };
  const row = (line: string, tone: string) => (
    <button key={`${tone}:${line}`} type="button" className={`vl-p ${tone}`} onClick={() => pick(line)}>
      <WarnIcon />
      <b>{field(line)}</b>
      <span>{message(line)}</span>
    </button>
  );
  const errors = check?.errors ?? [];
  const warnings = check?.warnings ?? [];

  return (
    <section className={`vl${errors.length ? ' bad' : ''}`} aria-live="polite">
      {!check ? (
        <div className="vl-h">
          <span className="lbl">checking…</span>
        </div>
      ) : errors.length ? (
        <div className="vl-h">
          <span className="lbl">won&rsquo;t save — {plural(errors.length, 'problem')}</span>
          <span className="sans">run-flow would refuse this recipe; click a problem to go to it</span>
          {checking && <span className="lbl">checking…</span>}
        </div>
      ) : (
        <div className="vl-h">
          <span className="vl-ok">
            <OkIcon />
          </span>
          <span className="lbl plain">This recipe holds together: run-flow --check passes it{warnings.length ? `, with ${plural(warnings.length, 'warning')}` : ''}.</span>
          {checking && <span className="lbl">checking…</span>}
          <span className="sp" />
          {run && <code className="run">{run}</code>}
        </div>
      )}
      {(refusal || errors.length > 0 || warnings.length > 0) && (
        <div className="vl-list">
          {refusal && (
            <div className="vl-p fail" role="alert">
              <WarnIcon />
              <b>not saved</b>
              <span>{refusal}</span>
            </div>
          )}
          {errors.map((l) => row(l, 'wait'))}
          {warnings.map((l) => row(l, 'note'))}
        </div>
      )}
    </section>
  );
}
