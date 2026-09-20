// Throwaway syntax gate for the client bundle: evaluate the __ModuleLoader__
// wrapper factory without executing any DOM work, so a parse error or a bad
// statement shows up here instead of as a client-render diagnostic in the GUI.
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

let registered = null
const windowStub = {
  __ModuleLoader__: {
    load(entry) {
      registered = entry
    },
  },
}

const evaluate = new Function('window', 'document', `${source}\nreturn window.__ModuleLoader__;`)
const loader = evaluate(windowStub, { body: { appendChild() {} } })

if (registered === null) {
  console.error('FAIL: bundle did not register a module with __ModuleLoader__.load')
  process.exit(1)
}
console.log(`registered id=${registered.id} factory=${typeof registered.factory}`)
if (registered.id !== 'dsh-run-button') {
  console.error(`FAIL: unexpected bundle id ${registered.id}`)
  process.exit(1)
}

// Materialize the factory with a stub require, which executes the module body
// (but not apply()) and proves every top-level statement parses and runs.
const requested = []
const exportsObject = registered.factory((specifier) => {
  requested.push(specifier)
  if (specifier === 'react') return { createElement: () => null, useState: () => [0, () => {}], useEffect: () => {} }
  throw new Error(`unexpected require: ${specifier}`)
})

console.log(`requires=${JSON.stringify(requested)}`)
console.log(`exports=${Object.keys(exportsObject).join(',')}`)
if (typeof exportsObject.apply !== 'function') {
  console.error('FAIL: bundle does not export apply')
  process.exit(1)
}
if (typeof exportsObject.name !== 'string') {
  console.error('FAIL: bundle does not export name')
  process.exit(1)
}
console.log('OK client bundle parses and materializes')

/*
 * Undeclared-global audit.
 *
 * A real package bundle gets NO ambient globals: the *dynamic* Cordis plugin
 * sandbox hands out `styles`/`harness`, but a shipped bundle does not. Referencing
 * one threw "styles is not defined" inside apply() and took the whole page down
 * ("Failed to load plugins"). Every browser global must therefore be reached
 * through `window.`, which this check enforces.
 */
const FORBIDDEN_BARE_GLOBALS = [
  'styles', 'harness',
  'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'fetch',
  'document', 'window', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
]

const offenders = []
for (const name of FORBIDDEN_BARE_GLOBALS) {
  if (name === 'window') continue
  // A local declaration of the same name is fine (the bundle has a helper called
  // `insertStyles`); only an UNdeclared bare reference is a fault.
  const declared = new RegExp(`(?:var|let|const|function)\\s+${name}\\b`).test(source)
  if (declared) continue
  // A bare use is one not preceded by `.` or an identifier character, i.e. not
  // already qualified as `window.<name>` or `<something>.<name>`.
  const bare = new RegExp(`(?<![.\\w$])${name}\\s*[.(]`, 'g')
  const matches = source.match(bare)
  if (matches !== null && matches.length > 0) offenders.push(`${name} (${matches.length}x)`)
}

if (offenders.length > 0) {
  console.error(`FAIL: the client bundle uses non-existent ambient globals: ${offenders.join(', ')}`)
  console.error('      qualify them as window.<name>, or read the service from ctx.')
  process.exit(1)
}
console.log('OK no undeclared ambient globals')

