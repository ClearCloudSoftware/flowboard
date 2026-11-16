/**
 * Knowledge assets: maps of a project's code that agents query instead of reading every file, kept in the repo's
 * `.lamproom/knowledge/` (out of commits). graphify's code graph (`graphify update`: parsed, no AI calls) and Serena's
 * symbol index, built by one shell step run like any run of the project (`knowledge-run.ts`), so in its sandbox: on
 * this machine through `uvx` for a Trusted project, else in a box from the image, which carries both tools and Serena's
 * language servers (`docker/Dockerfile`). No Node imports: the pages use this module too.
 */
import type { ToolServer } from '@lamproom/core';

/** The versions Lamproom runs, here and in `docker/Dockerfile`. */
export const GRAPHIFY_FROM = 'graphifyy==0.7.5';
export const SERENA_FROM = 'git+https://github.com/oraios/serena@5e4f5cd173c7ff3eed37ee3f1de6c266b937c5dc';
export const KNOWLEDGE_DIR = '.lamproom/knowledge';
/** graphify's summary, the file agents are pointed at. */
export const GRAPH_REPORT = `${KNOWLEDGE_DIR}/graphify-out/GRAPH_REPORT.md`;
/** Serena's project file for the repo, which exists once an index is built (Lamproom's config puts it here). */
export const SERENA_PROJECT = `${KNOWLEDGE_DIR}/serena/project.yml`;

/**
 * The project file Lamproom gives Serena, whole: read-only (no editing, shell or memory-writing tool), the two
 * languages the image has servers for, and no tool, mode or prompt keys, which a repo could use to put tools back.
 */
export const SERENA_PROJECT_YML = 'language_servers: [typescript, python]\nread_only: true\nignore_all_files_in_gitignore: true\n';

/** What the pages say about a project's maps. `commit`: the one its last build mapped; `tip`: the base branch's now. */
export interface KnowledgeView { status: 'off' | 'never' | 'building' | 'built' | 'stale' | 'failed'; run?: string; commit?: string | null; tip?: string; error?: string }

/** The build step's last line when one asked-for map failed; the pages show what follows it. */
export const FAILED = '-- knowledge build failed: ';

const q = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

/**
 * The build's shell script, run in the repo's top folder. `host`: on this machine, with Lamproom's Serena home;
 * absent: in a box, where the tools are on PATH. Each map's output is kept and shown; `stamp.json` records the commit
 * and what was made, for agents to read. A map asked for that failed is said on the last line, not by the exit code.
 * The folder is deleted first, so nothing a repo or an earlier run left there survives a build: a `project.local.yml`
 * that hands agents Serena's shell and editing tools, or a `GRAPH_REPORT.md` agents would take for Lamproom's map.
 * Serena's `project.yml` is Lamproom's (`SERENA_PROJECT_YML`), written before Serena indexes: with none, Serena would
 * write its own, or use a `.serena/` the repo ships.
 */
export function buildCommand(kn: { graphify: boolean; serena: boolean }, commit: string | null, host?: { serenaHome: string }): string {
  const graphify = host ? `uvx -q --from ${GRAPHIFY_FROM} graphify` : 'graphify';
  const serena = host ? `SERENA_HOME=${q(host.serenaHome)} uvx -q --from ${SERENA_FROM} serena` : 'lr-serena';
  const K = KNOWLEDGE_DIR;
  // Runs `cmd` with its output in a log, shown after; a failure adds the tool and its last line to $failed.
  const step = (id: string, cmd: string, then: string) => [
    `if ${cmd} > "${K}/${id}.log" 2>&1; then ${then}; else failed="$failed; ${id}: $(tail -n 1 "${K}/${id}.log")"; fi`,
    `cat "${K}/${id}.log"`,
  ];
  return [
    'set -u',
    `rm -rf "${K}"`,
    `mkdir -p "${K}"`,
    'failed=""; graphify=false; serena=false',
    // From inside the knowledge folder: graphify writes its manifest into ./graphify-out whatever GRAPHIFY_OUT says
    ...(kn.graphify ? step('graphify', `(repo="$PWD"; cd "${K}" && GRAPHIFY_OUT="$repo/${K}/graphify-out" GRAPHIFY_FORCE=1 ${graphify} update "$repo")`, 'graphify=true') : []),
    ...(kn.serena
      ? [
          `mkdir -p "${K}/serena"`,
          `printf '%s' ${q(SERENA_PROJECT_YML)} > "${K}/serena/project.yml"`,
          ...step('serena', `${serena} project index . --log-level WARNING`, 'serena=true'),
          // Serena writes its list of files it could not index into the repo's .serena/; it belongs beside the index
          `if [ -f .serena/logs/indexing.txt ]; then mv .serena/logs/indexing.txt "${K}/serena/indexing-failures.txt"; rmdir .serena/logs .serena 2>/dev/null; fi`,
        ]
      : []),
    `printf '{"commit":%s,"builtAt":"%s","graphify":%s,"serena":%s}\\n' ${q(JSON.stringify(commit))} "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$graphify" "$serena" > "${K}/stamp.json"`,
    // Exit 0 either way: a failed shell step with nowhere to go waits at a gate for a person, holding the folder.
    `if [ -n "$failed" ]; then echo "${FAILED}\${failed#; }"; else echo "-- knowledge built at ${commit ? commit.slice(0, 7) : 'a repo with no commits'}"; fi`,
  ].join('\n');
}

/** Serena's MCP server as agents get it: one project, read-only tools, no onboarding or memories to write. */
export const SERENA_SERVE = (repoPath: string) => ['start-mcp-server', '--project', repoPath, '--context', 'ide', '--mode', 'planning', '--mode', 'no-onboarding', '--mode', 'no-memories', '--log-level', 'WARNING'];

/**
 * Serena for an agent step: on this machine through `uvx` (found on `path`) with Lamproom's Serena home; in a box
 * through the image's `lr-serena`. The env is given whole, as an MCP server may get only what is listed.
 */
export function serenaTool(where: 'host' | 'box', repoPath: string, serenaHome: string, env: { PATH?: string; HOME?: string } = {}): ToolServer {
  return where === 'host'
    ? { name: 'serena', command: 'uvx', args: ['-q', '--from', SERENA_FROM, 'serena', ...SERENA_SERVE(repoPath)], env: { PATH: env.PATH ?? '', HOME: env.HOME ?? '', SERENA_HOME: serenaHome } }
    : { name: 'serena', command: '/usr/local/bin/lr-serena', args: SERENA_SERVE(repoPath), env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp' } };
}

/** What an agent is told about graphify's map. */
export const graphifyLine = (repoPath: string, commit: string | null | undefined) =>
  `Lamproom's map of this repo's code (graphify, built at ${commit ? commit.slice(0, 7) : 'an unknown commit'}; it may be older than the code): ${repoPath}/${GRAPH_REPORT}, with graph.json beside it.`;
