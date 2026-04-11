import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'trace'
}

export async function createTraceRecorder({
  enabled = false,
  baseDir,
  traceId,
  runMeta,
}) {
  if (!enabled) {
    return {
      enabled: false,
      traceDir: '',
      async writeRunMeta() {},
      async writeEvent() {},
      async updateTask() {},
      async writeTask() {},
    }
  }

  const traceDir = path.join(baseDir, sanitizeSegment(traceId))
  const tasksDir = path.join(traceDir, 'tasks')
  await mkdir(tasksDir, { recursive: true })

  const runJsonPath = path.join(traceDir, 'run.json')
  const eventsPath = path.join(traceDir, 'events.jsonl')
  let taskCounter = 0

  async function writeRunMeta(extra = {}) {
    await writeFile(runJsonPath, `${JSON.stringify({ ...runMeta, ...extra }, null, 2)}\n`, 'utf-8')
  }

  async function writeEvent(event) {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event,
    })
    await appendFile(eventsPath, `${line}\n`, 'utf-8')
  }

  async function writeTask(task) {
    taskCounter += 1
    const fileName = `${String(taskCounter).padStart(3, '0')}-${sanitizeSegment(task.phase)}-${sanitizeSegment(task.provider)}.json`
    const target = path.join(tasksDir, fileName)
    await writeFile(target, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...task,
      task_file: target,
    }, null, 2)}\n`, 'utf-8')
    return target
  }

  async function updateTask(taskPath, patch) {
    const current = JSON.parse(await readFile(taskPath, 'utf-8'))
    await writeFile(taskPath, `${JSON.stringify({
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    }, null, 2)}\n`, 'utf-8')
    return taskPath
  }

  await writeRunMeta()

  return {
    enabled: true,
    traceDir,
    writeRunMeta,
    writeEvent,
    updateTask,
    writeTask,
  }
}
