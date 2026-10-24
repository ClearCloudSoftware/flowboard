# Running flows in Docker

Two ways. Neither has the egress proxy yet (see `docs/FlowBoard/Sandboxing/Sandboxing Roadmap.md`): agents' keys are inside their box.

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
