#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function normalizeVersion(value) {
  const input = String(value || '').trim()
  if (!input) return ''
  return input.startsWith('v') ? input : `v${input}`
}

const version = normalizeVersion(process.argv[2])
if (!version) {
  console.error('Usage: node scripts/extract-release-notes.mjs <version>')
  process.exit(1)
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const changelog = readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf-8')
const lines = changelog.split('\n')
const heading = `## ${version}`
const start = lines.findIndex(line => line.trim() === heading)

if (start === -1) {
  console.error(`Version section not found in CHANGELOG.md: ${heading}`)
  process.exit(1)
}

let end = lines.length
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith('## ')) {
    end = i
    break
  }
}

const body = lines.slice(start + 1, end).join('\n').trim()
if (!body) {
  console.error(`Version section ${heading} is empty`)
  process.exit(1)
}

process.stdout.write(`${body}\n`)
