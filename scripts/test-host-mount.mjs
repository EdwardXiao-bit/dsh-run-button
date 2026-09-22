/**
 * Host-half mount test.
 *
 * Reproduces the real failure: `webServer.register` throws on a duplicate path
 * and its disposer deletes BY PATH. During a composition reload the new fiber
 * registers while the old one still holds the path — the register throws, the
 * error is swallowed, and then the old disposer deletes the path, leaving the
 * route owned by nobody. The only symptom is a 405 from the SPA fallback on
 * every run.
 *
 * This test drives that exact ordering with two real `apply()` calls against a
 * faithful fake web server, and asserts the self-healing retry restores the
 * route.
 *
 *   node scripts/test-host-mount.mjs
 */
import { apply } from '../lib/index.js'

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

/** Faithful copy of the shipped webserver's route table semantics. */
function createFakeWebServer() {
  const prefixes = new Map()
  let registerCalls = 0
  let duplicateThrows = 0
  return {
    prefixes,
    stats: () => ({ registerCalls, duplicateThrows }),
    register(route) {
      registerCalls += 1
      if (prefixes.has(route.path)) {
        duplicateThrows += 1
        throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
      }
      prefixes.set(route.path, route)
      return () => {
        // Deletes by PATH, exactly like the real one.
        prefixes.delete(route.path)
      }
    },
  }
}

/** Minimal Cordis-like context; only what the host half touches. */
function createCtx(webServer, options = {}) {
  const disposers = []
  const intervals = new Set()
  const services = { webServer, ...(options.services ?? {}) }
  return {
    disposers,
    intervals,
    get(name) {
      return Object.prototype.hasOwnProperty.call(services, name) ? services[name] : undefined
    },
    effect(callback) {
      const disposer = callback()
      if (typeof disposer === 'function') disposers.push(disposer)
      return () => {}
    },
    on() {
      return () => {}
    },
    interval(fn, ms) {
      const handle = setInterval(fn, ms)
      intervals.add(handle)
      return () => {
        clearInterval(handle)
        intervals.delete(handle)
      }
    },
    timeout(fn, ms) {
      const handle = setTimeout(fn, ms)
      return () => clearTimeout(handle)
    },
  }
}

function unmount(ctx) {
  for (const dispose of ctx.disposers.reverse()) {
    try {
      dispose()
    } catch (error) {
      /* the real cascade swallows too */
    }
  }
  for (const handle of ctx.intervals) clearInterval(handle)
}

const CHANNEL = '/dsh-run-button'
const originalLog = console.log
console.log = () => {} // the host half logs its mount outcome; keep the test output clean

const webServer = createFakeWebServer()

/* ------------------------------------------------------------------ *
 * 1. An ordinary mount registers the route
 * ------------------------------------------------------------------ */
const ctxA = createCtx(webServer)
apply(ctxA)
if (!webServer.prefixes.has(CHANNEL)) fail('a plain apply() did not register the route')

/* ------------------------------------------------------------------ *
 * 2. The racy reload: B applies while A still holds the path, then A disposes
 * ------------------------------------------------------------------ */
const ctxB = createCtx(webServer)
apply(ctxB) // must throw internally on the duplicate, then schedule a retry
if (!webServer.prefixes.has(CHANNEL)) fail('the first mount lost its route unexpectedly')
if (webServer.stats().duplicateThrows !== 1) {
  fail(`expected the duplicate registration to throw once, saw ${webServer.stats().duplicateThrows}`)
}

unmount(ctxA) // A's disposer deletes the path — nobody owns it now
if (webServer.prefixes.has(CHANNEL)) fail('A teardown did not free the path (test premise broken)')

/* ------------------------------------------------------------------ *
 * 3. B's retry must restore the route without any further help
 * ------------------------------------------------------------------ */
const deadline = Date.now() + 4000
let restored = false
while (Date.now() < deadline) {
  if (webServer.prefixes.has(CHANNEL)) {
    restored = true
    break
  }
  await new Promise((resolve) => setTimeout(resolve, 100))
}

console.log = originalLog
if (!restored) {
  fail('the route was never restored: a reload can still leave the run button dead')
}

const stats = webServer.stats()
console.log('OK  host half survives the reload race')
console.log(`    register calls: ${stats.registerCalls}, duplicate throws: ${stats.duplicateThrows}`)
console.log('    route restored by the retry after the previous owner disposed')

unmount(ctxB)
if (webServer.prefixes.has(CHANNEL)) fail('teardown left the route registered')
console.log('OK  teardown releases the route')
