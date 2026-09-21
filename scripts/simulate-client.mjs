/**
 * Headless client-half smoke test.
 *
 * `scripts/check-client.mjs` only proves the bundle parses. That is not enough:
 * the client half runs against a DOM it does not own, and a single undeclared
 * global (`styles`, in the incident this file exists for) throws inside apply()
 * and takes the whole page down with "Failed to load plugins".
 *
 * This harness mounts the bundle the way the shell does — `window.__ModuleLoader__`
 * then a Cordis-like ctx — and drives apply() through a real DOM, so a broken
 * global, a throwing DOM path, or a bad context call fails here instead of in
 * the user's browser.
 *
 *   node scripts/simulate-client.mjs
 *
 * Exits non-zero on any failure.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = new URL('..', import.meta.url)

/** Resolve happy-dom from the DSH profile, then from the local tree. */
function loadHappyDom() {
  const candidates = [
    'C:/Users/Ed/.dsh/profiles/web/node_modules/happy-dom/lib/index.js',
    'happy-dom',
  ]
  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch (error) {
      /* try the next candidate */
    }
  }
  return undefined
}

const happyDom = loadHappyDom()
if (happyDom === undefined) {
  console.error('SKIP: happy-dom is not resolvable; cannot simulate the browser')
  process.exit(2)
}

const { Window } = happyDom
const window = new Window({ url: 'http://127.0.0.1:3080/' })
const document = window.document

/* ------------------------------------------------------------------ *
 * Shell globals the client half may legitimately rely on
 * ------------------------------------------------------------------ */

// React is a platform seed word; a stub is enough to prove the bundle's view
// components render without crashing.
const React = {
  createElement(type, props, ...children) {
    const flat = []
    for (const child of children) {
      if (Array.isArray(child)) flat.push(...child)
      else if (child !== null && child !== undefined && child !== false) flat.push(child)
    }
    return { type, props: props ?? {}, children: flat }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useEffect() {},
  useMemo(factory) {
    return factory()
  },
  useRef(value) {
    return { current: value }
  },
}

/** Depth-first search over the stub element tree produced by React.createElement. */
function findElement(node, predicate) {
  if (node === null || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, predicate)
      if (hit !== null) return hit
    }
    return null
  }
  if (predicate(node)) return node
  if (Array.isArray(node.children)) return findElement(node.children, predicate)
  return null
}

/** Flatten a stub element tree to the text it would render. */
function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return (node.children ?? []).map(textOf).join('')
}

const registered = []
window.__ModuleLoader__ = {
  load(entry) {
    registered.push(entry)
  },
}

// The shell seeds these; the bundle must not need anything else.
window.React = React

const moduleTable = {
  react: React,
  'react/jsx-runtime': { jsx: React.createElement, jsxs: React.createElement },
}

const source = readFileSync(new URL('lib/client.js', root), 'utf8')
const evaluate = new Function('window', 'document', 'console', `${source}\n`)
const warnings = []
const fakeConsole = {
  log: (...args) => warnings.push(args.join(' ')),
  error: (...args) => warnings.push('ERROR ' + args.join(' ')),
  warn: (...args) => warnings.push('WARN ' + args.join(' ')),
}
evaluate(window, document, fakeConsole)

if (registered.length !== 1) {
  console.error(`FAIL: bundle registered ${registered.length} modules, expected 1`)
  process.exit(1)
}

/* ------------------------------------------------------------------ *
 * A minimal Cordis-like context, matching what the shell mounts
 * ------------------------------------------------------------------ */

const disposers = []
const registeredSlots = []
const registeredTabs = []
const rpcCalls = []
const openTabCalls = []
const closeTabCalls = []
/** runId -> the command that started it; the host echoes this back in view(). */
const runCommands = new Map()
let runCounter = 0
let lastRunId = null

const slots = {
  inject(_name, callback) {
    disposers.push(callback())
    return () => {}
  },
  register(options, component) {
    registeredSlots.push({ options, component })
    return () => {}
  },
}

const connection = {
  rpc: {
    call(channel, endpoint, args) {
      rpcCalls.push({ channel, endpoint, args })
      if (endpoint === 'info') {
        return Promise.resolve({ ok: true, value: { platform: 'win32', workspaceRoot: 'C:\\Users\\Ed' } })
      }
      if (endpoint === 'start') {
        runCounter += 1
        lastRunId = `run-${runCounter}`
        runCommands.set(lastRunId, args.command)
        return Promise.resolve({
          ok: true,
          value: {
            runId: lastRunId, command: args.command, status: 'running', exitCode: null,
            stdout: 'hello\n', stderr: '', cwd: 'C:\\Users\\Ed', sandboxMode: 'workspace-write',
            startedAt: Date.now(), finishedAt: null,
          },
        })
      }
      if (endpoint === 'output') {
        // The host echoes each run's OWN command, like lib/index.js view() does.
        return Promise.resolve({
          ok: true,
          value: {
            runId: args.runId, command: runCommands.get(args.runId) ?? '', status: 'completed', exitCode: 0,
            stdout: 'hello\n', stderr: '', cwd: 'C:\\Users\\Ed', sandboxMode: 'workspace-write',
            startedAt: Date.now(), finishedAt: Date.now(),
          },
        })
      }
      return Promise.resolve({ ok: true, value: { killed: true } })
    },
  },
  requestRejection() {
    return undefined
  },
}

const betterSidebar = {
  version: '0.19.1',
  features: ['badge', 'tabLifecycle', 'updateTab', 'openFile', 'targetedOpen', 'stateSubscription', 'tabMeta', 'pluginSettings'],
  registerTab(descriptor) {
    registeredTabs.push(descriptor)
    return () => {}
  },
  openTab(seed) { openTabCalls.push(seed) },
  closeTab(tabId) { closeTabCalls.push(tabId) },
  subscribe() { return () => {} },
  subscribeState() { return () => {} },
}

const services = {
  slots,
  connection,
  betterSidebar,
}

/**
 * Build a Cordis-like ctx.
 *
 * The real `ctx.interval` is a timer-service MIXIN: it exists only when the
 * plugin declares `timer` in its inject list, and cordis throws
 * 'cannot get property "interval" without inject' otherwise. An always-present
 * stub hid exactly that bug once, so `withTimer` is opt-in and the guard below
 * reproduces the real failure mode.
 */
function makeCtx({ withTimer = false, disposerSink = null, serviceTable = services } = {}) {
  const sink = disposerSink ?? []
  const ctx = {
    get(name) {
      return Object.prototype.hasOwnProperty.call(serviceTable, name) ? serviceTable[name] : undefined
    },
    effect(callback) {
      const disposer = callback()
      if (typeof disposer === 'function') sink.push(disposer)
      return () => {}
    },
    on() { return () => {} },
    // Absent unless the timer service is bound, exactly like the real mixin.
    interval: withTimer
      ? (fn, ms) => {
        const handle = setInterval(fn, ms)
        const dispose = () => clearInterval(handle)
        sink.push(dispose)
        return dispose
      }
      : undefined,
  }
  for (const key of Object.keys(ctx)) {
    if (ctx[key] === undefined) delete ctx[key]
  }
  return ctx
}

const ctx = makeCtx({
  withTimer: true,
  disposerSink: disposers,
})

/* ------------------------------------------------------------------ *
 * Mount, exercise, unmount
 * ------------------------------------------------------------------ */

/**
 * Every HARD service dependency, mapped from the property the bundle actually
 * touches to the name it must declare in `inject`.
 *
 * The mapping matters: the timer mixin is reached as `ctx.interval()` /
 * `ctx.timeout()`, NOT `ctx.timer`, so a naive check for `ctx.timer` misses the
 * real fault. That exact gap let an undeclared `timer` ship and abort apply(),
 * killing the Run button while every other gate stayed green.
 */
const HARD_DEPS = [
  { service: 'slots', pattern: /ctx\.slots\b/ },
  { service: 'connection', pattern: /ctx\.connection\b/ },
  { service: 'timer', pattern: /ctx\.(interval|timeout|throttle|debounce)\s*\(/ },
]
/** Globals that exist only in the dynamic-plugin sandbox, never in a bundle. */
const AMBIENT_ONLY = [/[^.\w$]styles\s*\./, /[^.\w$]harness\s*\./]

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

/**
 * Render the composer strip and hand back its mode toggle.
 *
 * Only the slot-registered components are consulted (the tab body is rendered by
 * dsh-better-sidebar's own wrapper, so it cannot be exercised in isolation here).
 */
function renderStrip() {
  for (const entryOfSlot of registeredSlots) {
    if (typeof entryOfSlot.component !== 'function') continue
    let tree
    try {
      tree = entryOfSlot.component({ sessionId: 'session-test' })
    } catch (error) {
      continue
    }
    const toggle = findElement(tree, (node) => node.props && typeof node.props.title === 'string' && node.props.title.indexOf('dsh-better-sidebar') >= 0)
    if (toggle !== null) return { tree, toggle }
  }
  return { tree: null, toggle: null }
}

const entry = registered[0]
const exported = entry.factory((specifier) => {
  if (!Object.prototype.hasOwnProperty.call(moduleTable, specifier)) {
    fail(`bundle required "${specifier}", which is not in the platform baseline`)
  }
  return moduleTable[specifier]
})

if (typeof exported.apply !== 'function') fail('bundle exports no apply()')
if (!Array.isArray(exported.inject) || exported.inject.indexOf('slots') < 0) fail('bundle does not inject slots')

// Every HARD service dependency must be declared in `inject`, or cordis aborts
// apply() with 'cannot get property "x" without inject' and the plugin
// contributes nothing at all.
//
// `ctx.get("name")` is the optional read and needs no declaration — that is how
// the optional dsh-better-sidebar peer is fetched, so it is deliberately not in
// HARD_DEPS.
{
  const declared = Array.isArray(exported.inject) ? exported.inject : []
  const source = readFileSync(new URL('lib/client.js', root), 'utf8')
  const problems = []

  for (const dep of HARD_DEPS) {
    if (dep.pattern.test(source) && !declared.includes(dep.service)) {
      problems.push(`${dep.service}: reached via ctx.* but missing from inject`)
    }
  }
  for (const pattern of AMBIENT_ONLY) {
    if (pattern.test(source)) {
      problems.push(`${pattern}: ambient-sandbox-only global, has no client provider`)
    }
  }

  if (problems.length > 0) {
    fail(`undeclared hard service dependency, which aborts apply() at runtime:\n      ${problems.join('\n      ')}\n      exports.inject = ${JSON.stringify(declared)}`)
  }
}

try {
  exported.apply(ctx)
} catch (error) {
  fail(`apply() threw: ${error && error.stack ? error.stack : String(error)}`)
}

// The shell renders a shell code block, then we drive the injected chip.
document.body.innerHTML = [
  '<div class="_block_rsn9u_4 md-code-block">',
  '<div class="_bannerWrap_rsn9u_24"><div class="_banner_rsn9u_24" data-code-block-banner>',
  '<div class="_infostring_rsn9u_45">bash</div>',
  '<div class="_action_rsn9u_56"><button class="_copyButton_rsn9u_62">Copy</button></div>',
  '</div></div>',
  '<div class="_content_rsn9u_74" data-code-block-content><pre>echo hi</pre></div>',
  '</div>',
].join('')

// Let the debounced scan and the host round-trips settle.
await new Promise((resolve) => setTimeout(resolve, 400))

const chip = document.querySelector('[data-dsh-run-button]')
if (process.env.DSH_RUN_BUTTON_DEBUG === '1') {
  console.log('DEBUG banners:', document.querySelectorAll('[data-code-block-banner]').length)
  console.log('DEBUG chips:', document.querySelectorAll('[data-dsh-run-button]').length)
  console.log('DEBUG console:', JSON.stringify(warnings))
  console.log('DEBUG rpc:', JSON.stringify(rpcCalls))
}
if (chip === null) fail('no Run chip was injected into the code-block banner')
if (chip.textContent.indexOf('Run') < 0 && chip.textContent.indexOf('▶') < 0) {
  fail(`Run chip has an unexpected label: ${JSON.stringify(chip.textContent)}`)
}

/* ------------------------------------------------------------------ *
 * Inline mode (the default): one anchored panel per run, no optional plugin
 * ------------------------------------------------------------------ */

// Click it: this is the path that issues run/start.
chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await new Promise((resolve) => setTimeout(resolve, 400))

const startCall = rpcCalls.find((call) => call.endpoint === 'start')
if (startCall === undefined) fail('clicking the Run chip never called run/start')
if (document.querySelector('[data-dsh-run-inline]') === null) {
  fail('dock mode rendered no output card')
}
// The dock lives in exactly ONE container with exactly ONE card per run. The
// old anchored placement could put a card under the block and a second one in
// the corner when the anchor scrolled out of the virtualized transcript.
const dockRoots = document.querySelectorAll('.dsh-runbtn-dock')
if (dockRoots.length !== 1) fail(`expected exactly 1 dock container, found ${dockRoots.length}`)
const cardsForOneRun = dockRoots[0].querySelectorAll('[data-dsh-run-inline]')
if (cardsForOneRun.length !== 1) fail(`expected 1 card for the first run, found ${cardsForOneRun.length}`)
if (openTabCalls.length !== 0) fail('dock mode opened a workbench tab')
// A card must not float by itself outside the dock.
const orphanCards = [...document.querySelectorAll('[data-dsh-run-inline]')].filter(
  (card) => card.parentElement === null || !card.parentElement.classList.contains('dsh-runbtn-dock'),
)
if (orphanCards.length > 0) fail(`${orphanCards.length} output card(s) render outside the dock container`)

/* ------------------------------------------------------------------ *
 * Panel mode: one tab per run, each carrying its own run id
 * ------------------------------------------------------------------ */

const strip = registeredSlots.find((entryOfSlot) => typeof entryOfSlot.component === 'function')
if (strip === undefined) fail('the composer run strip was never registered')

const stripView = renderStrip()
if (stripView.toggle === null) fail('the Panel mode toggle was not rendered')
stripView.toggle.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 200))

if (openTabCalls.length === 0) fail('switching to panel mode opened no tab')
if (document.querySelector('[data-dsh-run-inline]') !== null) {
  fail('switching to panel mode left dock cards behind')
}
if (document.querySelector('.dsh-runbtn-dock') !== null) {
  fail('switching to panel mode left the dock container behind')
}

// The tab type must be registered, and each open must carry its own run id.
const tabDescriptor = registeredTabs.find((tab) => typeof tab.id === 'string' && tab.id.indexOf('dsh-run-button') === 0)
if (tabDescriptor === undefined) fail('no run-output tab type was registered')
// `component` is a required FIELD of the descriptor, never a second argument to
// registerTab(descriptor) — passing it separately leaves the tab body undefined.
if (typeof tabDescriptor.component !== 'function') {
  fail('the tab descriptor has no component field, so the tab body would render nothing')
}
if (typeof tabDescriptor.title !== 'function' && typeof tabDescriptor.title !== 'string') {
  fail('the tab descriptor has no title')
}
if (typeof tabDescriptor.dedupeKey === 'function' && tabDescriptor.dedupeKey({ id: 'x' }) !== undefined) {
  fail('the tab descriptor dedupes, so runs would share one tab instead of getting their own')
}

// Drive a second, different command block and prove it gets a distinct tab.
document.body.insertAdjacentHTML('beforeend', [
  '<div class="_block_rsn9u_4 md-code-block">',
  '<div class="_bannerWrap_rsn9u_24"><div class="_banner_rsn9u_24" data-code-block-banner>',
  '<div class="_infostring_rsn9u_45">bash</div>',
  '<div class="_action_rsn9u_56"><button class="_copyButton_rsn9u_62">Copy</button></div>',
  '</div></div>',
  '<div class="_content_rsn9u_74" data-code-block-content><pre>echo second</pre></div>',
  '</div>',
].join(''))
await new Promise((resolve) => setTimeout(resolve, 400))

const chips = [...document.querySelectorAll('[data-dsh-run-button]')]
if (chips.length !== 2) fail(`expected 2 Run chips, found ${chips.length}`)
// The newest chip belongs to the second block.
chips[chips.length - 1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await new Promise((resolve) => setTimeout(resolve, 1200))

const startCalls = rpcCalls.filter((call) => call.endpoint === 'start')
if (startCalls.length !== 2) fail(`expected 2 run/start calls, saw ${startCalls.length}`)

const distinctTabIds = new Set(openTabCalls.map((seed) => seed.id))
if (distinctTabIds.size !== openTabCalls.length) {
  fail(`tab ids are not per run: ${JSON.stringify(openTabCalls.map((seed) => seed.id))}`)
}
const runIds = openTabCalls.map((seed) => (seed.meta && seed.meta.runId) || null)
if (runIds.some((runId) => typeof runId !== 'string')) fail('a tab was opened without a runId in its meta')
if (new Set(runIds).size !== runIds.length) fail(`two tabs carry the same runId: ${JSON.stringify(runIds)}`)

// Render each run's tab body THROUGH THE DESCRIPTOR the way the sidebar does.
// React error #130 ("element type is invalid") is exactly what an undefined
// component produces, so this both proves the descriptor is wired and checks
// that each tab serves its own run and nobody else's.
const commands = startCalls.map((call) => call.args.command)
if (openTabCalls.length !== commands.length) {
  fail(`expected one tab per run: ${commands.length} runs but ${openTabCalls.length} tabs`)
}
for (let index = 0; index < openTabCalls.length; index += 1) {
  const seed = openTabCalls[index]
  const runId = seed.meta && seed.meta.runId ? seed.meta.runId : null
  if (runId === null) fail('a tab was opened without a runId in its meta')
  let tree
  try {
    tree = tabDescriptor.component({
      ctx,
      store: {},
      scope: { sessionId: 'session-test' },
      tab: { id: seed.id, type: seed.type, title: seed.title, meta: seed.meta },
      visible: true,
    })
  } catch (error) {
    fail(`the tab body threw for run ${runId} (a React #130-class fault if it were undefined): ${String(error)}`)
  }
  const text = textOf(tree)
  const own = commands[index]
  if (text.indexOf(own) < 0) {
    fail(`the tab for ${runId} does not render its own command ${JSON.stringify(own)}; rendered ${JSON.stringify(text.slice(0, 200))}`)
  }
  for (const other of commands) {
    if (other === own) continue
    if (text.indexOf(other) >= 0) fail(`the tab for ${runId} leaked another run's command ${JSON.stringify(other)}`)
  }
}

/* ------------------------------------------------------------------ *
 * Chip dismissal: each run chip drops its own run
 * ------------------------------------------------------------------ */

// Switch back to dock mode so a run has a visible card to clean up.
const dockToggle = findElement(renderStrip().tree, (node) => typeof node.props?.title === 'string' && node.props.title.indexOf('bottom-right corner') >= 0)
if (dockToggle === null) fail('the Dock mode toggle was not rendered')
dockToggle.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 200))

const dismissTree = renderStrip().tree
const chipClose = findElement(dismissTree, (node) => typeof node.props?.className === 'string' && node.props.className.indexOf('-chipClose') >= 0)
if (chipClose === null) fail('run chips have no dismiss button')
if (typeof chipClose.props.onClick !== 'function') fail('the chip dismiss button has no handler')

const cardsBefore = document.querySelectorAll('[data-dsh-run-inline]').length
if (cardsBefore === 0) fail('dock mode rendered no cards to dismiss')
chipClose.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 250))
const cardsAfter = document.querySelectorAll('[data-dsh-run-inline]').length
if (cardsAfter >= cardsBefore) {
  fail(`dismissing a chip did not drop its run (${cardsBefore} cards -> ${cardsAfter})`)
}

const errors = warnings.filter((line) => line.startsWith('ERROR'))
if (errors.length > 0) fail(`the client half logged errors:\n  ${errors.join('\n  ')}`)

// Unmount must not throw and must remove what it injected.
try {
  for (const dispose of disposers.reverse()) dispose()
} catch (error) {
  fail(`teardown threw: ${String(error)}`)
}

if (document.querySelector('[data-dsh-run-button]') !== null) fail('teardown left a Run chip behind')

/* ------------------------------------------------------------------ *
 * Regression: dsh-better-sidebar arriving AFTER this half mounts
 *
 * This actually shipped. `dsh-better-sidebar` was dropped from
 * dsh.client.inject, `inject` is not load ordering (only `external` orders
 * rows), this bundle materialized first, `ctx.get("betterSidebar")` was
 * undefined at bind time, Panel was greyed out for the whole session.
 * ------------------------------------------------------------------ */

{
  const lateServices = { slots, connection } // no betterSidebar yet
  // This mount's own disposers; the outer list belongs to the first mount and
  // was already reversed during its teardown.
  const lateDisposers = []
  const lateIntervals = new Set()

  const lateExport = registered[0].factory((specifier) => moduleTable[specifier])
  const declaresTimer = Array.isArray(lateExport.inject) && lateExport.inject.indexOf('timer') >= 0

  const lateRegistrations = []
  const lateSlots = {
    inject: (_n, cb) => {
      const disposer = cb()
      if (typeof disposer === 'function') lateDisposers.push(disposer)
      return () => {}
    },
    register: (options, component) => {
      lateRegistrations.push({ options, component })
      return () => {}
    },
  }
  lateServices.slots = lateSlots

  const lateCtx = {
    get: (name) => (Object.prototype.hasOwnProperty.call(lateServices, name) ? lateServices[name] : undefined),
    effect(callback) {
      const disposer = callback()
      if (typeof disposer === 'function') lateDisposers.push(disposer)
      return () => {}
    },
    on: () => () => {},
    // Present ONLY if the bundle declares `timer`, mirroring the real mixin.
    // Without this, an undeclared ctx.interval() silently passes here and fails
    // in the browser with 'cannot get property "interval" without inject'.
    interval: declaresTimer
      ? (fn, ms) => {
        const handle = setInterval(fn, ms)
        lateIntervals.add(handle)
        const dispose = () => {
          clearInterval(handle)
          lateIntervals.delete(handle)
        }
        lateDisposers.push(dispose)
        return dispose
      }
      : undefined,
  }
  if (lateCtx.interval === undefined) delete lateCtx.interval

  const usesCtxInterval = /ctx\.interval\s*\(/.test(readFileSync(new URL('lib/client.js', root), 'utf8'))
  if (usesCtxInterval && !declaresTimer) {
    fail('the client half calls ctx.interval() but does not declare "timer" in inject — this is exactly the browser error it caused')
  }

  try {
    lateExport.apply(lateCtx)
  } catch (error) {
    fail(`apply() threw with no sidebar present: ${String(error)}`)
  }
  if (lateRegistrations.length === 0) fail('the run strip was not registered without a sidebar')

  // The sidebar mounts a moment later, after apply() has already run.
  const tabsBeforeLateBind = registeredTabs.length
  lateServices.betterSidebar = betterSidebar
  await new Promise((resolve) => setTimeout(resolve, 1400))

  const addedTabs = registeredTabs.slice(tabsBeforeLateBind)
  const boundLate = addedTabs.some((tab) => typeof tab.id === 'string' && tab.id.indexOf('dsh-run-button') === 0)
  if (!boundLate) {
    fail('a late-arriving dsh-better-sidebar was never bound, so Panel would stay disabled for the session')
  }
  if (addedTabs.length !== 1) {
    fail(`the late bind registered ${addedTabs.length} tab types, expected exactly 1`)
  }

  // Unwind this mount so no retry interval keeps the process alive.
  for (const dispose of lateDisposers.reverse()) {
    try {
      dispose()
    } catch (error) {
      fail(`late-mount teardown threw: ${String(error)}`)
    }
  }
  for (const handle of lateIntervals) clearInterval(handle)
}

console.log('OK  client half mounts, injects, starts runs, renders per-run tabs, and unmounts')
console.log(`    rpc endpoints exercised: ${[...new Set(rpcCalls.map((call) => call.endpoint))].join(', ')}`)
console.log(`    tabs registered: ${registeredTabs.length}, slots registered: ${registeredSlots.length}`)
console.log(`    tabs opened (one per run): ${openTabCalls.length} -> ${JSON.stringify(openTabCalls.map((seed) => seed.id))}`)
if (warnings.length > 0) console.log(`    console output: ${warnings.join(' | ')}`)
