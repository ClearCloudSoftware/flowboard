# Running flows in a sandbox

Three ways. Only the third keeps agents' edits and keys off this machine and their network to an allowlist; the
first two have no egress proxy, so agents' keys are inside their box.

## 1. Every step in its own container: `sandbox:`

```yaml
budget_usd: 1
sandbox: { image: flowboard-cli, env: [CLAUDE_CODE_OAUTH_TOKEN, OPENROUTER_API_KEY] }
steps: …
```

run-flow stays on this machine; each step runs in a throwaway `docker run --rm` container from `image`
(`flowboard-cli` has sh, git, node and both agent CLIs): uid 1000, no capabilities, read-only root with a
`/tmp` tmpfs, at most 512 processes. The run's `folder` and artifacts folder are mounted read-write at the
same paths. `sandbox.env` names the variables passed in; nothing else from this machine's env goes in.

- **Shell steps** are offline (`--network none`).
- **AI steps** are online: agents need their model APIs, and there is no egress proxy yet. They also see
  FlowBoard's own code read-only (the ask_user shim, OpenCode's guard plugin), the step's plugin folders,
  and a per-run temp folder. `ask_user` reaches run-flow over TCP on `host.docker.internal` with a per-run
  token: Docker Desktop cannot pass a Unix socket through a bind mount.
- **OpenCode** listens inside its box; its port is published on 127.0.0.1 only, behind its password.
- **Auth:** your Claude login is in the macOS keychain, which a container cannot read. Run `claude
  setup-token` and export the token as `CLAUDE_CODE_OAUTH_TOKEN`. OpenCode needs `OPENROUTER_API_KEY` (or
  your provider's key) in the env, not in `~/.local/share/opencode/auth.json`.
- A `folder` that contains FlowBoard's own code sees that part read-only.

## 2. The whole CLI in one container

```sh
docker build -f docker/Dockerfile -t flowboard-cli .          # from code/flowboard
docker run --rm -it -v "$PWD/my-flow:/work" \
  -e CLAUDE_CODE_OAUTH_TOKEN -e OPENROUTER_API_KEY \
  flowboard-cli flow.yaml
```

Everything runs inside the container: run-flow, the agents, and the socket between them. Gates and agents'
questions come to your terminal through `-it`. Limits:

- **Claude auth.** Your login is in the macOS keychain, which the container cannot read. Make a token with
  `claude setup-token` and pass it as `CLAUDE_CODE_OAUTH_TOKEN`.
- **Keys are inside the box**, and the network is open: there is no egress proxy yet.
- **One box for all steps.** A step can touch the flow's state and other steps' files.
- Mount the flow's base folder (`folder`, `task`, prompts): paths in the YAML resolve inside the container.

## 3. The whole run in one OpenSandbox box: `runtime: opensandbox`

```yaml
budget_usd: 1
sandbox: { runtime: opensandbox, image: flowboard-sandbox }
steps: …
```

run-flow stays on this machine. One OpenSandbox sandbox per run holds the folder's **last commit** at the
folder's own path, and every step runs there as uid 1000. Nothing an agent does touches the folder here:

- **Network:** deny by default. `sandbox.egress` lists the hosts allowed; by default, the API hosts of the
  steps' adapters (`api.anthropic.com` for claude-code, `openrouter.ai` for `openrouter/` models). Host
  names or `*.domain` only; IP addresses are not supported. Add `registry.npmjs.org` if a step installs.
- **Keys:** `sandbox.credentials` (by default the same adapters' keys: `CLAUDE_CODE_OAUTH_TOKEN`,
  `OPENROUTER_API_KEY`) are read from this machine's env. The box gets fakes; the server's credential vault
  puts the real value on requests to that key's host. A key that is not set is a warning.
- **`ask_user`** reaches run-flow through a tunnel in the box's relay: the box cannot dial this machine.
- **The end:** a done or failed flow writes `<run folder>/changes.patch` and removes the box. Review it, then
  `git -C <folder> apply <run folder>/changes.patch`. A paused or stopped flow keeps its box (24 h) for
  `--resume`, which refuses if the box has gone.
- Uncommitted edits in the folder are not in the box: commit first (run-flow refuses a dirty folder anyway).
- Dependencies (`node_modules` and the like) are not in a commit: install them in a first shell step.

**The server.** Run it yourself, for example with the spike's config:

```sh
uvx opensandbox-server init-config ./sandbox.toml --example docker
# then in sandbox.toml:
#   [server]  api_key = "<a long random string>"
#   [docker]  publish_host = "127.0.0.1"      # the default publishes sandbox ports on every interface
#   [egress]  mode = "dns+nft"                # the credential vault refuses dns-only mode
uvx opensandbox-server --config sandbox.toml
docker pull opensandbox/execd:v1.1.0 && docker pull opensandbox/egress:v1.1.7   # the first create waits on these
export OPENSANDBOX_DOMAIN=127.0.0.1:8080 OPENSANDBOX_API_KEY=<the api_key>
```

**The image.** OpenSandbox runs its execd as the image's user, so `flowboard-sandbox` leaves the user root;
run-flow lays out the host paths as root and starts every step as uid 1000. FlowBoard's own code (the
`ask_user` shim, OpenCode's guard plugin) comes from the image's `/opt/flowboard`, so rebuild both images
after changing FlowBoard:

```sh
docker build -f docker/Dockerfile -t flowboard-cli . && docker build -f docker/Dockerfile.opensandbox -t flowboard-sandbox docker
```

Background and measurements: `docs/FlowBoard/Sandboxing/OpenSandbox Spike.md`.
