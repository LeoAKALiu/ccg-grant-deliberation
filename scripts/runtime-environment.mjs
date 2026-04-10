import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const MIN_NODE_MAJOR = 18
export const EXAMPLE_TOPIC = '论证某科技项目申请书的关键科学问题、工程化难点和最优技术路线'
export const EXAMPLE_MATERIAL = 'examples/materials/minimal-brief.md'

export const PROVIDER_DEFINITIONS = {
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    command: 'gemini',
    required: false,
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    command: 'claude',
    required: false,
  },
  gpt: {
    id: 'gpt',
    label: 'GPT(codex)',
    command: 'codex',
    required: true,
  },
}

export function searchPathForCommand(commandName) {
  const extList = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : ['']

  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue
    for (const ext of extList) {
      const candidate = path.join(dir, process.platform === 'win32' && ext ? `${commandName}${ext}` : commandName)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  return ''
}

export function resolveWrapperPath({ configuredPath = process.env.CCG_CODEAGENT_WRAPPER, homeDir = os.homedir(), commandLookup = searchPathForCommand } = {}) {
  if (configuredPath && existsSync(configuredPath)) {
    return configuredPath
  }

  const homeCandidate = path.join(homeDir, '.claude', 'bin', process.platform === 'win32' ? 'codeagent-wrapper.exe' : 'codeagent-wrapper')
  if (existsSync(homeCandidate)) {
    return homeCandidate
  }

  return commandLookup('codeagent-wrapper')
}

export function getNodeInfo(nodeVersion = process.versions.node) {
  const major = Number.parseInt(String(nodeVersion).split('.')[0], 10) || 0
  return {
    version: nodeVersion,
    major,
    minimumMajor: MIN_NODE_MAJOR,
    ok: major >= MIN_NODE_MAJOR,
  }
}

export function getExampleRunCommand() {
  return `node scripts/run-grant-deliberation.mjs --topic "${EXAMPLE_TOPIC}" --material ${EXAMPLE_MATERIAL}`
}

function buildCommandStatus(name, location) {
  return {
    name,
    available: Boolean(location),
    path: location || '',
  }
}

function buildInstallAdvice(key) {
  switch (key) {
    case 'node':
      return `升级 Node.js 到 ${MIN_NODE_MAJOR}+ 后重试。`
    case 'codeagent-wrapper':
      return '安装 codeagent-wrapper，或设置 `CCG_CODEAGENT_WRAPPER=/absolute/path/to/codeagent-wrapper`。'
    case 'codex':
      return '安装 Codex CLI，并确保 `codex` 在 PATH 中。'
    case 'gemini':
      return '如需三方会审，请安装 Gemini CLI 并确保 `gemini` 在 PATH 中。'
    case 'claude':
      return '如需三方会审，请安装 Claude CLI 并确保 `claude` 在 PATH 中。'
    default:
      return `安装或修复 ${key} 后重试。`
  }
}

export function inspectRuntimeEnvironment({
  cwd = process.cwd(),
  nodeVersion = process.versions.node,
  commandLookup = searchPathForCommand,
  wrapperPath = undefined,
  homeDir = os.homedir(),
} = {}) {
  const node = getNodeInfo(nodeVersion)
  const resolvedWrapperPath = wrapperPath === undefined
    ? resolveWrapperPath({ commandLookup, homeDir })
    : wrapperPath

  const commands = {
    'codeagent-wrapper': buildCommandStatus('codeagent-wrapper', resolvedWrapperPath),
    codex: buildCommandStatus('codex', commandLookup('codex')),
    gemini: buildCommandStatus('gemini', commandLookup('gemini')),
    claude: buildCommandStatus('claude', commandLookup('claude')),
  }

  const activeDebaterIds = [
    ...(commands.gemini.available ? ['gemini'] : []),
    ...(commands.claude.available ? ['claude'] : []),
    ...(commands.codex.available ? ['gpt'] : []),
  ]

  const missingRequired = []
  if (!node.ok) {
    missingRequired.push('node')
  }
  if (!commands['codeagent-wrapper'].available) {
    missingRequired.push('codeagent-wrapper')
  }
  if (!commands.codex.available) {
    missingRequired.push('codex')
  }

  const missingOptional = []
  if (!commands.gemini.available) {
    missingOptional.push('gemini')
  }
  if (!commands.claude.available) {
    missingOptional.push('claude')
  }

  let status = 'ready'
  let runMode = 'full'
  if (missingRequired.length > 0) {
    status = 'blocked'
    runMode = 'blocked'
  }
  else if (activeDebaterIds.length === 1) {
    status = 'degraded'
    runMode = 'minimal'
  }
  else if (activeDebaterIds.length === 2) {
    status = 'degraded'
    runMode = 'partial'
  }

  const dependenciesInstalled = existsSync(path.join(cwd, 'node_modules'))

  return {
    cwd,
    node,
    dependenciesInstalled,
    commands,
    status,
    runMode,
    activeDebaterIds,
    activeDebaterLabels: activeDebaterIds.map(id => PROVIDER_DEFINITIONS[id].label),
    missingRequired,
    missingOptional,
    installAdvice: [...missingRequired, ...missingOptional].map(key => ({
      key,
      advice: buildInstallAdvice(key),
    })),
  }
}

export function formatCommandLine(label, status) {
  return `- ${label}: ${status.available ? status.path : 'missing'}`
}

export function renderDoctorReport(report, { json = false, hook = false } = {}) {
  if (json) {
    return JSON.stringify(report, null, 2)
  }

  if (hook) {
    if (report.status === 'blocked') {
      return 'CCG 课题论证尚未完成环境准备。先运行: node scripts/setup.mjs 或 node scripts/doctor.mjs'
    }
    if (report.status === 'degraded') {
      const missing = report.missingOptional.join(', ')
      return `CCG 课题论证可降级运行（缺少: ${missing}）。先运行 node scripts/doctor.mjs 查看详情。`
    }
    return `CCG 课题论证已就绪。示例: ${getExampleRunCommand()}`
  }

  const lines = [
    'CCG Grant Deliberation Doctor',
    '',
    `Status: ${report.status}`,
    `Run mode: ${report.runMode}`,
    `Node: ${report.node.version}${report.node.ok ? '' : ` (needs >= ${report.node.minimumMajor})`}`,
    `Project dependencies: ${report.dependenciesInstalled ? 'installed' : 'not installed'}`,
    '',
    'Commands:',
    formatCommandLine('codeagent-wrapper', report.commands['codeagent-wrapper']),
    formatCommandLine('codex', report.commands.codex),
    formatCommandLine('gemini', report.commands.gemini),
    formatCommandLine('claude', report.commands.claude),
    '',
    `Active debaters: ${report.activeDebaterLabels.length > 0 ? report.activeDebaterLabels.join(', ') : 'none'}`,
  ]

  if (report.missingRequired.length > 0) {
    lines.push(`Blocking issues: ${report.missingRequired.join(', ')}`)
  }
  if (report.missingOptional.length > 0) {
    lines.push(`Optional providers missing: ${report.missingOptional.join(', ')}`)
  }

  lines.push('', 'Next steps:')
  if (report.installAdvice.length > 0) {
    report.installAdvice.forEach((item) => lines.push(`- ${item.advice}`))
  }
  else {
    lines.push('- 环境已满足完整运行条件。')
  }
  lines.push(`- 运行环境检查: node scripts/doctor.mjs`)
  lines.push(`- 示例运行: ${getExampleRunCommand()}`)

  return `${lines.join('\n')}\n`
}

export function renderSetupReport(report, { skippedInstall = false } = {}) {
  const lines = [
    'CCG Grant Deliberation Setup',
    '',
    skippedInstall ? '- 已跳过 npm install。' : '- 已执行 npm install。',
    `- 当前状态: ${report.status}`,
    `- 当前运行级别: ${report.runMode}`,
  ]

  if (report.installAdvice.length > 0) {
    lines.push('', '仍需完成的环境准备:')
    report.installAdvice.forEach((item) => lines.push(`- ${item.advice}`))
  }
  else {
    lines.push('', '- 所有已知依赖已就绪。')
  }

  lines.push('', 'Codex 加载提示:')
  lines.push('- 使用本仓库根目录作为本地插件目录，确保 `.codex-plugin/plugin.json` 可被 Codex 读取。')
  lines.push('- 如需再次检查环境，执行 `node scripts/doctor.mjs`。')
  lines.push(`- 可直接试跑: ${getExampleRunCommand()}`)

  return `${lines.join('\n')}\n`
}
