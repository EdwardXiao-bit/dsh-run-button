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

const ctx = {
  get(name) {
    return Object.prototype.hasOwnProperty.call(services, name) ? services[name] : undefined
  },
  effect(callback) {
    const disposer = callback()
    if (typeof disposer === 'function') disposers.push(disposer)
    return () => {}
  },
  on() { return () => {} },
}

/* ------------------------------------------------------------------ *
 * Mount, exercise, unmount
 * ------------------------------------------------------------------ */

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
  fail('inline mode rendered no output panel')
}
if (openTabCalls.length !== 0) fail('inline mode opened a workbench tab')

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
  fail('switching to panel mode left inline panels behind')
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

const errors = warnings.filter((line) => line.startsWith('ERROR'))
if (errors.length > 0) fail(`the client half logged errors:\n  ${errors.join('\n  ')}`)

// Unmount must not throw and must remove what it injected.
try {
  for (const dispose of disposers.reverse()) dispose()
} catch (error) {
  fail(`teardown threw: ${String(error)}`)
}

if (document.querySelector('[data-dsh-run-button]') !== null) fail('teardown left a Run chip behind')

console.log('OK  client half mounts, injects, starts runs, renders per-run tabs, and unmounts')
console.log(`    rpc endpoints exercised: ${[...new Set(rpcCalls.map((call) => call.endpoint))].join(', ')}`)
console.log(`    tabs registered: ${registeredTabs.length}, slots registered: ${registeredSlots.length}`)
console.log(`    tabs opened (one per run): ${openTabCalls.length} -> ${JSON.stringify(openTabCalls.map((seed) => seed.id))}`)
if (warnings.length > 0) console.log(`    console output: ${warnings.join(' | ')}`)
