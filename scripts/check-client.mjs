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
