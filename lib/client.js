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
		var ATTR_PANEL = "data-dsh-run-panel";
		var ATTR_RUN = "data-dsh-run-id";
		var ATTR_BLOCK = "data-dsh-run-block";
		var POLL_MS = 180;
		var MAX_PANELS = 4;
		var SCAN_MS = 120;
		/** Dedicated loopback-only RPC channel registered by this package's Host half. */
		var CHANNEL = "/dsh-run-button";

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
			"." + PREFIX + "-target{display:inline-flex;align-items:center;margin-left:6px;padding:0 6px;",
			"font:inherit;font-size:10px;line-height:16px;color:var(--dsw-alias-label-secondary);",
			"background:transparent;border:1px dashed var(--dsw-alias-border-l1);border-radius:4px;cursor:pointer;",
			"max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			"." + PREFIX + "-target:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}",
			"." + PREFIX + "-panel{position:fixed;z-index:60;box-sizing:border-box;display:flex;flex-direction:column;",
			"border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);",
			"box-shadow:0 12px 32px rgba(0,0,0,.28);overflow:hidden;font-size:12px;",
			"color:var(--dsw-alias-label-primary)}",
			"." + PREFIX + "-head{display:flex;align-items:center;gap:6px;padding:6px 8px;",
			"border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}",
			"." + PREFIX + "-status{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-secondary)}",
			"." + PREFIX + "-status[running]{background:var(--dsw-alias-state-warn-primary)}",
			"." + PREFIX + "-status[done]{background:var(--dsw-alias-state-success-primary)}",
			"." + PREFIX + "-status[failed]{background:var(--dsw-alias-state-error-primary)}",
			"." + PREFIX + "-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
			"font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;",
			"color:var(--dsw-alias-label-secondary)}",
			"." + PREFIX + "-icon{flex:none;padding:1px 6px;font:inherit;font-size:11px;line-height:16px;cursor:pointer;",
			"color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid transparent;border-radius:4px}",
			"." + PREFIX + "-icon:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}",
			"." + PREFIX + "-body{margin:0;padding:8px 10px;max-height:220px;overflow:auto;",
			"font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:17px;",
			"white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}",
			"." + PREFIX + "-panel[data-expanded=1] ." + PREFIX + "-body{max-height:52vh}",
			"." + PREFIX + "-stderr{color:var(--dsw-alias-state-error-primary)}",
			"." + PREFIX + "-note{padding:4px 10px 6px;font-size:11px;color:var(--dsw-alias-label-secondary)}",
			"." + PREFIX + "-empty{padding:8px 10px;color:var(--dsw-alias-label-secondary)}",
			"." + PREFIX + "-dockBtn{margin-left:6px;padding:0 8px;font:inherit;font-size:11px;line-height:20px;cursor:pointer;",
			"color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l1);",
			"border-radius:5px}",
			"." + PREFIX + "-dockBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}",
		].join("");

		/* ------------------------------------------------------------------ *
		 * Run store (module scope, per Client run)
		 * ------------------------------------------------------------------ */

		/** The Connection RPC service, bound in apply(); every call goes through it. */
		var rpc = null;

		/**
		 * Call one endpoint on this package's Host channel.
		 * Accepts a `{ ok, value }` result and rejects only on a transport or
		 * endpoint failure, so callers keep ordinary promise semantics.
		 */
		function callHost(endpoint, args) {
			if (rpc === null || typeof rpc.call !== "function") {
				return Promise.reject(new Error("dsh-run-button: Connection RPC is unavailable"));
			}
			return rpc.call(CHANNEL, endpoint, args ?? {}).then(function (result) {
				if (result === null || typeof result !== "object" || result.ok !== true) {
					var message = typeof result?.error?.message === "string" ? result.error.message : "run request failed";
					throw new Error(message);
				}
				return result.value;
			});
		}

		/** @type {Map<string, RunState>} */
		var runs = new Map();
		/** runId -> the exact command text, for panel titles. */
		var commands = new Map();
		/** @type {Array<{root: HTMLElement, runId: string, key: string, open: boolean}>} */
		var panels = [];
		var sessionTarget = { cwd: null };
		/** Code-block identity -> last run, so a re-rendered block reattaches. */
		var attached = new Map();
		var sessionKey = "dsh-run-button:runs";
		var started = false;
		var scanTimer = null;
		var scanPending = false;
		var observer = null;

		function hash(text) {
			var value = 5381;
			for (var i = 0; i < text.length; i += 1) {
				value = ((value << 5) + value + text.charCodeAt(i)) | 0;
			}
			return (value >>> 0).toString(36);
		}

		function persist() {
			try {
				var payload = [];
				for (var i = 0; i < panels.length; i += 1) {
					panels[i].runId && payload.push({ key: panels[i].key, runId: panels[i].runId, open: panels[i].open });
				}
				window.sessionStorage.setItem(sessionKey, JSON.stringify({ panels: payload, cwd: sessionTarget.cwd }));
			} catch (error) {
				/* session storage is optional; runs simply do not survive a refresh */
			}
		}

		function restore() {
			var parsed
			try {
				var raw = window.sessionStorage.getItem(sessionKey);
				if (raw === null) return;
				parsed = JSON.parse(raw);
			} catch (error) {
				return;
			}
			if (parsed === null || typeof parsed !== "object") return;
			if (typeof parsed.cwd === "string") sessionTarget.cwd = parsed.cwd;
			// Run buffers live on the Host and survive a page refresh, so re-adopt
			// the ids and let the next poll restore their text.
			var list = Array.isArray(parsed.panels) ? parsed.panels : [];
			for (var i = 0; i < list.length; i += 1) {
				var item = list[i];
				if (item === null || typeof item !== "object") continue;
				if (typeof item.runId !== "string" || typeof item.key !== "string") continue;
				if (!runs.has(item.runId)) {
					runs.set(item.runId, {
						runId: item.runId, status: "running", stdout: "", stderr: "", exitCode: null,
						cwd: null, sandboxMode: null, error: null, truncated: false, finishedAt: null,
					});
				}
				panels.push({ root: null, runId: item.runId, key: item.key, open: item.open !== false });
				attached.set(item.key, item.runId);
				startPoll(item.runId);
			}
		}

		function state(runId) {
			var existing = runs.get(runId);
			if (existing === undefined) {
				existing = {
					runId: runId, status: "running", stdout: "", stderr: "", exitCode: null,
					cwd: null, sandboxMode: null, error: null, truncated: false, finishedAt: null,
				};
				runs.set(runId, existing);
			}
			return existing;
		}

		function applyView(runId, view) {
			var current = state(runId);
			current.status = typeof view.status === "string" ? view.status : current.status;
			current.stdout = typeof view.stdout === "string" ? view.stdout : current.stdout;
			current.stderr = typeof view.stderr === "string" ? view.stderr : current.stderr;
			current.exitCode = typeof view.exitCode === "number" ? view.exitCode : null;
			current.cwd = typeof view.cwd === "string" ? view.cwd : current.cwd;
			current.sandboxMode = typeof view.sandboxMode === "string" ? view.sandboxMode : current.sandboxMode;
			current.error = typeof view.error === "string" ? view.error : null;
			current.truncated = view.stdoutTruncated === true || view.stderrTruncated === true;
			current.finishedAt = typeof view.finishedAt === "number" ? view.finishedAt : null;
			return current;
		}

		function startPoll(runId) {
			var current = state(runId);
			if (current.timer !== undefined) return;
			var tick = function () {
				callHost("output", { runId: runId }).then(
					function (result) {
						if (result === null || typeof result !== "object") {
							stopPoll(runId, "failed");
							return;
						}
						var view = applyView(runId, result);
						renderAll();
						if (view.status !== "running") stopPoll(runId, view.status);
					},
					function () {
						// A transient RPC failure must not kill a live process; keep polling.
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
			renderAll();
		}

		/* ------------------------------------------------------------------ *
		 * Code-block discovery and button injection
		 * ------------------------------------------------------------------ */

		function languageOf(block) {
			var banner = block.querySelector("[" + "data-code-block-banner" + "]");
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
			if (text === "" && pre === null) {
				var content = block.querySelector("[" + "data-code-block-content" + "]");
				text = content === null ? "" : (content.textContent ?? "");
			}
			return text.replace(/\n+$/, "");
		}

		function blockKey(command, language) {
			return (language ?? "") + ":" + hash(command);
		}

		function findBlock(node) {
			if (node === null || node.nodeType !== 1) return null;
			var banner = node.querySelector?.("[" + "data-code-block-banner" + "]") ?? null;
			var own = node.matches?.("[" + "data-code-block-banner" + "]") === true ? node : null;
			var seat = banner ?? own;
			if (seat === null) return null;
			return seat.parentElement?.parentElement ?? null;
		}

		function openPanelFor(key, runId) {
			var existing = null;
			for (var i = 0; i < panels.length; i += 1) if (panels[i].key === key) existing = panels[i];
			if (existing !== null) {
				existing.runId = runId;
				existing.open = true;
				renderAll();
				return;
			}
			while (panels.length >= MAX_PANELS) {
				var dropped = panels.shift();
				dropped?.root?.remove();
			}
			panels.push({ root: null, runId: runId, key: key, open: true });
		}

		function injectButton(block) {
			var banner = block.querySelector("[" + "data-code-block-banner" + "]");
			if (banner === null) return;
			if (banner.querySelector("[" + ATTR_BUTTON + "]") !== null) return;
			var language = languageOf(block);
			if (language === null || SHELL_LANGUAGES[language] !== true) return;
			var action = banner.querySelector("div:last-child");
			var seat = action ?? banner;

			var button = document.createElement("button");
			button.type = "button";
			button.className = PREFIX + "-btn";
			button.setAttribute(ATTR_BUTTON, "idle");
			button.setAttribute("aria-label", "Run this command");
			button.textContent = "▶ " + (LANGUAGE_LABELS[language] ?? "Run");

			var target = document.createElement("button");
			target.type = "button";
			target.className = PREFIX + "-target";
			target.title = "Change the working directory for this run";
			target.textContent = "…";

			button.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				runCommand(block, language, button);
			});
			target.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				chooseTarget(target, function (chosen) {
					sessionTarget.cwd = chosen;
					persist();
					refreshTargets();
				});
			});

			seat.appendChild(target);
			seat.appendChild(button);
			refreshTargets();
		}

		/** Paint every injected target chip with the directory the run will use. */
		function refreshTargets() {
			var nodes = document.querySelectorAll("." + PREFIX + "-target");
			for (var i = 0; i < nodes.length; i += 1) {
				var text = sessionTarget.cwd ?? "";
				nodes[i].textContent = text === "" ? "cwd: session" : text;
			}
		}

		function chooseTarget(anchor, done) {
			var field = window.prompt("Working directory for this command:", sessionTarget.cwd ?? "");
			if (field === null) return;
			var value = field.trim();
			done(value === "" ? null : value);
		}

		function runCommand(block, language, button) {
			var command = commandOf(block);
			if (command.trim() === "") return;
			var key = blockKey(command, language);
			button.setAttribute(ATTR_BUTTON, "idle");
			button.disabled = true;
			var request = { command: command, language: language };
			if (sessionTarget.cwd !== null) request.cwd = sessionTarget.cwd;
			if (currentSessionId !== null) request.sessionId = currentSessionId;
			callHost("start", request).then(
				function (view) {
					button.disabled = false;
					if (view === null || typeof view !== "object" || typeof view.runId !== "string") {
						button.setAttribute(ATTR_BUTTON, "failed");
						return;
					}
					commands.set(view.runId, command);
					applyView(view.runId, view);
					attached.set(key, view.runId);
					if (view.cwd !== null && sessionTarget.cwd === null) sessionTarget.cwd = view.cwd;
					openPanelFor(key, view.runId);
					startPoll(view.runId);
					refreshButtons();
				},
				function (error) {
					button.disabled = false;
					button.setAttribute(ATTR_BUTTON, "failed");
					button.title = String(error);
				},
			);
		}

		/** Sync every injected button with the state of its attached run. */
		function refreshButtons() {
			var nodes = document.querySelectorAll("[" + ATTR_BUTTON + "]");
			for (var i = 0; i < nodes.length; i += 1) {
				var button = nodes[i];
				var block = findBlock(button);
				if (block === null) continue;
				var language = languageOf(block);
				var key = blockKey(commandOf(block), language);
				var runId = attached.get(key);
				var run = runId === undefined ? undefined : runs.get(runId);
				if (run === undefined) continue;
				var status = run.status === "completed" && run.exitCode !== 0 && run.exitCode !== null
					? "failed"
					: run.status === "killed" ? "failed" : run.status === "completed" ? "done" : run.status;
				button.setAttribute(ATTR_BUTTON, status);
				var label = LANGUAGE_LABELS[language] ?? "Run";
				if (status === "running") button.textContent = "■ Stop";
				else if (status === "done") button.textContent = "✓ " + label;
				else if (status === "failed") button.textContent = "✕ " + label;
				else button.textContent = "▶ " + label;
			}
		}

		function scan(root) {
			var scope = root !== null && root.nodeType === 1 ? root : document;
			var banner
			if (scope.matches?.("[" + "data-code-block-banner" + "]") === true) banner = scope;
			else banner = scope.querySelector?.("[" + "data-code-block-banner" + "]") ?? null;
			var blocks = [];
			if (banner !== null) blocks.push(banner.parentElement?.parentElement);
			var nested = scope.querySelectorAll("[" + "data-code-block-banner" + "]");
			for (var i = 0; i < nested.length; i += 1) {
				var candidate = nested[i].parentElement?.parentElement ?? null;
				if (candidate !== null) blocks.push(candidate);
			}
			for (var j = 0; j < blocks.length; j += 1) if (blocks[j] !== null) injectButton(blocks[j]);
			refreshButtons();
		}

		function scheduleScan(root) {
			if (scanPending) return;
			scanPending = true;
			scanTimer = window.setTimeout(function () {
				scanPending = false;
				scanTimer = null;
				scan(root ?? null);
			}, SCAN_MS);
		}

		function announceDock(count) {
			// The tab title channel is the only always-present surface outside the
			// transcript; the count keeps a backgrounded run discoverable.
			try {
				var base = document.title.replace(/^\(\d+\)\s*/, "");
				document.title = count > 0 ? "(" + count + ") " + base : base;
			} catch (error) {
				/* title is cosmetic */
			}
		}

		/* ------------------------------------------------------------------ *
		 * Floating run overlay
		 * ------------------------------------------------------------------ */

		function panelTitle(entry) {
			var command = commands.get(entry.runId);
			if (typeof command === "string" && command !== "") {
				var first = command.split("\n")[0];
				return first.length > 120 ? first.slice(0, 120) + "…" : first;
			}
			return entry.key;
		}

		function renderPanel(entry) {
			var run = runs.get(entry.runId);
			if (entry.root === null) {
				var root = document.createElement("div");
				root.className = PREFIX + "-panel";
				root.setAttribute(ATTR_PANEL, "1");
				root.setAttribute(ATTR_RUN, entry.runId);
				document.body.appendChild(root);
				entry.root = root;
				positionPanel(entry);
			}
			var root = entry.root;
			var expanded = entry.open ? "1" : "0";
			if (root.getAttribute("data-expanded") !== expanded) root.setAttribute("data-expanded", expanded);
			root.textContent = "";

			var head = document.createElement("div");
			head.className = PREFIX + "-head";
			var dot = document.createElement("span");
			dot.className = PREFIX + "-status";
			var statusName = run === undefined ? "running" : (run.status === "completed" ? (run.exitCode === 0 || run.exitCode === null ? "done" : "failed") : run.status === "killed" ? "failed" : run.status);
			dot.setAttribute(statusName, "");
			var title = document.createElement("span");
			title.className = PREFIX + "-title";
			title.textContent = panelTitle(entry) || "command";
			title.title = title.textContent;
			head.appendChild(dot);
			head.appendChild(title);

			var toggle = document.createElement("button");
			toggle.type = "button";
			toggle.className = PREFIX + "-icon";
			toggle.textContent = entry.open ? "collapse" : "expand";
			toggle.addEventListener("click", function () {
				entry.open = !entry.open;
				persist();
				renderAll();
			});
			head.appendChild(toggle);

			if (run !== undefined && run.status === "running") {
				var stop = document.createElement("button");
				stop.type = "button";
				stop.className = PREFIX + "-icon";
				stop.textContent = "stop";
				stop.addEventListener("click", function () {
					callHost("kill", { runId: entry.runId }).then(
						function () { startPoll(entry.runId); },
						function () {},
					);
				});
				head.appendChild(stop);
			}

			var close = document.createElement("button");
			close.type = "button";
			close.className = PREFIX + "-icon";
			close.textContent = "close";
			close.addEventListener("click", function () {
				root.remove();
				panels = panels.filter(function (item) { return item.key !== entry.key; });
				persist();
				renderAll();
			});
			head.appendChild(close);

			root.appendChild(head);
			if (!entry.open) return;

			var body = document.createElement("pre");
			body.className = PREFIX + "-body";
			var stdout = run === undefined ? "" : run.stdout;
			if (stdout === "") {
				var empty = document.createElement("div");
				empty.className = PREFIX + "-empty";
				empty.textContent = run === undefined ? "waiting for output…" : (run.status === "running" ? "running…" : "no stdout");
				body.appendChild(empty);
			} else {
				body.appendChild(document.createTextNode(stdout));
			}
			if (run !== undefined && run.stderr !== "") {
				var err = document.createElement("span");
				err.className = PREFIX + "-stderr";
				err.textContent = run.stderr;
				body.appendChild(err);
			}
			root.appendChild(body);

			if (run !== undefined && (run.error !== null || run.truncated || run.status !== "running")) {
				var note = document.createElement("div");
				note.className = PREFIX + "-note";
				var bits = [];
				if (run.status === "running") bits.push("running…");
				else if (run.status === "killed") bits.push("stopped");
				else bits.push("exit " + String(run.exitCode === null ? "?" : run.exitCode));
				if (run.cwd !== null) bits.push(run.cwd);
				if (run.sandboxMode !== null) bits.push("sandbox: " + run.sandboxMode);
				if (run.truncated) bits.push("output truncated");
				if (run.error !== null) bits.push(run.error);
				note.textContent = bits.join(" · ");
				root.appendChild(note);
			}
		}

		function positionPanel(entry) {
			if (entry.root === null) return;
			var anchor = null;
			var nodes = document.querySelectorAll("[" + ATTR_BUTTON + "]");
			for (var i = 0; i < nodes.length; i += 1) {
				var block = findBlock(nodes[i]);
				if (block === null) continue;
				var language = languageOf(block);
				if (blockKey(commandOf(block), language) === entry.key) { anchor = block; break; }
			}
			var root = entry.root;
			if (anchor === null) {
				root.style.left = "auto";
				root.style.right = "16px";
				root.style.bottom = "16px";
				root.style.top = "auto";
				root.style.width = "420px";
				return;
			}
			var rect = anchor.getBoundingClientRect();
			var width = Math.max(320, Math.min(rect.width, window.innerWidth - 32));
			var left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
			var below = rect.bottom + 6;
			var room = window.innerHeight - below - 16;
			root.style.width = width + "px";
			root.style.left = left + "px";
			root.style.right = "auto";
			if (room < 120) {
				// Not enough room under the block: sit above it instead.
				root.style.bottom = Math.max(16, window.innerHeight - rect.top + 6) + "px";
				root.style.top = "auto";
			} else {
				root.style.top = below + "px";
				root.style.bottom = "auto";
			}
		}

		function renderAll() {
			for (var i = 0; i < panels.length; i += 1) renderPanel(panels[i]);
			positionAll();
			refreshButtons();
			var live = 0;
			for (const run of runs.values()) if (run.status === "running") live += 1;
			announceDock(live);
		}

		function positionAll() {
			for (var i = 0; i < panels.length; i += 1) positionPanel(panels[i]);
		}

		/** The Session the page is currently showing; supplied by the dock Slot. */
		var currentSessionId = null;

		/* ------------------------------------------------------------------ *
		 * Slot UI: a run strip above the composer
		 * ------------------------------------------------------------------ */

		function RunDock(props) {
			var sessionId = typeof props.sessionId === "string" ? props.sessionId : null;
			var [tick, setTick] = react.useState(0);
			react.useEffect(
				function () {
					if (sessionId !== currentSessionId) currentSessionId = sessionId;
					return subscribe(function () { setTick(function (value) { return value + 1; }); });
				},
				[sessionId],
			);
			if (panels.length === 0) return null;
			var items = panels.map(function (entry) {
				var run = runs.get(entry.runId);
				var status = run === undefined ? "running" : run.status;
				return react.createElement(
					"button",
					{
						key: entry.key,
						type: "button",
						className: PREFIX + "-dockBtn",
						onClick: function () {
							entry.open = true;
							persist();
							renderAll();
							requestAnimationFrame(positionAll);
						},
					},
					(status === "running" ? "■ " : status === "completed" ? "✓ " : "✕ ") + (run?.command ?? "command").split("\n")[0].slice(0, 60),
				);
			});
			return react.createElement("div", { className: PREFIX + "-dockRow", key: "row-" + String(tick) }, items);
		}

		var listeners = new Set();
		function subscribe(listener) {
			listeners.add(listener);
			return function () { listeners.delete(listener); };
		}

		/* ------------------------------------------------------------------ *
		 * Lifecycle
		 * ------------------------------------------------------------------ */

		function start() {
			if (started) return;
			started = true;
			restore();
			callHost("info", {}).then(
				function (result) {
					if (result !== null && typeof result === "object" && typeof result.workspaceRoot === "string") {
						sessionTarget.cwd = sessionTarget.cwd ?? result.workspaceRoot;
						refreshTargets();
					}
				},
				function () {},
			);
			scheduleScan(null);
			observer = new MutationObserver(function (records) {
				for (var i = 0; i < records.length; i += 1) {
					var nodes = records[i].addedNodes;
					for (var j = 0; j < nodes.length; j += 1) {
						if (nodes[j].nodeType === 1) { scheduleScan(null); return; }
					}
				}
			});
			observer.observe(document.body, { childList: true, subtree: true });
			window.addEventListener("scroll", positionAll, true);
			window.addEventListener("resize", positionAll);
			renderAll();
		}

		function stop() {
			if (!started) return;
			started = false;
			if (observer !== null) observer.disconnect();
			observer = null;
			if (scanTimer !== null) window.clearTimeout(scanTimer);
			scanTimer = null;
			window.removeEventListener("scroll", positionAll, true);
			window.removeEventListener("resize", positionAll);
			for (const run of runs.values()) if (run.timer !== undefined) window.clearInterval(run.timer);
			var buttons = document.querySelectorAll("[" + ATTR_BUTTON + "]");
			for (var i = 0; i < buttons.length; i += 1) buttons[i].remove();
			var targets = document.querySelectorAll("." + PREFIX + "-target");
			for (var j = 0; j < targets.length; j += 1) targets[j].remove();
			for (var k = 0; k < panels.length; k += 1) panels[k].root?.remove();
			panels = [];
			runs.clear();
			commands.clear();
			attached.clear();
			listeners.clear();
		}

		function apply(ctx) {
			styles.insert(CSS);
			start();
			// The Connection RPC service is the only Client->Host path a real
			// (non-dynamic) package may use; bind it once for the store.
			var connection = ctx.get("connection");
			if (connection !== undefined && connection.rpc !== undefined) rpc = connection.rpc;
			var slots = ctx.get("slots");
			if (slots !== undefined) {
				slots.inject("conversation.input.dock", function () {
					return slots.register({ name: "conversation.input.dock", id: "dsh-run-button" }, RunDock);
				});
			}
			ctx.effect(function () { return stop; }, "dsh-run-button: dom teardown");
		}

		var inject = ["slots", "connection"];
		exports.apply = apply;
		exports.inject = inject;
		exports.name = "dsh-run-button";
		return module.exports;
	}
});
