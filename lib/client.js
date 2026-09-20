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
		var ATTR_RUN = "data-dsh-run-id";
		/** Bottom-workbench tab id, shared by the descriptor and every open call. */
		var RUN_TAB_ID = "dsh-run-button:runs";
		/** Dedicated loopback-only RPC channel registered by this package's Host half. */
		var CHANNEL = "/dsh-run-button";
		var POLL_MS = 180;
		var SCAN_MS = 120;
		var RUN_IDLE_REOPEN_MS = 1000;

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
			"." + PREFIX + "-dockRow{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0}",
			"." + PREFIX + "-dockBtn{margin-left:0;padding:0 8px;font:inherit;font-size:11px;line-height:20px;cursor:pointer;",
			"color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l1);",
			"border-radius:5px;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			"." + PREFIX + "-dockBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}",
			"." + PREFIX + "-root{display:flex;flex-direction:column;height:100%;min-height:0;",
			"font-size:12px;color:var(--dsw-alias-label-primary)}",
			"." + PREFIX + "-bar{display:flex;align-items:center;gap:8px;padding:6px 10px;flex:none;",
			"border-bottom:1px solid var(--dsw-alias-border-l1)}",
			"." + PREFIX + "-barTitle{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;",
			"white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11px}",
			"." + PREFIX + "-action{padding:1px 8px;font:inherit;font-size:11px;line-height:18px;cursor:pointer;",
			"color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l1);",
			"border-radius:5px}",
			"." + PREFIX + "-action:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}",
			"." + PREFIX + "-list{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 10px 12px}",
			"." + PREFIX + "-card{margin:0 0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden}",
			"." + PREFIX + "-cardHead{display:flex;align-items:center;gap:6px;padding:5px 8px;",
			"background:var(--dsw-alias-bg-layer-2)}",
			"." + PREFIX + "-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-secondary)}",
			"." + PREFIX + "-dot[running]{background:var(--dsw-alias-state-warn-primary)}",
			"." + PREFIX + "-dot[done]{background:var(--dsw-alias-state-success-primary)}",
			"." + PREFIX + "-dot[failed]{background:var(--dsw-alias-state-error-primary)}",
			"." + PREFIX + "-cmd{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
			"font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}",
			"." + PREFIX + "-icon{flex:none;padding:1px 6px;font:inherit;font-size:11px;line-height:16px;cursor:pointer;",
			"color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid transparent;border-radius:4px}",
			"." + PREFIX + "-icon:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}",
			"." + PREFIX + "-out{margin:0;padding:8px 10px;max-height:320px;overflow:auto;",
			"font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:17px;",
			"white-space:pre-wrap;word-break:break-word}",
			"." + PREFIX + "-err{color:var(--dsw-alias-state-error-primary)}",
			"." + PREFIX + "-note{padding:4px 10px 6px;font-size:11px;color:var(--dsw-alias-label-secondary)}",
			"." + PREFIX + "-empty{padding:14px 4px;color:var(--dsw-alias-label-secondary);line-height:1.7}",
		].join("");

		/* ------------------------------------------------------------------ *
		 * Run store (module scope, per Client run)
		 * ------------------------------------------------------------------ */

		/** @type {Map<string, object>} runId -> run state, mirrored from the Host. */
		var runs = new Map();
		/** @type {Array<{runId: string, open: boolean}>} render order, newest last. */
		var order = [];
		/** The Connection RPC service, bound in apply(); every call goes through it. */
		var rpc = null;
		/** dsh-better-sidebar's service, bound in apply() when that plugin is present. */
		var sidebar = null;
		/** Session the page is showing, supplied by the composer dock slot. */
		var currentSessionId = null;
		/** Per-session working-directory override chosen from the chip. */
		var cwdOverride = null;
		/** Code-block identity -> last run id, so a re-rendered block reattaches. */
		var attached = new Map();
		var storageKey = "dsh-run-button:runs";
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

		function persist() {
			try {
				var payload = { runs: [], cwd: cwdOverride };
				for (var i = 0; i < order.length; i += 1) {
					var current = runs.get(order[i].runId);
					if (current !== undefined) payload.runs.push(current.runId);
				}
				window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
			} catch (error) {
				/* session storage is optional; runs simply do not survive a refresh */
			}
		}

		/**
		 * Re-adopt run ids after a page refresh. The run buffers live on the Host
		 * (until their TTL), so restoring the ids is enough to repaint them.
		 */
		function restore() {
			var parsed
			try {
				var raw = window.sessionStorage.getItem(storageKey);
				if (raw === null) return;
				parsed = JSON.parse(raw);
			} catch (error) {
				return
			}
			if (parsed === null || typeof parsed !== "object") return;
			if (typeof parsed.cwd === "string") cwdOverride = parsed.cwd;
			var list = Array.isArray(parsed.runs) ? parsed.runs : [];
			for (var i = 0; i < list.length; i += 1) {
				if (typeof list[i] !== "string") continue;
				state(list[i]);
				order.push({ runId: list[i], open: true });
				startPoll(list[i]);
			}
		}

		function state(runId) {
			var existing = runs.get(runId);
			if (existing === undefined) {
				existing = {
					runId: runId, command: "", status: "running", stdout: "", stderr: "",
					exitCode: null, cwd: null, sandboxMode: null, error: null,
					truncated: false, sessionId: null, open: true,
				};
				runs.set(runId, existing);
			}
			return existing;
		}

		function entryFor(runId) {
			for (var i = 0; i < order.length; i += 1) if (order[i].runId === runId) return order[i];
			return undefined;
		}

		function upsert(runId) {
			if (entryFor(runId) === undefined) order.push({ runId: runId, open: true });
			return state(runId);
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
			if (typeof view.sessionId === "string") current.sessionId = view.sessionId;
			return current;
		}

		/** Display status folds the host's raw status plus its exit code. */
		function statusOf(run) {
			if (run.status === "killed") return "stopped";
			if (run.status === "completed") return run.exitCode !== null && run.exitCode !== 0 ? "failed" : "done";
			return run.status;
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

		function startPoll(runId) {
			var current = state(runId);
			if (current.timer !== undefined) return;
			var tick = function () {
				callHost("output", { runId: runId }).then(
					function (view) {
						if (view === null || typeof view !== "object") {
							stopPoll(runId, "failed");
							return;
						}
						var updated = applyView(runId, view);
						notify();
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
			var current = state(runId);
			if (current.timer !== undefined) {
				window.clearInterval(current.timer);
				current.timer = undefined;
			}
			if (status !== undefined) current.status = status;
			persist();
			notify();
		}

		/* ------------------------------------------------------------------ *
		 * Bottom workbench tab
		 * ------------------------------------------------------------------ */

		/** Focus the run-output tab, creating it when the panel has none. */
		function openRunTab() {
			if (sidebar === null || typeof sidebar.openTab !== "function") return;
			var now = Date.now();
			if (now - lastTabOpen < RUN_IDLE_REOPEN_MS) return;
			lastTabOpen = now;
			try {
				sidebar.openTab({ id: RUN_TAB_ID, type: RUN_TAB_ID, title: "Run output", target: "bottom" });
			} catch (error) {
				console.error("dsh-run-button: could not open the run-output tab", error);
			}
		}

		/**
		 * Register the output tab on dsh-better-sidebar's bottom workbench.
		 * Returns a disposer, or null when that plugin is absent — the host RPC
		 * channel is what makes runs work, so a missing sidebar degrades to
		 * executed commands with no output surface rather than a broken plugin.
		 */
		function mountSidebarTab(ctx) {
			if (sidebar === null || typeof sidebar.registerTab !== "function") return null;
			var dispose = sidebar.registerTab({
				id: RUN_TAB_ID,
				title: function () { return "Run output"; },
				description: function () { return "Output of commands started from the Run button in code blocks"; },
				order: 60,
				single: true,
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

		/** The tab body: every run this session started, newest last. */
		function RunTab() {
			var [tick, setTick] = react.useState(0);
			react.useEffect(
				function () {
					// A tick bump is what re-renders the list; the store is the source.
					return subscribe(function () { setTick(function (value) { return value + 1; }); });
				},
				[],
			);
			void tick;

			var items = [];
			for (var i = 0; i < order.length; i += 1) {
				var run = runs.get(order[i].runId);
				if (run !== undefined) items.push({ entry: order[i], run: run });
			}
			var running = 0;
			for (var j = 0; j < items.length; j += 1) if (items[j].run.status === "running") running += 1;

			var children = [
				react.createElement(
					"div",
					{ className: PREFIX + "-bar", key: "bar" },
					react.createElement("span", { className: PREFIX + "-barTitle" }, running > 0
						? running + " running · " + items.length + " total"
						: items.length + " run" + (items.length === 1 ? "" : "s")),
					react.createElement("button", {
						type: "button",
						className: PREFIX + "-action",
						onClick: function () {
							var kept = [];
							for (var k = 0; k < order.length; k += 1) {
								var current = runs.get(order[k].runId);
								var active = current !== undefined && current.status === "running";
								if (active) kept.push(order[k]);
								else if (current !== undefined) runs.delete(order[k].runId);
							}
							order = kept;
							persist();
							notify();
						},
					}, "Clear finished"),
				),
			];

			if (items.length === 0) {
				children.push(react.createElement(
					"div",
					{ className: PREFIX + "-empty", key: "empty" },
					"No runs yet. Press the ▶ button on a shell code block in the chat — the command runs on the host and its output appears here.",
				));
			} else {
				var cards = [];
				items.reverse();
				for (var m = 0; m < items.length; m += 1) {
					var run = items[m].run;
					var status = statusOf(run);
					var head = react.createElement(
						"div",
						{ className: PREFIX + "-cardHead", key: "h" },
						react.createElement("span", { className: PREFIX + "-dot", "data-status": status }),
						react.createElement("span", { className: PREFIX + "-cmd", title: run.command }, run.command || "command"),
						run.status === "running"
							? react.createElement("button", {
								type: "button",
								className: PREFIX + "-icon",
								onClick: function () {
									callHost("kill", { runId: run.runId }).then(function () { startPoll(run.runId); }, function () {});
								},
							}, "stop")
							: null,
						react.createElement("button", {
							type: "button",
							className: PREFIX + "-icon",
							onClick: function () {
								var entry = entryFor(run.runId);
								if (entry !== undefined) entry.open = !entry.open;
								notify();
							},
						}, run.open === false ? "expand" : "collapse"),
						react.createElement("button", {
							type: "button",
							className: PREFIX + "-icon",
							onClick: function () {
								if (run.status === "running") callHost("kill", { runId: run.runId }).then(function () {}, function () {});
								order = order.filter(function (item) { return item.runId !== run.runId; });
								runs.delete(run.runId);
								persist();
								notify();
							},
						}, "close"),
					);

					var body = [];
					if (run.open !== false) {
						body.push(react.createElement(
							"pre",
							{ className: PREFIX + "-out", key: "out" },
							run.stdout === ""
								? react.createElement("span", { className: PREFIX + "-err" }, "")
								: run.stdout,
							run.stderr !== "" ? react.createElement("span", { className: PREFIX + "-err" }, run.stderr) : null,
						));
					}
					var meta = [];
					meta.push(status === "running" ? "running…" : status === "stopped" ? "stopped" : "exit " + String(run.exitCode === null ? "?" : run.exitCode));
					if (run.cwd !== null) meta.push(run.cwd);
					if (run.sandboxMode !== null) meta.push("sandbox: " + run.sandboxMode);
					if (run.truncated) meta.push("output truncated");
					if (run.error !== null) meta.push(run.error);
					body.push(react.createElement("div", { className: PREFIX + "-note", key: "note" }, meta.join(" · ")));

					cards.push(react.createElement(
						"div",
						{ className: PREFIX + "-card", key: run.runId, "data-dsh-run-id": run.runId },
						head,
						body,
					));
				}
				children.push(react.createElement("div", { className: PREFIX + "-list", key: "list" }, cards));
			}

			return react.createElement("div", { className: PREFIX + "-root" }, children);
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
			var nodes = document.querySelectorAll("[" + ATTR_TARGET + "]");
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

			var button = document.createElement("button");
			button.type = "button";
			button.className = PREFIX + "-btn";
			button.setAttribute(ATTR_BUTTON, "idle");
			button.setAttribute("aria-label", "Run this command");
			button.textContent = "▶ " + (LANGUAGE_LABELS[language] ?? "Run");

			var target = document.createElement("button");
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
				persist();
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
					openRunTab();
					startPoll(view.runId);
					refreshButtons();
					refreshTargets();
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
			var nodes = document.querySelectorAll("[" + ATTR_BUTTON + "]");
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
			var banners = document.querySelectorAll("[data-code-block-banner]");
			for (var i = 0; i < banners.length; i += 1) {
				var block = banners[i].parentElement?.parentElement ?? null;
				if (block !== null) injectButton(block);
			}
			refreshButtons();
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
		 * Composer dock: a compact strip of live runs
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
			if (order.length === 0) return null;
			var items = [];
			for (var i = 0; i < order.length; i += 1) {
				var run = runs.get(order[i].runId);
				if (run === undefined) continue;
				items.push(react.createElement(
					"button",
					{
						key: run.runId,
						type: "button",
						className: PREFIX + "-dockBtn",
						title: run.command,
						onClick: openRunTab,
					},
					(statusOf(run) === "running" ? "■ " : statusOf(run) === "done" ? "✓ " : statusOf(run) === "stopped" ? "⏹ " : "✕ ")
						+ (run.command || "command").split("\n")[0].slice(0, 60),
				));
			}
			return react.createElement("div", { className: PREFIX + "-dockRow", key: "runs" }, items);
		}

		/* ------------------------------------------------------------------ *
		 * Lifecycle
		 * ------------------------------------------------------------------ */

		function start() {
			if (started) return;
			started = true;
			restore();
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
			observer = new MutationObserver(function (records) {
				for (var i = 0; i < records.length; i += 1) {
					var added = records[i].addedNodes;
					for (var j = 0; j < added.length; j += 1) {
						if (added[j].nodeType === 1) { scheduleScan(); return; }
					}
				}
			});
			observer.observe(document.body, { childList: true, subtree: true });
			notify();
		}

		function stop() {
			if (!started) return;
			started = false;
			if (observer !== null) observer.disconnect();
			observer = null;
			if (scanTimer !== null) window.clearTimeout(scanTimer);
			scanTimer = null;
			for (const run of runs.values()) if (run.timer !== undefined) window.clearInterval(run.timer);
			var buttons = document.querySelectorAll("[" + ATTR_BUTTON + "],[" + ATTR_TARGET + "]");
			for (var i = 0; i < buttons.length; i += 1) buttons[i].remove();
			runs.clear();
			order = [];
			attached.clear();
			listeners.clear();
		}

		function apply(ctx) {
			styles.insert(CSS);

			var connection = ctx.get("connection");
			if (connection !== undefined && connection.rpc !== undefined) rpc = connection.rpc;

			// dsh-better-sidebar is an optional peer: when it is mounted, runs get a
			// real workbench tab next to its terminal; when it is not, the plugin
			// still executes commands through the Host channel.
			sidebar = ctx.get("betterSidebar") ?? null;
			var disposeTab = mountSidebarTab(ctx);

			start();

			var slots = ctx.get("slots");
			if (slots !== undefined) {
				slots.inject("conversation.input.dock", function () {
					return slots.register({ name: "conversation.input.dock", id: "dsh-run-button" }, RunStrip);
				});
			}

			ctx.effect(function () {
				return function () {
					if (typeof disposeTab === "function") disposeTab();
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
