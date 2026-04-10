#!/usr/bin/env node

import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const pluginSource = repoRoot
const homeMarketplaceDir = path.join(os.homedir(), '.agents', 'plugins')
const homeMarketplacePath = path.join(homeMarketplaceDir, 'marketplace.json')
const homePluginsDir = path.join(os.homedir(), 'plugins')
const homePluginTarget = path.join(homePluginsDir, 'ccg-grant-deliberation')

async function ensureMarketplace() {
  await mkdir(homeMarketplaceDir, { recursive: true })
  let data = {
    name: 'ccg-local',
    interface: {
      displayName: 'CCG Local Plugins',
    },
    plugins: [],
  }

  try {
    data = JSON.parse(await readFile(homeMarketplacePath, 'utf-8'))
  }
  catch {
    // Seed a new marketplace below.
  }

  if (!Array.isArray(data.plugins)) {
    data.plugins = []
  }
  if (!data.interface) {
    data.interface = { displayName: 'CCG Local Plugins' }
  }

  const entry = {
    name: 'ccg-grant-deliberation',
    source: {
      source: 'local',
      path: './plugins/ccg-grant-deliberation',
    },
    policy: {
      installation: 'INSTALLED_BY_DEFAULT',
      authentication: 'ON_INSTALL',
    },
    category: 'Productivity',
  }

  const existingIndex = data.plugins.findIndex((plugin) => plugin.name === entry.name)
  if (existingIndex >= 0) {
    data.plugins[existingIndex] = entry
  }
  else {
    data.plugins.push(entry)
  }

  await writeFile(homeMarketplacePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

async function ensureSymlink() {
  await mkdir(homePluginsDir, { recursive: true })
  try {
    await symlink(pluginSource, homePluginTarget, 'dir')
  }
  catch (error) {
    if (String(error).includes('EEXIST')) {
      return
    }
    throw error
  }
}

async function main() {
  await ensureSymlink()
  await ensureMarketplace()
  console.log(`Installed plugin into Codex home plugin registry:
- Source: ${pluginSource}
- Linked: ${homePluginTarget}
- Marketplace: ${homeMarketplacePath}`)
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
