# lr-run-flow and lr-run-agent in one container: the CLI, its agents and their questions all inside the box.
# Build from code/lamproom:  docker build -f docker/Dockerfile -t lamproom:cli .
# Also the `sandbox: { image: lamproom:cli }` image for per-step boxes: it has sh, git, node, pnpm, both agent CLIs,
# graphify and Serena, and ripgrep, which OpenCode's glob and grep tools run (without it they fail with "ripgrep
# execution failed").
FROM node:24.11.1-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates ripgrep && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@10.23.0 @anthropic-ai/claude-code@2.1.302 opencode-ai@1.19.3 && npm cache clean --force
# Knowledge assets (knowledge.ts): graphify maps the code (no AI calls) and Serena indexes its symbols, both offline in
# a box, so their tools and Serena's TypeScript/JavaScript and Python language servers are baked in. uv brings its own
# Python. lr-serena runs Serena with Lamproom's config from a writable home.
COPY --from=ghcr.io/astral-sh/uv:0.9.10 /uv /uvx /usr/local/bin/
ENV UV_TOOL_DIR=/opt/uv/tools UV_TOOL_BIN_DIR=/usr/local/bin UV_PYTHON_INSTALL_DIR=/opt/uv/python SERENA_HOME=/opt/serena
COPY internal/knowledge/serena_config.yml /opt/serena/serena_config.yml
COPY docker/lr-serena.sh /usr/local/bin/lr-serena
RUN uv tool install --python 3.12 graphifyy==0.7.5 \
 && uv tool install --python 3.12 "serena-agent @ git+https://github.com/oraios/serena@5e4f5cd173c7ff3eed37ee3f1de6c266b937c5dc" \
 && serena download-ls-dependencies typescript python \
 && rm -rf /opt/serena/logs /root/.cache && npm cache clean --force && chmod -R a+rX /opt/uv /opt/serena
WORKDIR /opt/lamproom
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
# ponytail: the CLI and its packages only, ~50 MB instead of ~1.4 GB. pnpm installs the workspace root's dependencies
# (the Next app's) whatever --filter says, so they are dropped from the root manifest and the lockfile is re-fitted
# (no --frozen-lockfile; its pinned versions are kept). The Agent SDK's bundled Claude binaries (glibc and musl, ~270 MB
# each) are skipped: the Claude provider always passes pathToClaudeCodeExecutable, the `claude` installed above.
RUN npm pkg delete dependencies devDependencies \
 && printf 'ignoredOptionalDependencies:\n  - "@anthropic-ai/claude-agent-sdk-*"\nsupportedArchitectures:\n  libc: [glibc]\n' >> pnpm-workspace.yaml \
 && pnpm install --prod && rm -rf "$(pnpm store path)" /root/.cache && chown -R node:node /opt/lamproom
# Serena would run pyright through uvx, which writes into the read-only /opt/uv/tools: it runs the installed one.
RUN sed -i 's|^ls_specific_settings: {}|ls_specific_settings: { python: { ls_path: /usr/local/bin/pyright-langserver } }|' /opt/serena/serena_config.yml \
 && grep -q pyright-langserver /opt/serena/serena_config.yml
USER node
ENV HOME=/home/node
WORKDIR /work
ENTRYPOINT ["node", "/opt/lamproom/packages/cli/src/flow-main.ts"]
