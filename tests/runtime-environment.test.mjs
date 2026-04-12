import { describe, expect, it } from 'vitest'
import {
  EXAMPLE_MATERIAL,
  EXAMPLE_TOPIC,
  inspectRuntimeEnvironment,
  renderDoctorReport,
  renderSetupReport,
} from '../scripts/runtime-environment.mjs'

function makeLookup(available) {
  return (command) => available[command] || ''
}

describe('runtime environment inspection', () => {
  it('reports full mode when all providers are available', () => {
    const report = inspectRuntimeEnvironment({
      cwd: process.cwd(),
      commandLookup: makeLookup({
        codex: '/bin/codex',
        gemini: '/bin/gemini',
        claude: '/bin/claude',
      }),
      nodeVersion: '20.11.0',
    })

    expect(report.status).toBe('ready')
    expect(report.runMode).toBe('full')
    expect(report.activeDebaterIds).toEqual(['gemini', 'claude', 'gpt'])
  })

  it('reports partial mode when one optional provider is missing', () => {
    const report = inspectRuntimeEnvironment({
      cwd: process.cwd(),
      commandLookup: makeLookup({
        codex: '/bin/codex',
        gemini: '/bin/gemini',
      }),
      nodeVersion: '20.11.0',
    })

    expect(report.status).toBe('degraded')
    expect(report.runMode).toBe('partial')
    expect(report.missingOptional).toEqual(['claude'])
  })

  it('reports minimal mode when only codex is available', () => {
    const report = inspectRuntimeEnvironment({
      cwd: process.cwd(),
      commandLookup: makeLookup({
        codex: '/bin/codex',
      }),
      nodeVersion: '20.11.0',
    })

    expect(report.status).toBe('degraded')
    expect(report.runMode).toBe('minimal')
    expect(report.activeDebaterIds).toEqual(['gpt'])
  })

  it('reports blocked when codex is missing', () => {
    const missingCodex = inspectRuntimeEnvironment({
      cwd: process.cwd(),
      commandLookup: makeLookup({ gemini: '/bin/gemini' }),
      nodeVersion: '20.11.0',
    })

    expect(missingCodex.status).toBe('blocked')
    expect(missingCodex.missingRequired).toContain('codex')
  })

  it('renders doctor and setup outputs with actionable next steps', () => {
    const report = inspectRuntimeEnvironment({
      cwd: process.cwd(),
      commandLookup: makeLookup({
        codex: '/bin/codex',
      }),
      nodeVersion: '20.11.0',
    })

    const doctor = renderDoctorReport(report)
    const setup = renderSetupReport(report, { skippedInstall: true })

    expect(doctor).toContain('Status: degraded')
    expect(doctor).toContain(`示例运行: node scripts/run-grant-deliberation.mjs --topic "${EXAMPLE_TOPIC}" --material ${EXAMPLE_MATERIAL}`)
    expect(setup).toContain('当前运行级别: minimal')
    expect(setup).toContain('node scripts/doctor.mjs')
  })
})
