---
tags: [flowboard, desktop, windows, known-issues]
module: Desktop App
---

# Desktop App Windows Gaps

What stops FlowBoard working on Windows, found while making the Electron app (`feature/electron-app`, 2026-11-15). Nothing here has been fixed. Nothing has been run on a Windows machine either: every item comes from reading the code, so each fix needs a run on Windows to confirm it.

The app's own shell, `code/flowboard/electron/`, is written for Windows. The rest of FlowBoard assumes macOS or Linux. Paths below are relative to `code/flowboard/`.

## What already handles Windows

- `electron/path.js` reads the current machine and user PATH from the registry (an app opened from Explorer gets Explorer's PATH, which misses tools installed since login), then adds the usual install folders that exist: Program Files `nodejs`, `Git\cmd`, `GitHub CLI` and `Docker\Docker\resources\bin`; `%USERPROFILE%\.local\bin` (Claude Code's installer); `%APPDATA%\npm`; Scoop's shims; Chocolatey's `bin`. Only the folder list is tested (`electron/path.test.js`). The registry read has never run.
- The page's Stop writes a `stop` file in the run folder (`stopRun`, `packages/cli/src/flow-logs.ts:265`), not a signal, so asking a run to stop works. What the run then does to its processes does not; see [process control](#process-control).
- Secrets live in `secrets.json` in the data folder, not the macOS keychain, as `CLAUDE.md` asks.

## Order to fix

1. [Agent steps](#agent-steps-every-run-fails): without these, no run gets past its first agent step.
2. [Shell steps](#shell-steps): `check` steps and shell gates.
3. [Process control](#process-control): stopping, timeouts and clean-up.
4. [Sandboxes](#sandboxes): the `container` tier and OpenSandbox.
5. [Smaller gaps](#smaller-gaps).

## Agent steps: every run fails

### Temp folders are made under `/tmp`

| Where | Code |
|---|---|
| `packages/cli/src/flow-exec.ts:287` | `realpathSync(mkdtempSync('/tmp/fb-'))` for each agent step |
| `packages/cli/src/flow-exec.ts:294` | `mkdtempSync('/tmp/fb-h-')` for OpenSandbox runs |
| `packages/cli/src/run.ts:204` | the same, for `run-agent` |

On Windows `/tmp/fb-` is `\tmp\fb-` on the current drive, so `mkdtempSync` fails with `ENOENT` unless `C:\tmp` happens to exist. The path is fixed on purpose: a Unix socket path is limited to about 104 characters, and macOS's `os.tmpdir()` is long.

**Fix:** keep `/tmp` on macOS and Linux and use `os.tmpdir()` on Windows. The socket below must move to a named pipe as well, so the length limit no longer applies there.

### The ask broker listens on a Unix socket

| Where | Code |
|---|---|
| `packages/cli/src/ask/broker.ts:124` | `server.listen(listen)` with `<tmp>/ask.sock` |
| `packages/cli/src/flow-exec.ts:295`, `:309`, `:317` | the socket path handed to the broker and the `ask_user` shim |
| `packages/ask-user/src/broker-client.ts:11` | `createConnection(address)` from the shim |

On Windows, Node listens on a path only when it is a named pipe (`\\.\pipe\<name>`). Any other path fails, so an agent step fails while it is being set up, before the agent starts.

**Fix:** either:

- on Windows, pass `\\.\pipe\fb-<random>` instead of `<tmp>/ask.sock`, which `server.listen` and `createConnection` both accept unchanged; or
- use the TCP mode with a token that containers already use (`startBroker({ token })`, `FLOWBOARD_ASK_TOKEN`).

The pipe is the smaller change.

### npm-installed CLIs are `.cmd` files

| Where | Code |
|---|---|
| `packages/adapters/src/agent/claude/provider.ts:46` | `opts.claudePath ?? 'claude'` |
| `packages/adapters/src/agent/opencode/provider.ts:67` | `opts.opencodePath ?? 'opencode'` |
| `packages/adapters/src/agent/opencode/server.ts:33` | `exec.spawn(opts.opencodePath, ['serve', …])` |
| `packages/adapters/src/exec/host.ts:7` | `spawn(command, args, { cwd, env, stdio: 'pipe' })`, with no shell |

`spawn` without a shell runs only `.exe` and `.com` files. npm installs `claude` and `opencode` on Windows as `claude.cmd` and `opencode.cmd`, so `spawn('claude')` fails with `ENOENT`. Passing the full path doesn't help: since Node's 2024 security fix (CVE-2024-27980), spawning a `.cmd` without a shell fails with `EINVAL`. Claude Code's own installer gives `claude.exe` in `%USERPROFILE%\.local\bin`, which works. `git`, `gh`, `docker` and `node` are `.exe` files and work.

**Fix:** in the host `ExecHost`, on Windows, look the command up on PATH with `PATHEXT`. If it is a `.cmd` or `.bat`, run it as `cmd.exe /d /s /c "<file>" <args>` with each argument quoted. Don't set `shell: true` on the whole spawn: it gets the quoting of agent prompts wrong.

## Shell steps

| Where | Code |
|---|---|
| `packages/cli/src/flow-exec.ts:136` | `exec.spawn('sh', ['-c', command], …)` inside a sandbox |
| `packages/cli/src/flow-exec.ts:137` | `spawn('sh', ['-c', command], { detached: true, … })` on the host |

Windows has no `sh`. Recipes' commands are written for `sh` (`pnpm test`, `&&`, `$VAR`, pipes), so switching to `cmd.exe` would change what they mean.

**Fix:** on Windows, run Git for Windows' `sh.exe` (`C:\Program Files\Git\bin\sh.exe` or `usr\bin\sh.exe`), and refuse the step with a clear message when Git for Windows is missing. Add `Git\bin` to the fallback folders in `electron/path.js` too: it lists only `Git\cmd`, which holds `git.exe` but not `sh.exe`. Commands inside a container are unaffected: they run Linux's `sh`.

## Process control

### Process groups

| Where | Code |
|---|---|
| `packages/cli/src/flow-exec.ts:137`, `:206` | shell step in its own group (`detached: true`); stopped with `process.kill(-child.pid, sig)` |
| `packages/cli/src/flow-run.ts:505` | `stopLeftovers` on `--resume`: `process.kill(t.group ? -t.pid : t.pid, sig)` |
| `packages/cli/src/clone.ts:71`, `:80` | `gh repo clone` in its own group; a silent clone killed with `process.kill(-child.pid, 'SIGKILL')` |
| `packages/cli/src/flow-start.ts:71` | run-flow started `detached: true` from the app |

Windows has no process groups, and a negative pid makes `process.kill` throw. Each of these calls catches that and treats it as "already gone":

- Stopping a shell step, or a step that times out, leaves the shell and everything it started still running. The run then waits on them.
- A clone that goes quiet is reported as stopped but is not.
- `--resume` cannot stop what an earlier host left behind.

`detached: true` has a second effect on Windows: the child gets its own console window. A window would open for every run started from the app and every shell step.

**Fix:** on Windows, stop a tree with `taskkill /pid <pid> /T` (add `/F` for the hard stop), and pass `windowsHide: true` wherever `detached: true` is set. A small `killTree(pid, hard)` beside `packages/adapters/src/exec/terminate.ts` would serve all four places.

### Signals

| Where | Code |
|---|---|
| `packages/adapters/src/exec/terminate.ts:9`, `:11` | `SIGTERM`, then `SIGKILL` after a grace period |
| `packages/cli/src/flow-exec.ts:217`, `:221` | the same for shell steps |
| `packages/cli/src/flow-run.ts:1032` | run-flow stops cleanly on `SIGINT`, `SIGTERM` or `SIGHUP` |
| `packages/cli/src/run.ts:192` | the same for run-agent |
| `electron/main.js:75` | `server.kill()` when the app quits |

On Windows, `child.kill('SIGTERM')` ends the process at once, as `SIGKILL` does. Nothing gets a grace period: agent CLIs can't save their state, and `opencode serve` can't shut down its own children. Windows never delivers `SIGTERM` to run-flow, so only Ctrl+C or closing its console makes it stop cleanly. Run from the app, it has no console, so a run can only end, or stop through its `stop` file.

`server.kill()` ends `next` but not the processes `next` started. When the app quits, a `next dev` worker or a run started from the app may be left running.

**Fix:** use the `stop` file, or another message, wherever a graceful stop matters, and `taskkill /T` for the hard stop. In `electron/main.js`, stop the server's tree on quit.

### `ps` tells processes apart

| Where | Code |
|---|---|
| `packages/cli/src/flow-exec.ts:76` | `processStart(pid)`: `ps -o lstart= -p <pid>` |
| `packages/cli/src/flow-exec.ts:142`, `:359` | the start time logged with each pid |
| `packages/cli/src/flow-run.ts:496` | `stopLeftovers` compares it, so a reused pid is never killed |

Windows has no `ps`, so `processStart` always returns `undefined`. `stopLeftovers` then reads every logged process as gone. It skips them, or, for a group, tries the negative-pid kill above.

**Fix:** on Windows, read the start time with `powershell -NoProfile -Command "(Get-Process -Id <pid>).StartTime.ToString('o')"`. The logged value and the later reading must use the same format.

## Sandboxes

### `container` tier: Docker mounts

| Where | Code |
|---|---|
| `packages/adapters/src/exec/docker.ts:29` | `-v ${cwd}:${cwd}`, `-w ${cwd}`: the folder is mounted at the same path |
| `packages/adapters/src/exec/docker.ts:30`, `:46` | extra mounts and `tmpDir` the same way |

The design mounts each folder at the same path, so paths mean the same thing inside and out. A Windows path such as `C:\Users\a\repo` can't be a path in a Linux container, and the `:` after the drive letter breaks `-v`'s `source:target` syntax.

**Fix:** mount Windows folders at a translated path (`C:\Users\a\repo` → `/c/Users/a/repo`). Then translate every path that crosses the boundary: the step's `cwd`, the artifact and verdict paths, and the `tmpDir` the providers write into. This is a design change, not a one-line fix. Settle it before promising sandboxes on Windows.

### OpenSandbox

| Where | Code |
|---|---|
| `packages/adapters/src/exec/opensandbox/box.ts:101`, `:142` | `tar --no-mac-metadata -czf - -C <dir> .` to push files into the box |
| `packages/adapters/src/exec/opensandbox/box.ts:197` | `tar -xzf - -C <scratch> --no-same-owner` to pull them back |

Windows 10 and later ship bsdtar as `tar.exe`, which accepts these options. The push at `:142` uses `-C /` with paths relative to the root, which assumes POSIX absolute paths. Unverified; expect the push of extra files to fail.

## Smaller gaps

| Gap | Where | Effect | Fix |
|---|---|---|---|
| Failure fingerprints see only POSIX paths | `packages/core/src/flow/fingerprint.ts:4` (`ABSOLUTE_PATH`) | `C:\…` paths are not cut to their last segment, so the same failure in two checkouts gets two fingerprints, and repeat failures go unnoticed | Also match `[A-Za-z]:\\[^\s'"…]+` and cut at `\` as well as `/` |
| File modes are ignored | `packages/cli/src/openrouter.ts:44` (`secrets.json`, `0o600`), `packages/cli/src/flow-run.ts:304` (`sandbox.json`) | The files take the folder's permissions. The user's profile is private by default, so this is acceptable unless the data folder is moved somewhere shared | Note it in the settings docs; no code change unless the data folder can live outside the profile |
| Env assignments in `package.json` scripts | `package.json` `test:packages`, `test:live` (`FLOWBOARD_LIVE= node …`) | pnpm runs scripts with `cmd.exe` on Windows, which can't read `NAME=value command` | Read the switch from an argument, or set pnpm's `script-shell` to Git Bash |
| The keychain message names macOS only | `packages/cli/src/flow-run.ts:377` | Only the wording: Claude Code on Windows keeps its login in `%USERPROFILE%\.claude\.credentials.json`, which a container can't read either | Reword it so it holds on every platform |
| `nvm` is not a fallback folder | `electron/path.js` (both platforms) | If the shell or registry read fails, a `node` from nvm or nvm-windows is not found | Bundle Node with the packaged app, which also removes the need for `node` on PATH |

## How to check a fix

There is no Windows machine in the loop yet. For each fix:

1. Add a unit test that passes `'win32'` as the platform, as `electron/path.test.js` does, for anything that builds a command line or a path.
2. Run the app on Windows: `pnpm install`, `pnpm build`, `pnpm electron`. Then start `flows/review-loop.yaml` from the New run sheet, stop it from the run page, and confirm no `node`, `sh` or agent process is left (`tasklist | findstr /i "node sh claude opencode"`).
