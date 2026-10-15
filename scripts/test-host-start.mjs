/**
 * Host-half `start` test.
 *
 * DSH 0.2 removed `ctx.shell.start(spec)` in favour of `execute(spec)`, which
 * resolves (asynchronously) with the same ShellProcess handle. This test drives
 * the real `start` endpoint through the registered RPC route against both shell
 * shapes, and checks that failures come back with the `details` object the
 * Connection client requires of every server-response error.
 *
 *   node scripts/test-host-start.mjs
 */
import { apply } from '../lib/index.js'

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

/** A finished ShellProcess-shaped handle. */
function makeHandle() {
  let read = false
  return {
    status: 'completed',
    exitCode: 0,
    signal: null,
    done: Promise.resolve(),
    readOutput() {
      if (read) return { delta: '', lossy: false }
      read = true
      return { delta: 'hello\n', lossy: false }
    },
    kill: () => false,
  }
}

const spec = (request) => ({ ...request, workdir: request.workdir ?? '/tmp' })

function createCtx(shell) {
  const services = { shell, webServer: undefined }
  return {
    routes: new Map(),
    get(name) {
      return Object.prototype.hasOwnProperty.call(services, name) ? services[name] : undefined
    },
    effect() {
      return () => {}
    },
    interval: () => () => {},
    on: () => () => {},
    shell,
  }
}

/** Mount through a fake `connection.rpc.handle`, returning the dispatcher. */
function mount(shell) {
  let dispatch
  const ctx = createCtx(shell)
  const services = {
    shell,
    connection: {
      rpc: {
        handle(_channel, handler) {
          dispatch = handler
          return () => {}
        },
      },
    },
  }
  ctx.get = (name) => (Object.prototype.hasOwnProperty.call(services, name) ? services[name] : undefined)
  const originalLog = console.log
  console.log = () => {}
  apply(ctx)
  console.log = originalLog
  if (dispatch === undefined) fail('the RPC dispatcher was never registered')
  return dispatch
}

/** Every error the client parses must carry `details` as a record. */
function assertWireError(result, label) {
  const error = result?.error
  if (result?.ok !== false || typeof error?.code !== 'string' || typeof error?.message !== 'string') {
    fail(`${label}: expected a failure result, got ${JSON.stringify(result)}`)
  }
  if (error.details === null || typeof error.details !== 'object' || Array.isArray(error.details)) {
    fail(`${label}: error.details must be an object (the client rejects the envelope otherwise)`)
  }
}

/* 1. DSH 0.2 shape: only resolve + execute (async) --------------------------- */
{
  const dispatch = mount({ resolve: spec, execute: async () => makeHandle() })
  const started = await dispatch('start', { command: 'echo hello' })
  if (!started.ok) fail(`execute path: start failed: ${JSON.stringify(started)}`)
  if (started.value.stdout !== 'hello\n' && started.value.stdout !== '') fail('execute path: unexpected stdout')
  const out = await dispatch('output', { runId: started.value.runId })
  if (!out.ok || out.value.stdout !== 'hello\n') fail(`execute path: output was ${JSON.stringify(out)}`)
  console.log('OK  start works against the DSH 0.2 shell (execute)')
}

/* 2. Older shape: resolve + start (sync) ------------------------------------- */
{
  const dispatch = mount({ resolve: spec, start: () => makeHandle() })
  const started = await dispatch('start', { command: 'echo hello' })
  if (!started.ok) fail(`legacy path: start failed: ${JSON.stringify(started)}`)
  console.log('OK  start still works against the older shell (start)')
}

/* 3. Failures keep the wire contract ----------------------------------------- */
{
  const dispatch = mount({ resolve: spec, execute: async () => makeHandle() })
  assertWireError(await dispatch('start', {}), 'empty command')
  assertWireError(await dispatch('nope', {}), 'unknown endpoint')
  assertWireError(await dispatch('output', { runId: 'missing' }), 'unknown run')

  const broken = mount({
    resolve: spec,
    execute: async () => {
      throw new Error('spawn exploded')
    },
  })
  const result = await broken('start', { command: 'echo hi' })
  assertWireError(result, 'execute rejects')
  if (!String(result.error.message).includes('spawn exploded')) fail('the real failure message was lost')
  console.log('OK  failures carry error.details and the real message')
}
