# dsh-run-button

**A Run button for every shell code block in a DSH reply.** Press it and the snippet executes on the host, with stdout/stderr streaming live into a **Run output** tab in the bottom workbench — the same panel that hosts the terminal.

> Status: `0.1.0` — working plugin package, hand-authored (no bundler, no TypeScript build).

<p align="center">
  <b>English</b> · <a href="README.zh.md">中文</a>
</p>

---

## Why

DSH renders assistant answers as Markdown, and a fenced code block gets exactly one affordance: **Copy**. Every time an answer contains a command you want to try — a `git` sequence, a `pnpm` script, a diagnostic one-liner — you copy it, switch to a terminal, paste, and run.

This plugin adds the missing verb. Code blocks whose language is a command line get a **▶ Run** chip next to Copy. Click it and:

- the command runs **on the host**, in the session's own workspace directory and sandbox;
- output streams into a **floating dock at the bottom-right corner** — one card per run, newest first, never covering the conversation;
- the chip reflects state — `▶ Run` → `■ Stop` → `✓ Run` (exit 0) or `✕ Run` (non-zero / killed);
- a run strip above the composer lists active and recent runs: click a chip to re-open that run's card, or its `×` to drop the run;
- long-running commands can be stopped from the chip, the dock card, or the workbench tab.

### Output surfaces

Three modes, switchable from the strip (`Dock` / `Panel` / `Off`); the choice is remembered:

| Mode | Where output goes | Needs anything extra? |
| --- | --- | --- |
| **Dock** (default) | One floating card per run, in a fixed bottom-right stack | no |
| **Panel** | A bottom-workbench tab per run — the same panel the terminal lives in | [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) |
| **Off** | Nowhere; the chip still reports status | no |

`Panel` is offered through `dsh-better-sidebar`'s public `ctx.betterSidebar` service (`registerTab` + `openTab({ target: 'bottom' })`), the same extension point its built-in terminal, git, and task tabs use. That plugin is an **optional** peer: when it is absent, `Panel` is disabled and `Dock` remains the default, so the plugin is fully usable with no extra dependency.

Cards are deliberately **not** anchored to the code block that started the run. Anchoring looks tidier until the block scrolls out of the virtualized transcript, the anchor lookup fails, and the same run renders in two places at once. A stable corner dock has no such failure mode.


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
3. Output appears in the **bottom-right dock** (the default mode). Each run is a card: **stop** while it is live, **collapse** to hide its output, **close** to drop it.
4. Switch where output goes with **Dock / Panel / Off** at the right of the run strip; `Panel` instead gives each run its own bottom-workbench tab, with **Stop**, **Copy**, and **Close**.
5. Click the **cwd chip** (next to Run) to override the working directory for that block; the chosen directory is remembered for the session.

## How it works

Two halves, one Cordis plugin package:

```
dsh-run-button/
├── package.json          dsh.bundle.patch + dsh.client {platform:"web"}
├── cordis.patch.yml      profile row: - insert: [{id: run-button, name: dsh-run-button}]
├── lib/index.js          HOST  — ESM Cordis plugin
├── lib/client.js         CLIENT — classic-script bundle (window.__ModuleLoader__)
├── scripts/check-client.mjs       parse gate + undeclared-global audit
└── scripts/simulate-client.mjs    mounts against a real DOM and drives the whole path
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

Run both gates before publishing:

```bash
node scripts/check-client.mjs      # parse + materialize the factory; audits for undeclared globals
node scripts/simulate-client.mjs   # mount it against a real DOM and drive the whole path
```

`simulate-client.mjs` is the important one. It evaluates the bundle the way the shell does (`window.__ModuleLoader__`, then a Cordis-like `ctx`), mounts it over a [happy-dom](https://github.com/capricorn86/happy-dom) document, renders the real code-block markup, and then:

- asserts the Run chip was injected into the banner and clicks it;
- asserts `run/start` and `output` were actually called on the RPC channel;
- switches output mode and asserts dock cards appear, then disappear, and that exactly one dock container exists with one card per run;
- asserts the tab type is registered, does **not** dedupe, and that two runs produce **two distinct tab ids each carrying its own `runId`** — the per-run pairing, which is the thing most likely to silently regress;
- unmounts and asserts nothing was left behind.

It exists because the earlier `check-client.mjs` only proved the bundle *parsed*. It did not run `apply()`, so an undeclared global (`styles`) sailed through and turned the whole page into "Failed to load plugins". Both bugs that shipped were caught by this harness **while it was being written** — which is the argument for keeping it.

## Host contracts (read before touching the client half)

`lib/client.js` is hand-written plain JS with no type checking behind it: an invented API or a missing required field does not fail the build — it becomes a white screen or a crashed sidebar tab. These contracts are taken from the host's own definitions.

### There are no ambient globals

The **dynamic** Cordis plugin sandbox hands out `styles` and `harness` as builtins. A shipped package bundle gets **neither** — referencing one throws inside `apply()`, and a throwing `apply()` takes the whole composition down ("Failed to load plugins"), not just this plugin. Every browser global is therefore reached as `window.<name>`, and `check-client.mjs` fails the build if a bare one reappears.

`apply()` is also wrapped in `try/catch`: on failure it reports, undoes whatever did mount, and returns, so this plugin can never be the reason the page stops rendering.

### Injecting CSS: there is no `styles` service

The client kernel does **not** provide a `styles` service, and `ctx.get("styles")` yields nothing. Insert a `<style>` element yourself and remove it symmetrically in teardown (`apply()` can run more than once):

```js
var tag = document.createElement("style");
tag.id = PREFIX + "-styles";
tag.textContent = CSS;          // in this repo CSS is a string (array .join("")), not an array
document.head.appendChild(tag);
```

### `ctx.betterSidebar.registerTab()`: `component` is required

`TabDescriptor` (see `dsh-better-sidebar/src/client/service.ts`):

| Field | Required | Notes |
| --- | --- | --- |
| `id` | ✅ | Unique id; also the `SidebarTab.type`. |
| `title` | ✅ | `string \| (() => string)` |
| `component` | ✅ | `(props: TabComponentProps) => ReactNode`. **Omitting it means `createElement(undefined)` → React #130.** |
| `description` | | One line in the host's new-tab list. |
| `icon` | | `ReactNode \| ((size: number) => ReactNode)` |
| `order` | | Menu sort order, default 100. |
| `hidden` | | Keep it out of the `+` menu. |
| `available` | | `(ctx, scope, state) => boolean` |
| `single` / `dedupeKey` | | Single instance / custom dedupe. |
| `createTab` | | Mint the tab and any state patch. |
| `urlTarget` | | Claim external-link clicks. |
| `settings` / `badge` | | Settings toggles / tab-strip badge. |
| `onOpen` / `onActivate` / `onClose` | | Lifecycle callbacks. |

`component` receives `TabComponentProps`: `ctx`, `store`, `scope`, `tab`, and `visible` (active **and** panel open — pause polling when false).

Function declarations hoist, so `component: RunTab` may precede `function RunTab()`.

### How a render error surfaces

`dsh-better-sidebar`'s `RenderBoundary` has two scopes: ROOT (the whole sidebar shell, `index.tsx`) and PER-TAB (one tab, `Sidebar.tsx`'s `TabContent`). Either way the strip reads `dsh-better-sidebar: <message>`. **That prefix points at a tab registered by run-button, not at the sidebar itself** — the shell and the other tabs usually stay alive.

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
- Every run's card lives in one fixed bottom-right dock; there is no per-block anchoring, so output never appears inside the transcript.
- A run's output lives on the host for 10 minutes and survives a page refresh (run ids are kept in `sessionStorage`), but the host forgets it after that TTL or a DSH restart.
- `input` (stdin) is implemented on the host but not yet surfaced in the UI.

## License

MIT — see [LICENSE](LICENSE).

## Prior art

[dsh-smooth-stream](https://github.com/Laplace-bit/dsh-smooth-stream) also attaches to the code-block banner — for animated streaming and scroll control, not for executing the snippet. This plugin does not overlap with it: Smooth Stream changes how output is *revealed*, Run Button adds a control the transcript never had. The two coexist (both verified together in the same profile).
