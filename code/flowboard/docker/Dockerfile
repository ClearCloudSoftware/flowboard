# run-flow and run-agent in one container: the CLI, its agents and their questions all inside the box.
# Build from code/flowboard:  docker build -f docker/Dockerfile -t flowboard-cli .
# Also a fine `sandbox: { image: flowboard-cli }` for shell steps: it has sh, git, node and pnpm.
FROM node:24.11.1-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@10.23.0 @anthropic-ai/claude-code@2.1.302 opencode-ai@1.19.3 && npm cache clean --force
WORKDIR /opt/flowboard
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
# ponytail: the CLI and its packages only; the Next app is not needed to run flows
RUN pnpm install --frozen-lockfile --filter @flowboard/cli... && chown -R node:node /opt/flowboard
USER node
ENV HOME=/home/node
WORKDIR /work
ENTRYPOINT ["node", "/opt/flowboard/packages/cli/src/flow-main.ts"]
