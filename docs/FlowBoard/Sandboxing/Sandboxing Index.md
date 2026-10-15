---
tags: [flowboard, sandboxing, index]
module: Sandboxing
---

# Sandboxing Index

Sandboxing is the FlowBoard platform component that runs each agent step inside a security boundary (a container or a microVM) instead of directly on the host. Feature map §10 puts it in one line: *"Running each agent inside a locked-down box so a misbehaving or manipulated agent can't touch the rest of your machine or the internet."*

> [!important] The one idea to get right first
> **`bypassPermissions` and a sandbox are one package.** FlowBoard runs agents headless with no approval on each tool call, and those agents read untrusted content. The control that still holds is the **egress allowlist**, because *"prompt injection can change what the agent asks for, but it cannot change what the firewall permits"* (`08-sandboxing.md`). See [[Sandbox Threat Model]] and [[Permission Gate]].

> [!note] A platform component, not a screen
> No mockup is dedicated to sandboxing. It shows up as a field in the flow designer, a posture line in two status bars, and a failure card in the inbox. See [[Sandboxing In The UI]].

## Start here

- [[Sandboxing Overview]]: purpose, place in the system, design principles
- [[Sandbox Threat Model]]: why the box exists, and what it cannot stop
- [[Sandboxing Glossary]]: terms, including the words that mean two things

## The boundary

- [[Isolation Tiers]]: `host`, `container`, `gvisor`, `microvm`, and the other vocabularies the sources use
- [[Sandbox Security Profile]]: every knob a sandboxed run applies, in one table
- [[Egress Allowlist]]: default-deny outbound network, the load-bearing control
- [[Credential Injecting Proxy]]: no real API key inside the box
- [[Sandbox Mounts]]: the one writable mount, the read-only ones, and what is never mounted
- [[Resource Limits]]: the physical backstop to the budget and turn caps
- [[In-Agent Hooks]]: `PreToolUse` checks inside the agent, the second gate

## Rules and behaviour

- [[Permission Gate]]: no `bypassPermissions` outside a sandbox tier
- [[Sandboxed Run Lifecycle]]: one throwaway container per run, start to destroy
- [[Host-Side Brokers]]: why questions and memory never need a hole in the wall
- [[Egress Denials]]: what a blocked call costs, and **Allow host & retry**

## Under the hood

- [[ExecHost Port]]: the seam that makes any provider run at any tier
- [[Sandboxing Runtime]]: the image, the internal network, the proxy, the adapters
- [[Sandboxing Data Model]]: `SandboxProfile`, `runs.sandbox`, `settings.sandbox_profile`
- [[Sandboxing Storage]]: sockets, per-run files and paths
- [[Sandboxing API And Routes]]: what the sources define (almost nothing) and proposals

## Configuration and surfaces

- [[Sandbox Configuration]]: global profile, per-step override, Docker probe
- [[Sandbox Defaults]]: the recommended defaults and seeded behaviour
- [[Sandboxing In The UI]]: every place a screen shows the sandbox

## Context and direction

- [[Sandboxing Prior Art]]: Claude Code dev container, Codex, Docker, managed platforms
- [[Sandboxing Testing]]: how the sources want the boundary tested
- [[Sandboxing Roadmap]]: v1 scope, designed beyond the PRD, ideas, out of scope
- [[Sandboxing Open Questions]]: every place the sources disagree or leave a gap
- [[Sandboxing Sources]]: where every fact in these notes comes from

## Related

- [[Component Documentation Tracker]]
- [[Run Guardrails At Launch]]
- [[Capability Tools And Egress]]
