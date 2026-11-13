import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAppSettings, updateAppSettings } from '../src/app-settings.ts';
import { loadFlow } from '../src/flow-config.ts';
import { internalFlowText } from '../src/internal-steps.ts';
import { APP_DEFAULTS, type InternalStep, INTERNAL_STEPS } from '../src/settings.ts';

const temp = () => realpathSync(mkdtempSync(join(tmpdir(), 'fb-internal-')));

test('internal steps: each loads from any folder with the app’s settings applied, and keeps its fixed tools', () => {
  for (const id of Object.keys(INTERNAL_STEPS) as InternalStep[]) {
    const dir = temp();
    writeFileSync(join(dir, 'task.md'), 'Analyse this.\n');
    const cfg = { adapter: 'opencode' as const, model: 'openrouter/deepseek/deepseek-v4.1-flash', effort: 'low' as const, budgetUsd: 0.1 };
    writeFileSync(join(dir, `${id}.yaml`), internalFlowText(id, cfg));
    const r = loadFlow(`${id}.yaml`, dir, { folder: dir, task: 'task.md' });
    assert.ok(r.ok, r.ok ? '' : r.errors.join('\n'));
    const [step] = Object.values(r.config.steps);
    assert.equal(r.config.budgetUsd, 0.1);
    assert.ok(step.kind === 'ai');
    assert.equal(step.run.adapter, 'opencode');
    assert.equal(step.run.spec.model, cfg.model);
    assert.equal(step.run.spec.effort, 'low');
    assert.ok(step.run.spec.toolPolicy?.deny?.includes('Bash'), `${id} must never get a shell`);
    // The defaults load too: what a fresh install runs.
    writeFileSync(join(dir, `${id}.yaml`), internalFlowText(id, APP_DEFAULTS.internal[id]));
    assert.ok(loadFlow(`${id}.yaml`, dir, { folder: dir, task: 'task.md' }).ok);
  }
});

test('internal settings: saved app-wide; a model its harness would refuse, or no budget, is refused', () => {
  const data = temp();
  const internal = { ...APP_DEFAULTS.internal, 'backlog-importer': { adapter: 'claude-code' as const, model: 'sonnet', effort: 'low' as const, budgetUsd: 1 } };
  assert.ok(updateAppSettings(data, { internal }).ok);
  assert.deepEqual(readAppSettings(data).internal, internal);
  const bad = (step: unknown) => updateAppSettings(data, { internal: { ...internal, 'repo-analyst': step as typeof internal['repo-analyst'] } });
  assert.deepEqual(bad({ adapter: 'opencode', model: 'sonnet', effort: null, budgetUsd: 1 }), { ok: false, status: 400, error: 'providerID/modelID, like openrouter/deepseek/deepseek-v4.1-flash' });
  assert.deepEqual(bad({ adapter: 'claude-code', model: 'sonnet', effort: null, budgetUsd: 0 }), { ok: false, status: 400, error: 'a dollar amount above 0' });
});
