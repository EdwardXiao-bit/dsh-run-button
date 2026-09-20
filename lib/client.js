/*
 * ===========================================================================
 *  MANDATORY GATE — run `npm run check` after ANY edit to this file.
 *  (A tracked pre-commit hook enforces it too: git config core.hooksPath .githooks)
 *
 *    1. check-client.mjs    — parses the bundle AND fails on undeclared
 *                             ambient globals. A real package bundle has NO
 *                             `styles` and NO `harness` (those are dynamic
 *                             sandbox builtins) and no bare browser globals:
 *                             reach them as window.<name>.
 *    2. simulate-client.mjs — mounts the bundle against a real DOM and drives
 *                             inject -> click -> run/start -> per-run tab ->
 *                             mode switch -> unmount
 *    3. node --check        — host half syntax
 *
 *  A throwing apply() does not degrade this plugin: it replaces the whole app
 *  with "Failed to load plugins". Three incidents shipped that way. Do not hand
 *  this file back unverified.
 *  See README.md "Host contracts (read before touching the client half)".
 * ===========================================================================
 */
window.__ModuleLoader__.load({
	id: "dsh-run-button",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");

		/* ------------------------------------------------------------------ *
		 * Constants
		 * ------------------------------------------------------------------ */

		var PREFIX = "dsh-runbtn";
		var ATTR_BUTTON = "data-dsh-run-button";
		var ATTR_TARGET = "data-dsh-run-target";
		var ATTR_INLINE = "data-dsh-run-inline";
		/** Bottom-workbench tab type; every run opens its own instance of it. */
		var RUN_TAB_TYPE = "dsh-run-button:runs";
		/** Dedicated loopback-only RPC channel registered by this package's Host half. */
		var CHANNEL = "/dsh-run-button";
		var POLL_MS = 180;
		var SCAN_MS = 120;
		var TAB_OPEN_THROTTLE_MS = 800;
		var PREF_KEY = "dsh-run-button:prefs";
		var RUNS_KEY = "dsh-run-button:runs";
		/** The corner dock needs no optional plugin, so it is the default surface. */
		var INLINE_BY_DEFAULT = "inline";

		/** Languages whose fenced block is a command line the shell can execute. */
		var SHELL_LANGUAGES = {
			bash: true, sh: true, shell: true, zsh: true, console: true, shellscript: true,
			powershell: true, pwsh: true, ps1: true, cmd: true, bat: true, batch: true, dos: true,
		};
		/** Friendly chip text for the languages worth distinguishing. */
		var LANGUAGE_LABELS = {
			powershell: "PowerShell", pwsh: "PowerShell", ps1: "PowerShell",
			cmd: "cmd", bat: "cmd", batch: "cmd", dos: "cmd",
			zsh: "zsh", sh: "sh", console: "console", shellscript: "shell",
		};

		var CSS = [
			"." + PREFIX + "-btn{display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:1px 7px;",
			"font:inherit;font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary);",
			"background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;cursor:pointer;",
			"white-space:nowrap;transition:background .12s ease,color .12s ease,border-color .12s ease}",
			"." + PREFIX + "-btn:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));",
			"color:var(--dsw-alias-label-primary)}",
			"." + PREFIX + "-btn[" + ATTR_BUTTON + "=running]{color:var(--dsw-alias-state-warn-primary);",
			"border-color:var(--dsw-alias-state-warn-primary)}",
			"." + PREFIX + "-btn[" + ATTR_BUTTON + "=done]{color:var(--dsw-alias-state-success-primary);",
			"border-color:var(--dsw-alias-state-success-primary)}",
			"." + PREFIX + "-btn[" + ATTR_BUTTON + "=failed]{color:var(--dsw-alias-state-error-primary);",
			"border-color:var(--dsw-alias-state-error-primary)}",
			"." + PREFIX + "-btn[" + ATTR_BUTTON + "=stopped]{color:var(--dsw-alias-label-secondary);",
			"border-color:var(--dsw-alias-label-secondary)}",
			"." + PREFIX + "-target{display:inline-flex;align-items:center;margin-left:6px;padding:0 6px;",
			"font:inherit;font-size:10px;line-height:16px;color:var(--dsw-alias-label-secondary);",
			"background:transparent;border:1px dashed var(--dsw-alias-border-l1);border-radius:4px;cursor:pointer;",
			"max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			"." + PREFIX + "-target:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}",
			"." + PREFIX + "-strip{display:flex;align-items:center;gap:6px;padding:2px 0;flex-wrap:wrap}",
			"." + PREFIX + "-dockBtn{padding:0 8px;font:inherit;font-size:11px;line-height:20px;cursor:pointer;",
			"color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l1);",
			"border-radius:5px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			"." + PREFIX + "-dockBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}",
			"." + PREFIX + "-modes{display:inline-flex;margin-left:auto;border:1px solid var(--dsw-alias-border-l1);",
			"border-radius:5px;overflow:hidden}",
			"." + PREFIX + "-mode{padding:0 7px;font:inherit;font-size:11px;line-height:20px;cursor:pointer;",
			"color:var(--dsw-alias-label-secondary);background:transparent;border:none;",
			"border-left:1px solid var(--dsw-alias-border-l1)}",
			"." + PREFIX + "-mode:first-child{border-left:none}",
			"." + PREFIX + "-mode[data-on=\"1\"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}",
			"." + PREFIX + "-mode:disabled{opacity:.45;cursor:not-allowed}",
			"." + PREFIX + "-tab{display:flex;flex-direction:column;height:100%;min-height:0;",
			"font-size:12px;color:var(--dsw-alias-label-primary)}",
			"." + PREFIX + "-bar{display:flex;align-items:center;gap:8px;padding:6px 10px;flex:none;",
			"border-bottom:1px solid var(--dsw-alias-border-l1)}",
			"." + PREFIX + "-action{padding:1px 8px;font:inherit;font-size:11px;line-height:18px;cursor:pointer;",
			"color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l1);",
			"border-radius:5px}",
			"." + PREFIX + "-action:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}",
			"." + PREFIX + "-body{flex:1 1 auto;min-height:0;overflow:auto;padding:8px 10px 12px}",
			"." + PREFIX + "-dock{position:fixed;z-index:60;right:16px;bottom:16px;display:flex;flex-direction:column;",
			"gap:8px;max-height:calc(100vh - 120px);overflow:auto;width:min(520px,calc(100vw - 32px))}",
			"." + PREFIX + "-inline{box-sizing:border-box;display:flex;flex-direction:column;",
			"border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);",
			"box-shadow:0 12px 32px rgba(0,0,0,.28);overflow:hidden;font-size:12px;",
			"color:var(--dsw-alias-label-primary)}",
			"." + PREFIX + "-head{display:flex;align-items:center;gap:6px;padding:5px 8px;flex:none;",
			"border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}",
			"." + PREFIX + "-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-secondary)}",
			"." + PREFIX + "-dot[running]{background:var(--dsw-alias-state-warn-primary)}",
			"." + PREFIX + "-dot[done]{background:var(--dsw-alias-state-success-primary)}",
			"." + PREFIX + "-dot[failed]{background:var(--dsw-alias-state-error-primary)}",
			"." + PREFIX + "-cmd{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
			"font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}",
			"." + PREFIX + "-icon{flex:none;padding:1px 6px;font:inherit;font-size:11px;line-height:16px;cursor:pointer;",
			"color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid transparent;border-radius:4px}",
			"." + PREFIX + "-icon:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}",
			"." + PREFIX + "-out{margin:0;padding:8px 10px;max-height:220px;overflow:auto;",
			"font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:17px;",
			"white-space:pre-wrap;word-break:break-word}",
			"." + PREFIX + "-inline[" + ATTR_INLINE + "=\"expanded\"] ." + PREFIX + "-out{max-height:52vh}",
			"." + PREFIX + "-err{color:var(--dsw-alias-state-error-primary)}",
			"." + PREFIX + "-note{padding:4px 10px 6px;font-size:11px;color:var(--dsw-alias-label-secondary)}",
			"." + PREFIX + "-empty{padding:14px 4px;color:var(--dsw-alias-label-secondary);line-height:1.7}",
		].join("");

		/* ------------------------------------------------------------------ *
		 * Preferences and run store (module scope, per Client run)
		 * ------------------------------------------------------------------ */

		/**
		 * Where run output is rendered.
		 * `panel`  — one bottom-workbench tab per run (needs dsh-better-sidebar)
		 * `inline` — a panel anchored under the code block that started the run
		 * `none`   — execute only; the chip still reports status
		 */
		var MODES = ["panel", "inline", "none"];
		var MODE_LABELS = { panel: "Panel", inline: "Dock", none: "Off" };
		var MODE_TITLES = {
			panel: "Output in a bottom-panel tab per run (needs dsh-better-sidebar)",
			inline: "Output in a floating dock at the bottom-right corner",
			none: "Run without rendering output",
		};

		/** @type {Map<string, object>} runId -> run state, mirrored from the Host. */
		var runs = new Map();
		/** @type {string[]} run ids in creation order. */
		var order = [];
		/** @type {Set<string>} runs whose inline panel is collapsed. */
		var inlineCollapsed = new Set();
		/** @type {Map<string, HTMLElement>} runId -> inline panel root. */
		var inlinePanels = new Map();
		/** Resolved output mode; `inline` works with no optional plugin installed. */
		var mode = INLINE_BY_DEFAULT;
		/** Per-session working-directory override chosen from the chip. */
		var cwdOverride = null;
		/** The Connection RPC service, bound in apply(); every call goes through it. */
		var rpc = null;
		/** dsh-better-sidebar's service, bound in apply() when that plugin is present. */
		var sidebar = null;
		/** Whether `sidebar` exposes the tab-lifecycle calls this plugin relies on. */
		var panelAvailable = false;
		/** Session the page is showing, supplied by the composer dock slot. */
		var currentSessionId = null;
		/** Code-block identity -> last run id, so a re-rendered block reattaches. */
		var attached = new Map();
		/** Open run-tab ids by runId, so a mode switch can close them. */
		var runTabs = new Map();
		var listeners = new Set();
		var started = false;
		var scanTimer = null;
		var scanPending = false;
		var observer = null;
		var lastTabOpen = 0;

		function hash(text) {
			var value = 5381;
			for (var i = 0; i < text.length; i += 1) {
				value = ((value << 5) + value + text.charCodeAt(i)) | 0;
			}
			return (value >>> 0).toString(36);
		}

		function notify() {
			for (const listener of listeners) {
				try {
					listener();
				} catch (error) {
					console.error("dsh-run-button: listener failed", error);
				}
			}
		}

		function subscribe(listener) {
			listeners.add(listener);
			return function () {
				listeners.delete(listener);
			};
		}

		function firstLine(text, limit) {
			var line = String(text ?? "").split("\n")[0];
			return line.length > limit ? line.slice(0, limit) + "…" : line;
		}

		function persistPrefs() {
			try {
				window.localStorage.setItem(PREF_KEY, JSON.stringify({ mode: mode, cwd: cwdOverride }));
			} catch (error) {
				/* preference storage is optional */
			}
		}

		function readPrefs() {
			try {
				var raw = window.localStorage.getItem(PREF_KEY);
				if (raw === null) return;
				var parsed = JSON.parse(raw);
				if (parsed === null || typeof parsed !== "object") return;
				if (MODES.indexOf(parsed.mode) >= 0) mode = parsed.mode;
				if (typeof parsed.cwd === "string") cwdOverride = parsed.cwd;
			} catch (error) {
				/* fall back to the default mode */
			}
		}

		function persistRuns() {
			try {
				window.sessionStorage.setItem(RUNS_KEY, JSON.stringify({ runs: order.slice() }));
			} catch (error) {
				/* session storage is optional; runs simply do not survive a refresh */
			}
		}

		/**
		 * Re-adopt run ids after a page refresh. The run buffers live on the Host
		 * (until their TTL), so restoring the ids is enough to repaint them.
		 */
		function restoreRuns() {
			var parsed
			try {
				var raw = window.sessionStorage.getItem(RUNS_KEY);
				if (raw === null) return;
				parsed = JSON.parse(raw);
			} catch (error) {
				return;
			}
			if (parsed === null || typeof parsed !== "object") return;
			var list = Array.isArray(parsed.runs) ? parsed.runs : [];
			for (var i = 0; i < list.length; i += 1) {
				if (typeof list[i] !== "string" || runs.has(list[i])) continue;
				runs.set(list[i], {
					runId: list[i], command: "", status: "running", stdout: "", stderr: "",
					exitCode: null, cwd: null, sandboxMode: null, error: null, truncated: false,
				});
				order.push(list[i]);
				startPoll(list[i]);
			}
		}

		function upsert(runId) {
			var existing = runs.get(runId);
			if (existing === undefined) {
				existing = {
					runId: runId, command: "", status: "running", stdout: "", stderr: "",
					exitCode: null, cwd: null, sandboxMode: null, error: null, truncated: false,
				};
				runs.set(runId, existing);
				order.push(runId);
			}
			return existing;
		}

		function applyView(runId, view) {
			var current = upsert(runId);
			if (typeof view.command === "string" && view.command !== "") current.command = view.command;
			if (typeof view.status === "string") current.status = view.status;
			if (typeof view.stdout === "string") current.stdout = view.stdout;
			if (typeof view.stderr === "string") current.stderr = view.stderr;
			current.exitCode = typeof view.exitCode === "number" ? view.exitCode : null;
			if (typeof view.cwd === "string") current.cwd = view.cwd;
			if (typeof view.sandboxMode === "string") current.sandboxMode = view.sandboxMode;
			current.error = typeof view.error === "string" ? view.error : null;
			current.truncated = view.stdoutTruncated === true || view.stderrTruncated === true;
			return current;
		}

		/** Display status folds the host's raw status together with its exit code. */
		function statusOf(run) {
			if (run.status === "killed") return "stopped";
			if (run.status === "completed") return run.exitCode !== null && run.exitCode !== 0 ? "failed" : "done";
			return run.status;
		}

		function statusGlyph(status) {
			if (status === "running") return "■";
			if (status === "done") return "✓";
			if (status === "stopped") return "⏹";
			return "✕";
		}

		function metaLine(run) {
			var status = statusOf(run);
			var bits = [status === "running"
				? "running…"
				: status === "stopped" ? "stopped" : "exit " + String(run.exitCode === null ? "?" : run.exitCode)];
			if (run.cwd !== null) bits.push(run.cwd);
			if (run.sandboxMode !== null) bits.push("sandbox: " + run.sandboxMode);
			if (run.truncated) bits.push("output truncated");
			if (run.error !== null) bits.push(run.error);
			return bits.join(" · ");
		}

		function callHost(endpoint, args) {
			if (rpc === null || typeof rpc.call !== "function") {
				return Promise.reject(new Error("dsh-run-button: Connection RPC is unavailable"));
			}
			return rpc.call(CHANNEL, endpoint, args ?? {}).then(function (result) {
				if (result === null || typeof result !== "object" || result.ok !== true) {
					var message = result !== null && typeof result === "object" && result.error !== undefined
						? String(result.error.message)
						: "run request failed";
					throw new Error(message);
				}
				return result.value;
			});
		}

		function killRun(runId) {
			callHost("kill", { runId: runId }).then(
				function () { startPoll(runId); },
				function () {},
			);
		}

		function dropRun(runId) {
			var run = runs.get(runId);
			if (run !== undefined && run.status === "running") killRun(runId);
			runs.delete(runId);
			order = order.filter(function (id) { return id !== runId; });
			inlineCollapsed.delete(runId);
			closeRunTab(runId);
			var root = inlinePanels.get(runId);
			if (root !== undefined) root.remove();
			inlinePanels.delete(runId);
			if (inlinePanels.size === 0) removeDockContainer();
			persistRuns();
			notify();
		}

		function startPoll(runId) {
			var current = runs.get(runId);
			if (current === undefined || current.timer !== undefined) return;
			var tick = function () {
				callHost("output", { runId: runId }).then(
					function (view) {
						if (view === null || typeof view !== "object") {
							stopPoll(runId, "failed");
							return;
						}
						var updated = applyView(runId, view);
						notify();
						renderInline();
						if (updated.status !== "running") stopPoll(runId, updated.status);
					},
					function () {
						// A transient RPC failure must not kill a live process.
						current.failures = (current.failures ?? 0) + 1;
						if (current.failures > 40) stopPoll(runId, "failed");
					},
				);
			};
			current.timer = window.setInterval(tick, POLL_MS);
			tick();
		}

		function stopPoll(runId, status) {
			var current = runs.get(runId);
			if (current === undefined) return;
			if (current.timer !== undefined) {
				window.clearInterval(current.timer);
				current.timer = undefined;
			}
			if (status !== undefined) current.status = status;
			persistRuns();
			notify();
			renderInline();
		}

		/* ------------------------------------------------------------------ *
		 * Output surface 1: one bottom-workbench tab per run
		 * ------------------------------------------------------------------ */

		/** Capability gate: only advertise the panel mode when it can really work. */
		function probeSidebar() {
			if (sidebar === null || typeof sidebar.registerTab !== "function") return false;
			var features = Array.isArray(sidebar.features) ? sidebar.features : [];
			// `tabMeta` is how a tab instance learns which run it renders.
			return features.indexOf("tabMeta") >= 0 && features.indexOf("tabLifecycle") >= 0;
		}

		/** Open (or re-focus) the tab dedicated to one run. */
		function openRunTab(runId) {
			if (!panelAvailable || typeof sidebar.openTab !== "function") return;
			var tabId = RUN_TAB_TYPE + ":" + runId;
			// Re-focusing an already-open tab is throttled; a NEW run always gets its
			// own tab immediately, so two quick runs never collapse into one tab.
			if (runTabs.get(runId) === tabId) {
				var now = Date.now();
				if (now - lastTabOpen < TAB_OPEN_THROTTLE_MS) return;
				lastTabOpen = now;
			} else {
				lastTabOpen = Date.now();
			}
			runTabs.set(runId, tabId);
			var run = runs.get(runId);
			try {
				sidebar.openTab({
					id: tabId,
					type: RUN_TAB_TYPE,
					title: firstLine(run === undefined ? "" : run.command, 48) || "Run output",
					meta: { runId: runId },
					target: "bottom",
				});
			} catch (error) {
				console.error("dsh-run-button: could not open a run tab", error);
			}
		}

		function closeRunTab(runId) {
			var tabId = runTabs.get(runId);
			if (tabId === undefined) return;
			runTabs.delete(runId);
			if (sidebar === null || typeof sidebar.closeTab !== "function") return;
			try {
				sidebar.closeTab(tabId);
			} catch (error) {
				/* the workbench already dropped it */
			}
		}

		/** Drop every run tab — used when the user switches away from panel mode. */
		function closeAllRunTabs() {
			var ids = Array.from(runTabs.keys());
			for (var i = 0; i < ids.length; i += 1) closeRunTab(ids[i]);
		}

		/** Register the per-run tab type. Returns a disposer, or null when absent. */
		function mountSidebarTab() {
			if (!panelAvailable || typeof sidebar.registerTab !== "function") return null;
			var dispose = sidebar.registerTab({
				id: RUN_TAB_TYPE,
				component: RunTab,
				title: function () { return "Run output"; },
				description: function () { return "Output of a command started from the Run button in a code block"; },
				order: 60,
				// One tab per run: no dedupe, and every open mints its own instance.
				dedupeKey: function () { return undefined; },
				icon: function (size) {
					return react.createElement(
						"svg",
						{ width: size, height: size, viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true" },
						react.createElement("path", { d: "M3.5 2.2 12 8l-8.5 5.8V2.2Zm1.5 2.4v6.8L10.7 8 5 4.6Z" }),
					);
				},
			});
			return function () {
				if (typeof dispose === "function") dispose();
			};
		}

		/** The tab body: exactly the run this tab instance was opened for. */
		function RunTab(props) {
			var meta = props !== null && props !== undefined && props.tab !== undefined ? props.tab.meta : null;
			var runId = meta !== null && typeof meta === "object" && typeof meta.runId === "string" ? meta.runId : null;
			var [tick, setTick] = react.useState(0);
			react.useEffect(
				function () {
					return subscribe(function () { setTick(function (value) { return value + 1; }); });
				},
				[],
			);
			void tick;
			var run = runId === null ? undefined : runs.get(runId);
			if (run === undefined) {
				return react.createElement(
					"div",
					{ className: PREFIX + "-tab" },
					react.createElement("div", { className: PREFIX + "-empty" }, "This run is no longer tracked."),
				);
			}
			var status = statusOf(run);
			return react.createElement(
				"div",
				{ className: PREFIX + "-tab" },
				react.createElement(
					"div",
					{ className: PREFIX + "-bar" },
					react.createElement("span", { className: PREFIX + "-dot", "data-status": status }),
					react.createElement("span", { className: PREFIX + "-cmd", title: run.command }, run.command || "command"),
					run.status === "running"
						? react.createElement("button", {
							type: "button",
							className: PREFIX + "-action",
							onClick: function () { killRun(run.runId); },
						}, "Stop")
						: null,
					react.createElement("button", {
						type: "button",
						className: PREFIX + "-action",
						onClick: function () {
							var clipboard = window.navigator === undefined ? undefined : window.navigator.clipboard;
							if (clipboard !== undefined && typeof clipboard.writeText === "function") {
								clipboard.writeText(run.stdout + run.stderr);
							}
						},
					}, "Copy"),
					react.createElement("button", {
						type: "button",
						className: PREFIX + "-action",
						onClick: function () { dropRun(run.runId); },
					}, "Close"),
				),
				react.createElement(
					"div",
					{ className: PREFIX + "-body" },
					react.createElement(
						"pre",
						{ className: PREFIX + "-out" },
						run.stdout === "" && run.stderr === ""
							? react.createElement("span", { className: PREFIX + "-note" }, run.status === "running" ? "running…" : "no output")
							: run.stdout,
						run.stderr !== "" ? react.createElement("span", { className: PREFIX + "-err" }, run.stderr) : null,
					),
					react.createElement("div", { className: PREFIX + "-note" }, metaLine(run)),
				),
			);
		}

		/* ------------------------------------------------------------------ *
		 * Output surface 2: a fixed bottom-right dock, one card per run
		 *
		 * Deliberately NOT anchored to the code block that started the run.
		 * Anchoring looks tidier until the block scrolls out of the virtualized
		 * transcript: the anchor then cannot be found, the panel falls back to the
		 * corner, and two placements appear at once for the same run. A stable
		 * corner dock has no such failure mode.
		 * ------------------------------------------------------------------ */

		/** The single container every dock card lives in. */
		function dockContainer() {
			var existing = window.document.querySelector("." + PREFIX + "-dock");
			if (existing !== null) return existing;
			var created = window.document.createElement("div");
			created.className = PREFIX + "-dock";
			// Newest card on top, so a fresh run is visible without scrolling.
			created.style.flexDirection = "column-reverse";
			window.document.body.appendChild(created);
			return created;
		}

		function removeDockContainer() {
			var dock = window.document.querySelector("." + PREFIX + "-dock");
			if (dock !== null) dock.remove();
		}

		function renderInline() {
			if (mode !== "inline") {
				for (const root of inlinePanels.values()) root.remove();
				inlinePanels.clear();
				removeDockContainer();
				return;
			}
			var live = new Set();
			for (var i = 0; i < order.length; i += 1) {
				var runId = order[i];
				var run = runs.get(runId);
				if (run === undefined) continue;
				live.add(runId);
				var root = inlinePanels.get(runId);
				if (root === undefined) {
					root = window.document.createElement("div");
					root.className = PREFIX + "-inline";
					root.setAttribute(ATTR_INLINE, "expanded");
					dockContainer().appendChild(root);
					inlinePanels.set(runId, root);
				}
				var collapsed = inlineCollapsed.has(runId);
				root.setAttribute(ATTR_INLINE, collapsed ? "collapsed" : "expanded");
				root.textContent = "";

				var head = window.document.createElement("div");
				head.className = PREFIX + "-head";
				var dot = window.document.createElement("span");
				dot.className = PREFIX + "-dot";
				dot.setAttribute(statusOf(run), "");
				var cmd = window.document.createElement("span");
				cmd.className = PREFIX + "-cmd";
				cmd.textContent = firstLine(run.command, 80) || "command";
				cmd.title = run.command;
				head.appendChild(dot);
				head.appendChild(cmd);

				if (run.status === "running") {
					head.appendChild(inlineButton("stop", function () { killRun(run.runId); }));
				}
				head.appendChild(inlineButton(collapsed ? "expand" : "collapse", function () {
					if (inlineCollapsed.has(run.runId)) inlineCollapsed.delete(run.runId);
					else inlineCollapsed.add(run.runId);
					renderInline();
				}));
				head.appendChild(inlineButton("close", function () { dropRun(run.runId); }));
				root.appendChild(head);

				if (!collapsed) {
					var out = window.document.createElement("pre");
					out.className = PREFIX + "-out";
					if (run.stdout === "" && run.stderr === "") {
						var empty = window.document.createElement("span");
						empty.className = PREFIX + "-note";
						empty.textContent = run.status === "running" ? "running…" : "no output";
						out.appendChild(empty);
					} else {
						out.appendChild(window.document.createTextNode(run.stdout));
					}
					if (run.stderr !== "") {
						var err = window.document.createElement("span");
						err.className = PREFIX + "-err";
						err.textContent = run.stderr;
						out.appendChild(err);
					}
					root.appendChild(out);
					var note = window.document.createElement("div");
					note.className = PREFIX + "-note";
					note.textContent = metaLine(run);
					root.appendChild(note);
				}
			}
			for (const [runId, root] of Array.from(inlinePanels.entries())) {
				if (live.has(runId)) continue;
				root.remove();
				inlinePanels.delete(runId);
			}
			if (inlinePanels.size === 0) removeDockContainer();
		}

		function inlineButton(label, onClick) {
			var button = window.document.createElement("button");
			button.type = "button";
			button.className = PREFIX + "-icon";
			button.textContent = label;
			button.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				onClick();
			});
			return button;
		}

		/* ------------------------------------------------------------------ *
		 * Output surface choice
		 * ------------------------------------------------------------------ */

		/** Switch output mode, moving existing runs onto the new surface. */
		function setMode(next) {
			if (MODES.indexOf(next) < 0 || next === mode) return;
			if (next === "panel" && !panelAvailable) return;
			mode = next;
			persistPrefs();
			if (mode === "panel") {
				for (const root of inlinePanels.values()) root.remove();
				inlinePanels.clear();
				for (var i = 0; i < order.length; i += 1) openRunTab(order[i]);
			} else {
				closeAllRunTabs();
				renderInline();
			}
			notify();
		}

		/* ------------------------------------------------------------------ *
		 * Code-block discovery, Run chip injection
		 * ------------------------------------------------------------------ */

		function languageOf(block) {
			var banner = block.querySelector("[data-code-block-banner]");
			if (banner === null) return null;
			var info = banner.querySelector("div");
			if (info === null) return null;
			var text = (info.textContent ?? "").trim().toLowerCase();
			if (text === "") return null;
			var first = text.split(/[\s,;]+/)[0];
			return first === "" ? null : first;
		}

		function commandOf(block) {
			var pre = block.querySelector("pre");
			var text = pre === null ? "" : (pre.textContent ?? "");
			return text.replace(/\n+$/, "");
		}

		function blockKey(command, language) {
			return (language ?? "") + ":" + hash(command);
		}

		function findBlock(node) {
			if (node === null || node.nodeType !== 1) return null;
			var own = node.matches?.("[data-code-block-banner]") === true ? node : null;
			var seat = own ?? node.querySelector?.("[data-code-block-banner]") ?? null;
			if (seat === null) return null;
			return seat.parentElement?.parentElement ?? null;
		}

		function refreshTargets() {
			var nodes = window.document.querySelectorAll("[" + ATTR_TARGET + "]");
			var text = cwdOverride ?? "";
			for (var i = 0; i < nodes.length; i += 1) {
				nodes[i].textContent = text === "" ? "cwd: session" : text;
			}
		}

		function injectButton(block) {
			var banner = block.querySelector("[data-code-block-banner]");
			if (banner === null) return;
			if (banner.querySelector("[" + ATTR_BUTTON + "]") !== null) return;
			var language = languageOf(block);
			if (language === null || SHELL_LANGUAGES[language] !== true) return;
			var seat = banner.querySelector("div:last-child") ?? banner;

			var button = window.document.createElement("button");
			button.type = "button";
			button.className = PREFIX + "-btn";
			button.setAttribute(ATTR_BUTTON, "idle");
			button.setAttribute("aria-label", "Run this command");
			button.textContent = "▶ " + (LANGUAGE_LABELS[language] ?? "Run");

			var target = window.document.createElement("button");
			target.type = "button";
			target.className = PREFIX + "-target";
			target.setAttribute(ATTR_TARGET, "1");
			target.title = "Working directory for this command";
			target.textContent = "…";

			button.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				pressButton(block, language, button);
			});
			target.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				var field = window.prompt("Working directory for this command:", cwdOverride ?? "");
				if (field === null) return;
				var value = field.trim();
				cwdOverride = value === "" ? null : value;
				persistPrefs();
				refreshTargets();
			});

			seat.appendChild(target);
			seat.appendChild(button);
			refreshTargets();
		}

		/**
		 * The chip's single click entry: start this block, or stop the run this
		 * block is already driving. The label is a promise, so it must behave
		 * like one — showing "Stop" and starting a second process would be worse
		 * than having no stop control at all.
		 */
		function pressButton(block, language, button) {
			var key = blockKey(commandOf(block), language);
			var runId = attached.get(key);
			var run = runId === undefined ? undefined : runs.get(runId);
			if (run !== undefined && run.status === "running") {
				button.disabled = true;
				callHost("kill", { runId: run.runId }).then(
					function () {
						button.disabled = false;
						startPoll(run.runId);
					},
					function (error) {
						button.disabled = false;
						button.title = String(error);
					},
				);
				return;
			}
			runCommand(block, language, button);
		}

		function runCommand(block, language, button) {
			var command = commandOf(block);
			if (command.trim() === "") return;
			var key = blockKey(command, language);
			button.disabled = true;
			var request = { command: command, language: language };
			if (cwdOverride !== null) request.cwd = cwdOverride;
			if (currentSessionId !== null) request.sessionId = currentSessionId;
			callHost("start", request).then(
				function (view) {
					button.disabled = false;
					if (view === null || typeof view !== "object" || typeof view.runId !== "string") {
						button.setAttribute(ATTR_BUTTON, "failed");
						return;
					}
					applyView(view.runId, view);
					attached.set(key, view.runId);
					if (view.cwd !== null && cwdOverride === null) cwdOverride = view.cwd;
					if (mode === "panel") openRunTab(view.runId);
					else if (mode === "inline") renderInline();
					startPoll(view.runId);
					refreshButtons();
					refreshTargets();
					persistRuns();
					notify();
				},
				function (error) {
					button.disabled = false;
					button.setAttribute(ATTR_BUTTON, "failed");
					button.title = String(error);
				},
			);
		}

		/** Sync every injected chip with the state of its attached run. */
		function refreshButtons() {
			var nodes = window.document.querySelectorAll("[" + ATTR_BUTTON + "]");
			for (var i = 0; i < nodes.length; i += 1) {
				var button = nodes[i];
				var block = findBlock(button);
				if (block === null) continue;
				var language = languageOf(block);
				var runId = attached.get(blockKey(commandOf(block), language));
				var run = runId === undefined ? undefined : runs.get(runId);
				if (run === undefined) continue;
				var status = statusOf(run);
				button.setAttribute(ATTR_BUTTON, status);
				var label = LANGUAGE_LABELS[language] ?? "Run";
				if (status === "running") button.textContent = "■ Stop";
				else if (status === "done") button.textContent = "✓ " + label;
				else if (status === "failed") button.textContent = "✕ " + label;
				else if (status === "stopped") button.textContent = "⏹ " + label;
				else button.textContent = "▶ " + label;
			}
		}

		function scan() {
			var banners = window.document.querySelectorAll("[data-code-block-banner]");
			for (var i = 0; i < banners.length; i += 1) {
				var block = banners[i].parentElement?.parentElement ?? null;
				if (block !== null) injectButton(block);
			}
			refreshButtons();
			renderInline();
		}

		function scheduleScan() {
			if (scanPending) return;
			scanPending = true;
			scanTimer = window.setTimeout(function () {
				scanPending = false;
				scanTimer = null;
				scan();
			}, SCAN_MS);
		}

		/* ------------------------------------------------------------------ *
		 * Composer dock: run list plus the output-surface switch
		 * ------------------------------------------------------------------ */

		function RunStrip(props) {
			var sessionId = typeof props.sessionId === "string" ? props.sessionId : null;
			var [tick, setTick] = react.useState(0);
			react.useEffect(
				function () {
					if (sessionId !== null) currentSessionId = sessionId;
					return subscribe(function () { setTick(function (value) { return value + 1; }); });
				},
				[sessionId],
			);
			void tick;

			var chips = [];
			for (var i = order.length - 1; i >= 0; i -= 1) {
				var run = runs.get(order[i]);
				if (run === undefined) continue;
				chips.push(react.createElement(
					"button",
					{
						key: run.runId,
						type: "button",
						className: PREFIX + "-dockBtn",
						title: run.command,
						onClick: function () {
							if (mode === "panel") openRunTab(run.runId);
							else if (mode === "inline") {
								inlineCollapsed.delete(run.runId);
								renderInline();
								notify();
							}
						},
					},
					statusGlyph(statusOf(run)) + " " + (firstLine(run.command, 40) || "command"),
				));
			}

			var modeButtons = MODES.map(function (candidate) {
				var unavailable = candidate === "panel" && !panelAvailable;
				return react.createElement(
					"button",
					{
						key: candidate,
						type: "button",
						className: PREFIX + "-mode",
						"data-on": mode === candidate ? "1" : "0",
						disabled: unavailable,
						title: unavailable ? "Needs the dsh-better-sidebar plugin" : MODE_TITLES[candidate],
						onClick: function () { setMode(candidate); },
					},
					MODE_LABELS[candidate],
				);
			});

			return react.createElement(
				"div",
				{ className: PREFIX + "-strip" },
				chips,
				react.createElement("div", { className: PREFIX + "-modes" }, modeButtons),
			);
		}

		/* ------------------------------------------------------------------ *
		 * Lifecycle
		 * ------------------------------------------------------------------ */

		function start() {
			if (started) return;
			started = true;
			readPrefs();
			if (mode === "panel" && !panelAvailable) mode = INLINE_BY_DEFAULT;
			restoreRuns();
			scheduleScan();
			callHost("info", {}).then(
				function (result) {
					if (result !== null && typeof result === "object" && typeof result.workspaceRoot === "string" && cwdOverride === null) {
						cwdOverride = result.workspaceRoot;
						refreshTargets();
					}
				},
				function () {},
			);
			observer = new window.MutationObserver(function (records) {
				for (var i = 0; i < records.length; i += 1) {
					var added = records[i].addedNodes;
					for (var j = 0; j < added.length; j += 1) {
						if (added[j].nodeType === 1) { scheduleScan(); return; }
					}
				}
			});
			observer.observe(window.document.body, { childList: true, subtree: true });
			// The transcript virtualizes above 100 records, so rows re-enter the DOM
			// on scroll and need their Run chips re-created.
			window.addEventListener("scroll", scheduleScan, true);
			if (mode === "panel") {
				for (var k = 0; k < order.length; k += 1) openRunTab(order[k]);
			} else {
				renderInline();
			}
			notify();
		}

		function stop() {
			if (!started) return;
			started = false;
			if (observer !== null) observer.disconnect();
			observer = null;
			if (scanTimer !== null) window.clearTimeout(scanTimer);
			scanTimer = null;
			window.removeEventListener("scroll", scheduleScan, true);
			for (const run of runs.values()) if (run.timer !== undefined) window.clearInterval(run.timer);
			var stale = window.document.querySelectorAll("[" + ATTR_BUTTON + "],[" + ATTR_TARGET + "]");
			for (var i = 0; i < stale.length; i += 1) stale[i].remove();
			for (const root of inlinePanels.values()) root.remove();
			inlinePanels.clear();
			removeDockContainer();
			closeAllRunTabs();
			runs.clear();
			order = [];
			attached.clear();
			listeners.clear();
		}

		/**
		 * Insert this plugin's stylesheet.
		 *
		 * The dynamic Cordis plugin sandbox hands out a `styles` builtin, but a real
		 * package bundle gets no ambient globals — calling it here threw
		 * "styles is not defined" inside apply() and took the whole page down. Own
		 * the style element ourselves instead, keyed by a data attribute so a reload
		 * replaces its own tag rather than stacking duplicates.
		 */
		function insertStyles() {
			if (window.document === undefined) return;
			var tag = window.document.querySelector('style[data-plugin-css="dsh-run-button"]');
			if (tag === null) {
				tag = window.document.createElement("style");
				tag.setAttribute("data-plugin", "dsh-run-button");
				tag.setAttribute("data-plugin-css", "dsh-run-button");
				window.document.head.appendChild(tag);
			}
			tag.textContent = CSS;
			return function () {
				tag.remove();
			};
		}

		function apply(ctx) {
			var disposeStyles = null;
			var disposeTab = null;
			try {
				disposeStyles = insertStyles();

				var connection = ctx.get("connection");
				if (connection !== undefined && connection.rpc !== undefined) rpc = connection.rpc;

				// dsh-better-sidebar is an optional peer. When it is mounted, runs can
				// report into a real workbench tab next to its terminal; when it is not,
				// inline output is the default and nothing else changes.
				sidebar = ctx.get("betterSidebar") ?? null;
				panelAvailable = probeSidebar();
				disposeTab = mountSidebarTab();

				start();

				var slots = ctx.get("slots");
				if (slots !== undefined) {
					slots.inject("conversation.input.dock", function () {
						return slots.register({ name: "conversation.input.dock", id: "dsh-run-button" }, RunStrip);
					});
				}
			} catch (error) {
				// A plugin fault must never become a page fault: report it, undo what
				// did mount, and let the rest of the composition load.
				console.error("dsh-run-button: apply failed", error);
				try {
					stop();
				} catch (cleanupError) {
					console.error("dsh-run-button: cleanup after a failed apply also failed", cleanupError);
				}
				if (typeof disposeTab === "function") {
					try { disposeTab(); } catch (tabError) { /* already gone */ }
				}
				if (typeof disposeStyles === "function") {
					try { disposeStyles(); } catch (styleError) { /* already gone */ }
				}
				return;
			}

			ctx.effect(function () {
				return function () {
					if (typeof disposeTab === "function") disposeTab();
					if (typeof disposeStyles === "function") disposeStyles();
					stop();
				};
			}, "dsh-run-button: dom teardown");
		}

		var inject = ["slots", "connection"];
		exports.apply = apply;
		exports.inject = inject;
		exports.name = "dsh-run-button";
		return module.exports;
	}
});
