# dsh-run-button

**A Run button for every shell code block in a DSH reply.** Press it and the snippet executes on the host, with stdout/stderr streaming live into a **Run output** tab in the bottom workbench — the same panel that hosts the terminal.

> Status: `0.1.0` — working plugin package, hand-authored (no bundler, no TypeScript build).

---

## Why

DSH renders assistant answers as Markdown, and a fenced code block gets exactly one affordance: **Copy**. Every time an answer contains a command you want to try — a `git` sequence, a `pnpm` script, a diagnostic one-liner — you copy it, switch to a terminal, paste, and run.

This plugin adds the missing verb. Code blocks whose language is a command line get a **▶ Run** chip next to Copy. Click it and:

- the command runs **on the host**, in the session's own workspace directory and sandbox;
- output lands in a **Run output** tab in the bottom workbench, which opens and expands on the first run of the session — the same place the terminal lives, so it does not cover the conversation;
- the chip reflects state — `▶ Run` → `■ Stop` → `✓ Run` (exit 0) or `✕ Run` (non-zero / killed);
- a run strip above the composer lists active and recent runs, and clicking one brings the workbench tab forward;
- long-running commands can be stopped from either the chip or the tab.

### Output surface: dsh-better-sidebar

The bottom-panel tab is provided through [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar)'s public `ctx.betterSidebar` service (`registerTab` + `openTab({ target: 'bottom' })`), the same extension point its built-in terminal, git, and task tabs use.

That plugin is an **optional** dependency, not a requirement:

| `dsh-better-sidebar` | Behaviour |
| --- | --- |
| mounted | Runs get a real workbench tab next to the terminal; the panel opens and expands automatically on the session's first run |
| absent | Commands still execute through the Host channel and the chips still report status — there is simply no output surface to render into |


## What it recognises

A fence is treated as runnable when its info string names a command-line language:

| Language tag | Chip |
| --- | --- |
| `bash`, `sh`, `zsh`, `shell`, `shellscript` | `▶ Run` |
| `console` | `▶ console` |
| `powershell`, `pwsh`, `ps1` | `▶ PowerShell` |
| `cmd`, `bat`, `batch`, `dos` | `▶ cmd` |

Other fences (`js`, `python`, `json`, …) are left untouched: running them would require synthesising an interpreter invocation, which is a different feature.

## Security posture

This is a **user-initiated** execution surface, and it is deliberately not more powerful than the Agent already is.

- A run inherits the calling **session's sandbox policy** (`ctx.sandboxPolicy.resolve`) and its **workspace cwd**. Pressing Run can never reach further than the Agent working in that session could.
- The command executes **exactly as authored** in the block. Nothing is interpolated, no shell string is assembled from model output.
- The RPC channel is loopback-only and sits behind the Connection's own trust fence plus browser authentication. A credential-less request gets `401`.
- Commands are executed asynchronously, so the UI never blocks; running processes are killed when the plugin stops or is updated, so no orphan survives a reload.
- Output is capped at 256 KB per stream; a blocked or unauthorized command surfaces the executor's own denial in the panel.

## Install

### Into a local profile (development)

```bash
# junction the package into the profile's node_modules, then mount it
dsh dev inject <path-to>/dsh-run-button
```

The super-injector's `dev_inject_plugin` takes the package directory. For a durable install, add it to the profile instead:

```json
{
  "dependencies": { "dsh-run-button": "link:/absolute/path/to/dsh-run-button" },
  "dsh": { "profile": { "bundles": ["...", "dsh-run-button"] } }
}
```

Then restart DSH (or reload the page for the client half).

### From npm

```bash
npm install dsh-run-button
```

## Using it

1. Ask the Agent for a command, or write one in a fenced `bash`/`powershell` block.
2. Click **▶ Run** in the block's banner.
3. The bottom workbench opens on the **Run output** tab (same panel as the terminal). Each run is a card: **stop** while it is live, **collapse** to hide its output, **close** to drop it; **Clear finished** removes every settled run.
4. Click the **cwd chip** (next to Run) to override the working directory for that block; the chosen directory is remembered for the session.

## How it works

Two halves, one Cordis plugin package:

```
dsh-run-button/
├── package.json          dsh.bundle.patch + dsh.client {platform:"web"}
├── cordis.patch.yml      profile row: - insert: [{id: run-button, name: dsh-run-button}]
├── lib/index.js          HOST  — ESM Cordis plugin
├── lib/client.js         CLIENT — classic-script bundle (window.__ModuleLoader__)
└── scripts/check-client.mjs   syntax gate for the browser bundle
```

**Host half** (`lib/index.js`) mounts a dedicated loopback RPC channel, `/dsh-run-button`, with endpoints `info`, `start`, `output`, `input`, `kill`. `start` resolves the session's cwd and sandbox policy, then uses the shipped `shell` service (`ctx.shell.resolve` → `ctx.shell.start`) to launch the command and hold a background process handle. `output` reads **incremental** deltas (`readOutput()` never repeats text) and returns a JSON-safe view: status, exit code, signal, cwd, sandbox mode, and the accumulated streams. Every side effect is a `ctx.effect`, including killing live processes on teardown.

**Client half** (`lib/client.js`) does three things:

1. A `MutationObserver` scans the transcript for `[data-code-block-banner]`, reads the language and the `<pre>` text, and appends a Run chip plus a cwd chip into the banner's action row **as trailing children** — React's reconciler never enumerates DOM children, so an extra trailing node survives re-renders. Because the transcript virtualizes above 100 records, re-scans run on mutation and on scroll.
2. A run store polls `output` every 180 ms over `connection.rpc.call` and notifies its subscribers; the React views render from that store, so the chip, the composer strip, and the workbench tab always agree.
3. The **Run output** tab registers through `ctx.betterSidebar.registerTab(...)` and is raised with `openTab({ target: 'bottom' })` when a run starts. Its body is an ordinary React component receiving the standard `TabComponentProps`.

The compact run strip registers in the session Slot `conversation.input.dock`.


### No build step

Both halves are hand-written plain JavaScript:

- `lib/index.js` is ordinary ESM — the Cordis loader imports it directly (`tsconfig`/`tsdown` not required).
- `lib/client.js` is a **classic script** (not a module) in the one registration format the browser kernel accepts:

```js
window.__ModuleLoader__.load({
  id: "dsh-run-button",           // must equal the package.json name
  factory: (require) => { var module = {exports:{}}; var exports = module.exports; /* … */ return module.exports }
})
```

`require` resolves only against the shell's frozen baseline (`react`, `react/jsx-runtime`, `react-dom`, `@deepseek-ai/cordis`, …), which is why this plugin needs nothing beyond `react`.

Run `node scripts/check-client.mjs` to parse-and-materialize the bundle outside a browser before publishing.

## Configuration

None required. Behaviour that can be tuned:

| Knob | Where | Default |
| --- | --- | --- |
| Poll interval | `POLL_MS` in `lib/client.js` | 180 ms |
| Simultaneous runs | `MAX_LIVE_RUNS` in `lib/index.js` | 16 |
| Per-stream output cap | `MAX_STREAM_BYTES` in `lib/index.js` | 256 KB |
| Finished-run retention | `RUN_TTL_MS` in `lib/index.js` | 10 min |
| Recognised languages | `SHELL_LANGUAGES` in `lib/client.js` | see table above |

## Limitations

- Only command-line fences are runnable (`js`, `python`, and friends are out of scope by design).
- Output is polled, not pushed; at the default interval a fast command may appear in one or two chunks.
- Runs are grouped into one workbench tab rather than a panel per block. Without `dsh-better-sidebar` there is no output surface at all — the chips still execute and report status.
- A run's output lives on the host for 10 minutes and survives a page refresh (run ids are kept in `sessionStorage`), but the host forgets it after that TTL or a DSH restart.
- `input` (stdin) is implemented on the host but not yet surfaced in the UI.

## License

MIT — see [LICENSE](LICENSE).

## Prior art

[dsh-smooth-stream](https://github.com/Laplace-bit/dsh-smooth-stream) also attaches to the code-block banner — for animated streaming and scroll control, not for executing the snippet. This plugin does not overlap with it: Smooth Stream changes how output is *revealed*, Run Button adds a control the transcript never had. The two coexist (both verified together in the same profile).
