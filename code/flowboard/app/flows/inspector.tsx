'use client';
/** The inspector: the selected step, the selected route, or with nothing selected, the flow itself. */
import { useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { useForm } from '@tanstack/react-form';
import { useSelector } from '@tanstack/react-store';
import { entries, isRework } from '../../packages/core/src/flow/flow.ts';
import {
  conditionOf,
  edgesOf,
  flowDef,
  fromFlowValues,
  fromValues,
  NAME,
  remove,
  reworked,
  setCondition,
  setStep,
  stepsOf,
  target,
  toFlowValues,
  toValues,
  upstream,
} from './draft.ts';
import type { Condition, Draft } from './draft.ts';
import { editor, selectedStep } from './editor.ts';
import { WarnIcon } from './icons.tsx';

const ADAPTERS = ['claude-code', 'opencode'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
/** Claude Code's model aliases. OpenCode takes `provider/model`, so its field stays free text. */
const CLAUDE_MODELS = ['haiku', 'sonnet', 'opus'];
/** The flow-designer guide's words for each condition. */
const WHEN: Record<Condition, string> = {
  always: 'Unconditional. The moment the step before it finishes, this one becomes eligible.',
  on_pass: 'Only when the previous step reported success. This is the happy path out of a review or a health check.',
  on_fail: 'Only when it failed — and it usually points backwards, which is what makes a rework loop.',
};

const positive = (v: string) => (v === '' || Number(v) > 0 ? undefined : 'more than 0, or empty');
const whole = (v: string) => (v === '' || (Number.isInteger(Number(v)) && Number(v) > 0) ? undefined : 'a whole number above 0, or empty');
const typeName = (v: string) => (NAME.test(v) ? undefined : 'lowercase letters, digits, - and _ only');
const inFolder = (v: string) =>
  v.startsWith('/') || v.startsWith('~') || v.split(/[\\/]/).includes('..') ? 'a path inside the folder, relative to it' : undefined;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const cls = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

const Head = ({ kind, name }: { kind: string; name?: string }) => (
  <div className="ph">
    <span className="lbl">{kind}</span>
    <span className="sp" />
    {name && <span className="lbl ident">{name}</span>}
  </div>
);

function Row({ id, label, errors, children }: { id: string; label: string; errors?: unknown[]; children: ReactNode }) {
  const said = (errors ?? []).filter(Boolean).map(String);
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <span className="in-v">
        {children}
        {said.length > 0 && <em className="in-err">{said.join('; ')}</em>}
      </span>
    </>
  );
}

/** An input that adds one name to a list of chips on Enter, once `check` lets it. */
function AddChip({ id, placeholder, options, check, onAdd }: { id: string; placeholder: string; options?: string[]; check: (v: string) => string | undefined; onAdd: (v: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const add = () => {
    const v = value.trim();
    const problem = v ? check(v) : undefined;
    if (!v || problem) return setError(problem);
    onAdd(v);
    setValue('');
  };
  return (
    <span className="add">
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        list={options?.length ? `${id}-options` : undefined}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          setValue(e.target.value);
          setError(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          add();
        }}
      />
      {options?.length ? (
        <datalist id={`${id}-options`}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ) : null}
      {error && <em className="in-err">{error}</em>}
    </span>
  );
}

type TextKey = 'shell' | 'model' | 'prompt' | 'skill' | 'budget' | 'max_turns' | 'timeout' | 'attempts';

function StepPanel({ id, draft, problems }: { id: string; draft: Draft; problems: string[] }) {
  const step = stepsOf(draft)[id];
  // The form holds every field it shows, so each change is laid over the step as it was when selected: a field
  // emptied and filled again keeps its key's place in the file. Only this form edits a step's keys while it is open.
  const [selected] = useState(step);
  const form = useForm({
    defaultValues: toValues(id, step),
    listeners: {
      onChange: ({ formApi, fieldApi }) => {
        if (fieldApi.name === 'name') return; // a rename lands when the field is left
        const at = selectedStep(); // read now: a rename may have moved it since this field was drawn
        if (at !== undefined) editor.actions.edit((d) => setStep(d, at, fromValues(formApi.state.values, selected)));
      },
    },
  });
  const names = Object.keys(stepsOf(draft));
  const rename = (to: string) => {
    if (to !== id && NAME.test(to) && !names.includes(to)) editor.actions.rename(id, to);
  };
  const defaults = draft.defaults ?? {};
  const inherited = (v: unknown, none = 'not set') => (v === undefined ? none : `${String(v)} (flow default)`);
  const supplied = upstream(draft, id);
  const attempts = reworked(draft).has(id) || step.max_attempts !== undefined;

  const input = (name: TextKey, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}, check?: (v: string) => string | undefined) => (
    <form.Field name={name} validators={check && { onChange: ({ value }) => check(value) }}>
      {(f) => (
        <Row id={`f-${name}`} label={label} errors={f.state.meta.errors}>
          <input
            id={`f-${name}`}
            value={f.state.value}
            onChange={(e) => f.handleChange(e.target.value)}
            onBlur={f.handleBlur}
            spellCheck={false}
            autoComplete="off"
            {...props}
          />
        </Row>
      )}
    </form.Field>
  );
  const select = (name: 'adapter' | 'effort', label: string, options: string[], unset: string) => (
    <form.Field name={name}>
      {(f) => (
        <Row id={`f-${name}`} label={label}>
          <select id={`f-${name}`} value={f.state.value} onChange={(e) => f.handleChange(e.target.value)}>
            <option value="">{unset}</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Row>
      )}
    </form.Field>
  );
  const chips = (
    name: 'requires' | 'produces' | 'write_roots',
    o: { none: string; add: string; check: (v: string) => string | undefined; tone?: string; bad?: (t: string) => boolean; options?: string[] },
  ) => (
    <form.Field name={name} mode="array">
      {(f) => (
        <>
          <div className="chips">
            {f.state.value.map((t, i) => (
              <span key={`${t}-${i}`} className={cls('chip', o.tone, o.bad?.(t) && 'bad')}>
                {t}
                <button type="button" onClick={() => f.removeValue(i)} title={`Remove ${t}`} aria-label={`Remove ${t}`}>
                  ×
                </button>
              </span>
            ))}
            {f.state.value.length === 0 && <span className="chip">{o.none}</span>}
          </div>
          <AddChip
            id={`f-${name}`}
            placeholder={o.add}
            options={o.options?.filter((x) => !f.state.value.includes(x))}
            check={(v) => (f.state.value.includes(v) ? 'already listed' : o.check(v))}
            onAdd={(v) => f.pushValue(v)}
          />
        </>
      )}
    </form.Field>
  );

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <Head kind="step" name={id} />
      <div className="in-b">
        <div className="in-f">
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => (!NAME.test(value) ? 'lowercase letters, digits, - and _ only' : value !== id && names.includes(value) ? 'another step has that name' : undefined),
            }}
          >
            {(f) => (
              <Row id="f-name" label="Name" errors={f.state.meta.errors}>
                <input
                  id="f-name"
                  value={f.state.value}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => f.handleChange(e.target.value)}
                  onBlur={() => {
                    f.handleBlur();
                    rename(f.state.value);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && rename(f.state.value)}
                />
              </Row>
            )}
          </form.Field>
          <form.Field name="kind">
            {(f) => (
              <Row id="f-kind" label="Runs">
                <select id="f-kind" value={f.state.value} onChange={(e) => f.handleChange(e.target.value as 'agent' | 'shell')}>
                  <option value="agent">an agent</option>
                  <option value="shell">a shell command</option>
                </select>
              </Row>
            )}
          </form.Field>
        </div>
      </div>

      <form.Subscribe selector={(s) => [s.values.kind, s.values.adapter || defaults.adapter] as const}>
        {([kind, adapter]) =>
          kind === 'shell' ? (
            <div className="in-b">
              <div className="in-f">
                {input('shell', 'Command', { placeholder: 'pnpm test' })}
                {input('timeout', 'Timeout', { type: 'number', min: 1, step: 1, placeholder: '30 (minutes)' }, positive)}
              </div>
              <p className="in-note">Exit 0 is a pass, any other a fail. It runs in the run&rsquo;s folder, with no sandbox.</p>
            </div>
          ) : (
            <>
              <div className="in-b">
                <div className="in-f">
                  {select('adapter', 'Adapter', ADAPTERS, inherited(defaults.adapter))}
                  {input('model', 'Model', {
                    placeholder: inherited(defaults.model, adapter === 'opencode' ? 'provider/model' : 'sonnet'),
                    list: adapter === 'opencode' ? undefined : 'claude-models',
                  })}
                  {select('effort', 'Effort', EFFORTS, inherited(defaults.effort, "the model's own"))}
                  {input('budget', 'Budget', { type: 'number', min: 0.01, step: 0.1, placeholder: inherited(defaults.limits?.budget_usd) }, positive)}
                  {input('max_turns', 'Max turns', { type: 'number', min: 1, step: 1, placeholder: inherited(defaults.limits?.max_turns) }, whole)}
                  {input('timeout', 'Timeout', { type: 'number', min: 1, step: 1, placeholder: 'none (minutes)' }, positive)}
                </div>
                <datalist id="claude-models">
                  {CLAUDE_MODELS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="in-b">
                <div className="in-f">
                  {input('prompt', 'Prompt', { placeholder: inherited(defaults.prompt, 'prompts/step.md') })}
                  {input('skill', 'Skill', { placeholder: '/plugin:name' })}
                  <form.Field name="system_prompt">
                    {(f) => (
                      <Row id="f-system_prompt" label="System">
                        <textarea
                          id="f-system_prompt"
                          rows={3}
                          value={f.state.value}
                          placeholder="who the agent is, inline"
                          onChange={(e) => f.handleChange(e.target.value)}
                          onBlur={f.handleBlur}
                        />
                      </Row>
                    )}
                  </form.Field>
                </div>
                <p className="in-note">The prompt is a file beside the flow file. The run&rsquo;s task comes first, then the prompt.</p>
              </div>
            </>
          )
        }
      </form.Subscribe>

      <div className="in-b">
        <div className="in-f">
          <form.Field name="gate">
            {(f) => (
              <Row id="f-gate" label="Approval">
                <label className="check">
                  <input id="f-gate" type="checkbox" checked={f.state.value} onChange={(e) => f.handleChange(e.target.checked)} /> waits for you
                </label>
              </Row>
            )}
          </form.Field>
          {attempts && input('attempts', 'Attempts', { type: 'number', min: 1, step: 1, placeholder: '3' }, whole)}
        </div>
        {attempts && <p className="in-note">A rework route leads back here; this is how many times the step may run in all.</p>}
      </div>

      <div className="in-b">
        <div className="in-h">
          <span className="lbl">needs</span>
          <span className="sp" />
          <span className="lbl hint">files an earlier step must write</span>
        </div>
        {chips('requires', { none: 'nothing — it can start cold', add: 'add a type an earlier step makes', check: typeName, bad: (t) => !supplied.has(t), options: [...supplied] })}
        <div className="in-h gap">
          <span className="lbl">produces</span>
        </div>
        {chips('produces', { none: 'nothing', add: 'add a type it writes', check: typeName, tone: 'out' })}
        <form.Subscribe selector={(s) => s.values.kind}>
          {(kind) =>
            kind === 'agent' && (
              <>
                <div className="in-h gap">
                  <span className="lbl">may write</span>
                  <span className="sp" />
                  <span className="lbl hint">paths in the run&rsquo;s folder</span>
                </div>
                {chips('write_roots', { none: 'anywhere in the folder', add: 'add a path, like src', check: inFolder })}
              </>
            )
          }
        </form.Subscribe>
        {problems.length > 0 && (
          <div className="chip bad problems">
            <WarnIcon /> {plural(problems.length, 'problem')} — see the strip below
          </div>
        )}
      </div>
      <div className="in-b">
        <button
          type="button"
          className="act danger"
          onClick={() => {
            editor.actions.edit((d) => remove(d, [id]));
            editor.actions.select(null);
          }}
        >
          Delete this step
        </button>
      </div>
    </form>
  );
}

function RoutePanel({ index, draft }: { index: number; draft: Draft }) {
  const e = edgesOf(draft)[index];
  const condition = conditionOf(e);
  const rework = isRework(flowDef(draft), { ...e, condition });
  return (
    <div>
      <Head kind="route" name={`${e.from} → ${e.to}`} />
      <div className="in-b">
        <div className="in-f">
          <label htmlFor="f-when">When</label>
          <select id="f-when" value={condition} onChange={(ev) => editor.actions.edit((d) => setCondition(d, index, ev.target.value as Condition))}>
            <option value="always">always</option>
            <option value="on_pass">on_pass — it passed</option>
            <option value="on_fail">on_fail — it failed</option>
          </select>
        </div>
        <p className="in-note">{WHEN[condition]}</p>
        {rework && (
          <p className="in-note">
            This one points back, so it is a rework: when {e.from} fails, {e.to} runs again with what {e.from} wrote among its inputs, until {e.to} has used its attempts.
          </p>
        )}
      </div>
      <div className="in-b">
        <button
          type="button"
          className="act danger"
          onClick={() => {
            editor.actions.edit((d) => remove(d, [], [index]));
            editor.actions.select(null);
          }}
        >
          Delete this route
        </button>
      </div>
    </div>
  );
}

function FlowPanel({ draft, problems }: { draft: Draft; problems: string[] }) {
  const form = useForm({
    defaultValues: toFlowValues(draft),
    listeners: { onChange: ({ formApi }) => editor.actions.edit((d) => fromFlowValues(formApi.state.values, d)) },
  });
  const steps = Object.keys(stepsOf(draft));
  const starts = entries({ ...flowDef(draft), entry: undefined });
  const field = (name: 'model' | 'run_budget' | 'max_turns', label: string, props: InputHTMLAttributes<HTMLInputElement>, check?: (v: string) => string | undefined) => (
    <form.Field name={name} validators={check && { onChange: ({ value }) => check(value) }}>
      {(f) => (
        <Row id={`g-${name}`} label={label} errors={f.state.meta.errors}>
          <input id={`g-${name}`} value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} spellCheck={false} autoComplete="off" {...props} />
        </Row>
      )}
    </form.Field>
  );
  const choose = (name: 'adapter' | 'effort' | 'entry', label: string, options: string[], unset: string) => (
    <form.Field name={name}>
      {(f) => (
        <Row id={`g-${name}`} label={label}>
          <select id={`g-${name}`} value={f.state.value} onChange={(e) => f.handleChange(e.target.value)}>
            <option value="">{unset}</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Row>
      )}
    </form.Field>
  );
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <Head kind="flow" />
      <div className="in-empty">Select a step on the canvas to edit it.</div>
      <div className="in-b">
        <div className="in-f">
          <form.Field
            name="budget"
            validators={{ onChange: ({ value }) => (value === '' ? 'required; 0 for no ceiling' : Number(value) >= 0 ? undefined : '0 or more') }}
          >
            {(f) => (
              <Row id="g-budget" label="Budget" errors={f.state.meta.errors}>
                <input id="g-budget" type="number" min={0} step={0.5} value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} />
              </Row>
            )}
          </form.Field>
          {choose('entry', 'Starts at', steps, starts.length === 1 ? `${starts[0]}, by its routes` : 'the step no route leads into')}
        </div>
        <p className="in-note">The most the whole flow may spend, in dollars, every retry and rework included; 0 means no ceiling.</p>
      </div>
      <div className="in-b">
        <div className="in-h">
          <span className="lbl">defaults</span>
          <span className="sp" />
          <span className="lbl hint">every agent step starts from these</span>
        </div>
        <div className="in-f">
          {choose('adapter', 'Adapter', ADAPTERS, 'not set')}
          {field('model', 'Model', { placeholder: 'not set', list: 'claude-models-flow' })}
          {choose('effort', 'Effort', EFFORTS, "the model's own")}
          {field('run_budget', 'Budget', { type: 'number', min: 0.01, step: 0.1, placeholder: 'per run, not set' }, positive)}
          {field('max_turns', 'Max turns', { type: 'number', min: 1, step: 1, placeholder: 'not set' }, whole)}
        </div>
        <datalist id="claude-models-flow">
          {CLAUDE_MODELS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {problems.length > 0 && (
          <div className="chip bad problems">
            <WarnIcon /> {plural(problems.length, 'problem')} with the flow — see the strip below
          </div>
        )}
      </div>
    </form>
  );
}

export function Inspector({ errors }: { errors: string[] }) {
  const draft = useSelector(editor, (s) => s.draft);
  const selection = useSelector(editor, (s) => s.selection);
  const generation = useSelector(editor, (s) => s.generation);
  if (!draft) {
    return (
      <>
        <Head kind="step" />
        <div className="in-empty">This file cannot be drawn. Fix it by hand; the strip below says what is wrong.</div>
      </>
    );
  }
  if (selection && 'step' in selection && selection.step in stepsOf(draft)) {
    const about = errors.filter((l) => {
      const t = target(l);
      return 'step' in t && t.step === selection.step;
    });
    return <StepPanel key={generation} id={selection.step} draft={draft} problems={about} />;
  }
  if (selection && 'edge' in selection && edgesOf(draft)[selection.edge]) return <RoutePanel index={selection.edge} draft={draft} />;
  return <FlowPanel key={generation} draft={draft} problems={errors.filter((l) => 'flow' in target(l))} />;
}
