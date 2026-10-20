# Running flows in Docker

Two ways, until the per-step sandbox is complete (see `docs/FlowBoard/Sandboxing/Sandboxing Roadmap.md`).

## 1. Shell steps in a container: `sandbox:`

```yaml
folder: proj
task: task.md
sandbox: { image: flowboard-cli }   # any image with sh and what your checks need
steps: …
```

Each shell step runs in a throwaway `docker run --rm` container: offline (`--network none`), uid 1000, no
capabilities, read-only root with a `/tmp` tmpfs, at most 512 processes. Only `folder` and the run's
artifacts folder are mounted, at the same paths. Secrets are stripped from the env as on the host.

AI steps still run on the host, and `run-flow` warns you. Their `ask_user` tool talks to `run-flow` over a
Unix socket, and Docker Desktop on macOS cannot pass a socket through a bind mount (`connect: Not supported`).

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
