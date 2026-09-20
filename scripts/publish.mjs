#!/usr/bin/env node
/**
 * Prepare this plugin for the DSH community market.
 *
 * 1. Verifies the package can be packed and the browser bundle still parses.
 * 2. Fills submission/entry.template.yml with the real GitHub coordinates and
 *    writes it to submission/<owner>__<repo>.yml — the exact file the
 *    awesome-dsh-plugin registry wants in data/plugins/.
 *
 * Usage:
 *   node scripts/publish.mjs <owner>/<repo>
 *
 * Pushing, tagging, and opening the registry PR stay manual: they need
 * credentials this script deliberately does not touch.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const slug = args[0]

if (slug === undefined || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(slug)) {
  console.error('usage: node scripts/publish.mjs <owner>/<repo>')
  process.exit(2)
}

const [owner, repo] = slug.split('/')
const remote = `https://github.com/${owner}/${repo}`

console.log('=== 1/3 verifying package ===')
const check = execFileSync(process.execPath, [join(root, 'scripts', 'check-client.mjs')], { encoding: 'utf8' })
process.stdout.write(check)

console.log('=== 2/3 building the tarball ===')
execFileSync('npm', ['pack'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })

console.log('=== 3/3 writing the registry entry ===')
const template = readFileSync(join(root, 'submission', 'entry.template.yml'), 'utf8')
const entry = template
  .replace(/^#.*\n/gm, '')
  .replaceAll('<owner>/<repo>', slug)
  .replaceAll('<owner>', owner)
  .replaceAll('<repo>', repo)

const target = join(root, 'submission', `${owner}__${repo}.yml`)
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, entry)
console.log(entry.trim())

console.log(`\nnext steps:`)
console.log(`  1. git remote add origin ${remote}.git && git push -u origin main`)
console.log(`  2. add the "dsh-plugin" topic to the repository`)
console.log(`  3. attach the version-free dsh-run-button.tgz to a GitHub Release (tag v<version>)`)
console.log(`  4. open a PR adding submission/${owner}__${repo}.yml as data/plugins/${owner}__${repo}.yml`)
