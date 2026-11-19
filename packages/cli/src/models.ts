/**
 * OpenCode's two model sources, OpenRouter (`openrouter.ts`) and Ollama on this machine (`ollama.ts`), as one set of
 * rules against the approved list (`AppSettings.opencodeModels`). Sources are told apart by their id's prefix.
 */
import { readAppSettings } from './app-settings.ts';
import type { ModelRules } from './config.ts';
import { localModels, ollamaConfig, readOllamaList, refreshOllama, type OllamaState } from './ollama.ts';
import { applySavedKey, readCatalogue, refreshCatalogue } from './openrouter.ts';
import { isLocal, type LocalModels, modelProblem, modelWarning } from './settings.ts';

/**
 * The approved list's rules as the checks take them, against the saved lists (never fetched here: checks are sync).
 * `ollama`: what Ollama said at run start; absent, the list saved last, and Ollama counts as answering.
 */
export function modelRules(dataDir: string, ollama?: OllamaState): ModelRules {
  const approved = readAppSettings(dataDir).opencodeModels;
  const catalogue = readCatalogue(dataDir);
  const local: LocalModels = ollama ? localModels(ollama) : { models: readOllamaList(dataDir) };
  return { problem: (id) => modelProblem(id, approved, catalogue, local), warning: (id) => modelWarning(id, approved, catalogue, local) };
}

/**
 * What lr-run-agent and lr-run-flow do first: put the saved key where OpenCode finds it, ask each source the approved
 * models come from for its list (OpenRouter when stale, so a price rise is seen; Ollama every time, as it is local),
 * and hand back the rules to check the steps' models against.
 */
export async function prepareRun(dataDir: string, warn: (line: string) => void): Promise<ModelRules> {
  applySavedKey(dataDir);
  // A source nothing is approved from is not asked: no fetch, and no warning on an offline Claude run.
  const approved = readAppSettings(dataDir).opencodeModels;
  if (approved.some((m) => !isLocal(m.id))) {
    const { error } = await refreshCatalogue(dataDir);
    if (error) warn(`-- warning: ${error}; checking models against the list saved earlier`);
  }
  return modelRules(dataDir, approved.some((m) => isLocal(m.id)) ? await refreshOllama(dataDir) : undefined);
}

/**
 * The OpenCode config a step on `model` needs on top of its own, for a native capability pack: the `ollama` provider
 * for a local model, nothing for OpenRouter's (OpenCode knows it). Read from the saved list, so a resumed run has it.
 */
export const opencodeConfigFor = (dataDir: string) => (model: string, hostName?: string) => (isLocal(model) ? ollamaConfig(model, readOllamaList(dataDir), process.env, hostName) : undefined);
