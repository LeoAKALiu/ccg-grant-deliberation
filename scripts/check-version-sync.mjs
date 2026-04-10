#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'))
const pluginJson = JSON.parse(readFileSync(path.join(repoRoot, '.codex-plugin', 'plugin.json'), 'utf-8'))
const changelog = readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf-8')

if (packageJson.version !== pluginJson.version) {
  console.error(`Version mismatch: package.json=${packageJson.version}, .codex-plugin/plugin.json=${pluginJson.version}`)
  process.exit(1)
}

const expectedHeading = `## v${packageJson.version}`
if (!changelog.includes(expectedHeading)) {
  console.error(`CHANGELOG.md is missing heading: ${expectedHeading}`)
  process.exit(1)
}

console.log(`Version sync check passed for v${packageJson.version}.`)
