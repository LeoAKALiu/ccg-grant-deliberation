#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { inspectRuntimeEnvironment, renderSetupReport } from './runtime-environment.mjs'

export function parseSetupArgs(argv) {
  return {
    skipInstall: argv.includes('--skip-install') || process.env.CCG_SKIP_SETUP_INSTALL === '1',
  }
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      }
      else {
        reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`))
      }
    })
  })
}

export async function runSetup(argv = process.argv.slice(2)) {
  const options = parseSetupArgs(argv)
  if (!options.skipInstall) {
    await runCommand('npm', ['install'], process.cwd())
  }

  const report = inspectRuntimeEnvironment({ cwd: process.cwd() })
  process.stdout.write(renderSetupReport(report, { skippedInstall: options.skipInstall }))
  return report
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch((error) => {
    console.error(String(error instanceof Error ? error.message : error))
    process.exit(1)
  })
}
