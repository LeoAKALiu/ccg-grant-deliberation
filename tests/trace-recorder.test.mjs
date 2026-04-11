import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTraceRecorder } from '../scripts/trace-recorder.mjs'

const tmpDirs = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await import('node:fs/promises').then(fs => fs.rm(dir, { recursive: true, force: true }))
  }
})

describe('trace recorder', () => {
  it('creates run and task artifacts when enabled', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ccg-trace-test-'))
    tmpDirs.push(tmpDir)

    const recorder = await createTraceRecorder({
      enabled: true,
      baseDir: tmpDir,
      traceId: 'trace-demo',
      runMeta: { topic: 'demo', template: 'research' },
    })

    await recorder.writeEvent({ type: 'phase_enter', phase: 'opening' })
    const taskFile = await recorder.writeTask({
      phase: 'opening',
      provider: 'Gemini',
      label: 'Gemini 立论',
      prompt: 'hello',
      stdout: '{"ok":true}',
      stderr: '',
    })
    await recorder.writeRunMeta({ completed_at: 'now', status: 'success' })

    const runJson = JSON.parse(await readFile(path.join(recorder.traceDir, 'run.json'), 'utf-8'))
    const events = await readFile(path.join(recorder.traceDir, 'events.jsonl'), 'utf-8')
    const taskJson = JSON.parse(await readFile(taskFile, 'utf-8'))
    const taskFiles = await readdir(path.join(recorder.traceDir, 'tasks'))

    expect(runJson.topic).toBe('demo')
    expect(events).toContain('"type":"phase_enter"')
    expect(taskJson.provider).toBe('Gemini')
    expect(taskFiles).toHaveLength(1)
  })

  it('becomes a no-op when disabled', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ccg-trace-test-'))
    tmpDirs.push(tmpDir)

    const recorder = await createTraceRecorder({
      enabled: false,
      baseDir: tmpDir,
      traceId: 'trace-disabled',
      runMeta: {},
    })

    await recorder.writeEvent({ type: 'noop' })
    await recorder.writeTask({ phase: 'noop', provider: 'none' })

    expect(recorder.enabled).toBe(false)
    expect(recorder.traceDir).toBe('')
  })
})
