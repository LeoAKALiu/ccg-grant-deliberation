#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const readmePath = path.join(repoRoot, 'README.md')
const readme = readFileSync(readmePath, 'utf-8')

const requiredStrings = [
  'actions/workflows/ci.yml/badge.svg',
  'node scripts/setup.mjs',
  'node scripts/doctor.mjs',
  'node scripts/run-grant-deliberation.mjs',
  'v0.2.0',
  'prerelease',
]

const requiredRelativeLinks = [
  './examples/materials/minimal-brief.md',
  './examples/output/example-report.md',
  './examples/output/example-report-research.md',
  './docs/privacy.md',
  './docs/terms.md',
  './CHANGELOG.md',
  './docs/releasing.md',
]

const errors = []

for (const value of requiredStrings) {
  if (!readme.includes(value)) {
    errors.push(`README is missing required text: ${value}`)
  }
}

for (const link of requiredRelativeLinks) {
  if (!readme.includes(`](${link})`)) {
    errors.push(`README is missing required link: ${link}`)
  }
  const resolved = path.resolve(repoRoot, link)
  if (!existsSync(resolved)) {
    errors.push(`Linked file does not exist: ${link}`)
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log('README docs check passed.')
