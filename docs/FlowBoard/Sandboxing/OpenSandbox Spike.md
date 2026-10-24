# OpenSandbox spike: findings

2026-10-24, macOS + Docker Desktop, `opensandbox-server` via `uvx`, execd v1.1.0, egress v1.1.7,
TypeScript SDK `@alibaba-group/opensandbox` 1.1.1. Each test is a script in this folder.

## The three questions

| Question | Answer | Evidence |
|---|---|---|
| 1. Can a running process's stdin be written to? | **Not through the command API**, but a live two-way stream works through the port gateway | `t2-stdin.mjs` |
| 2. Do an egress allowlist and the credential vault work for Claude? | **Yes** | `t1-basics.mjs`, `t3-vault.mjs` |
| 3. Can a real repo go in and out fast enough? | **Yes for files**; installing dependencies inside is slow on this machine, mostly not OpenSandbox's fault | `t4-repo.mjs` |

## Details

**Basics (t1).** A sandbox from the `flowboard-cli` image is ready in about 1.8 s once the execd and
egress images are pulled. Commands return exit codes and output (`exit 3` comes back as 3, with
`CommandExecError`). The process runs as uid 1000.

**Egress (t1).** Policy `defaultAction: deny` plus `allow api.anthropic.com`: Anthropic is reachable,
`example.com` fails with `ENOTFOUND`, and so does `host.docker.internal`, so the box cannot reach the Mac.
Rules are FQDNs or wildcards; IP/CIDR rules are not supported.

**Stdin (t2).** `RunCommandOpts` has no stdin, and neither do sessions. A server inside the box is
reachable from the host through the gateway (`http://127.0.0.1:<port>/proxy/<inner port>`), and it passes
an HTTP upgrade. A 20-line relay (`relay.cjs`) that pipes the upgraded socket to a child's stdin and stdout
gave a live, interleaved stream: each line came back before the next was sent. This is what the Claude
SDK needs. The gateway port had no auth of its own here, so a real relay must check a per-run token.

**Credential vault (t3).** It needs `[egress] mode = "dns+nft"` in the server config and
`credentialProxy: { enabled: true }` on the sandbox. OpenSandbox sets `NODE_EXTRA_CA_CERTS`,
`SSL_CERT_FILE` and `REQUESTS_CA_BUNDLE` to its MITM CA by itself. With a fake `CLAUDE_CODE_OAUTH_TOKEN`
inside, and the real one in a `bearer` binding for `api.anthropic.com`, `claude -p` answered. The real
token never entered the box, and vault reads return metadata only.

**Repo round trip (t4).** The whole repo, `git archive`d (1.6 MB, 1270 files), uploads in under 0.1 s and
unpacks in about 1 s. A `git diff` read back with `files.readFile` applies cleanly on the host.
`pnpm install` inside took 421 s with only `registry.npmjs.org` allowed. The same install in plain
`docker run` took 342 s, so most of that is this machine's link to the registry, and egress filtering adds
about 20%. Package tests inside: 343 pass, 2 fail. Plain Docker fails 1 of the same suite (the orphan
recovery test, which depends on the container environment). The second failure was not identified.

## Rough edges

- The SDK's default 30 s request timeout is shorter than the first create, which pulls the egress image.
  The client gave up, and the server cleaned up the half-made sandbox by itself later.
  Pre-pull `opensandbox/execd` and `opensandbox/egress`, or raise `requestTimeoutSeconds`.
- An empty `api_key` makes the server ask for confirmation (or `OPENSANDBOX_INSECURE_SERVER=YES`).
  Set one, and set `publish_host = "127.0.0.1"`: the default publishes sandbox ports on every interface.
- macOS `tar` adds `com.apple.provenance` attributes that Linux `tar` warns about; use `git archive`.
- One more service to run: the Python server, plus execd and an egress sidecar container per sandbox.

## What integrating it would mean

The design is an **OpenSandbox workspace adapter**, not just another `ExecHost`: one sandbox per run,
which holds the repo, so nothing is written on the Mac.

1. **Run start:** create the sandbox with the flow's egress allowlist and `credentialProxy`, create the
   vault from the host's keys, upload `git archive` of the folder, and make a base commit.
2. **Shell steps:** `commands.run` with streamed output and an exit code. A direct fit.
3. **AI steps:** an `ExecHost` whose `spawn` starts the relay once, then opens an upgrade connection per
   process and wraps it as a `ChildProcess`-like object (stdin, stdout, kill). The Claude SDK keeps
   working unchanged. OpenCode can use the gateway to reach `opencode serve` directly.
4. **`ask_user`:** the box cannot reach the Mac, so the shim cannot dial the broker. The shim would talk
   through the relay instead (a second upgrade connection), or the host polls the box.
5. **Artifacts and outcomes:** read back with `files.readFile` after each step.
6. **Run end:** `git diff` (or `git format-patch`) out, for you to review and apply.

This replaces the egress proxy and credential-injection work FlowBoard still has to do. The cost is the
extra server, the relay, and reworking run-flow's host-side reads of the folder (Git checks, artifacts,
lock) to go through the sandbox.
