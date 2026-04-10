#!/usr/bin/env node

import { inspectRuntimeEnvironment, renderDoctorReport } from './runtime-environment.mjs'

export function parseDoctorArgs(argv) {
  return {
    allowBlocked: argv.includes('--allow-blocked'),
    json: argv.includes('--json'),
    hook: argv.includes('--hook'),
  }
}

export async function runDoctor(argv = process.argv.slice(2)) {
  const options = parseDoctorArgs(argv)
  const report = inspectRuntimeEnvironment({ cwd: process.cwd() })
  const output = renderDoctorReport(report, options)

  if (output) {
    const stream = options.hook ? process.stdout : report.status === 'blocked' ? process.stderr : process.stdout
    stream.write(output.endsWith('\n') ? output : `${output}\n`)
  }

  if (!options.hook && !options.allowBlocked && report.status === 'blocked') {
    process.exitCode = 1
  }

  return report
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDoctor().catch((error) => {
    console.error(String(error instanceof Error ? error.message : error))
    process.exit(1)
  })
}
