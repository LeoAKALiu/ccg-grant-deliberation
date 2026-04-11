#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { inspectRuntimeEnvironment } from './runtime-environment.mjs'
import { createTraceRecorder } from './trace-recorder.mjs'

export const DEFAULT_LANGUAGE = 'zh-CN'
export const DEFAULT_FOCUS = [
  'key_scientific_questions',
  'engineering_bottlenecks',
  'technical_route',
]
export const TEMPLATE_OPTIONS = ['research', 'engineering']
export const ESCALATION_THRESHOLD = 0.72
export const RESEARCH_MAX_FOCUS_PAIRS = 1
export const RESEARCH_CHECKPOINT_VERSION = 1
const MAX_MATERIAL_CHARS = 8000
const MATERIAL_SNIPPET_CHARS = 2000
const PROGRESS_RENDER_INTERVAL_MS = 1800
const DEFAULT_TASK_TIMEOUT_MS = Number.parseInt(process.env.CCG_TASK_TIMEOUT_MS || '180000', 10)
const DEFAULT_RUN_TIMEOUT_MS = Number.parseInt(process.env.CCG_RUN_TIMEOUT_MS || '900000', 10)
export const RESEARCH_CHECKPOINT_FILE_MAP = {
  openings: 'openings.json',
  'pair-results': 'pair-results.json',
  strategy: 'strategy.json',
  outline: 'outline.json',
  compose: 'compose.json',
  review: 'review.json',
  'final-summary': 'final-summary.json',
}
export const RESEARCH_RESUME_PRIORITY = [
  'review',
  'compose',
  'outline',
  'strategy',
  'pair-results',
  'openings',
]
const RESEARCH_STAGE_REQUIREMENTS = {
  review: ['openings', 'pair-results', 'strategy', 'outline', 'compose', 'review'],
  compose: ['openings', 'pair-results', 'strategy', 'outline', 'compose'],
  outline: ['openings', 'pair-results', 'strategy', 'outline'],
  strategy: ['openings', 'pair-results', 'strategy'],
  'pair-results': ['openings', 'pair-results'],
  openings: ['openings'],
}
const STYLE_BRIEF_HINTS = [
  { pattern: /中标|申报指南|指南|模板|guide|template|call[-_\s]?for[-_\s]?proposal|proposal/i, reason: '样式/指南材料' },
  { pattern: /研究计划|研究方案|project plan|research plan/i, reason: '研究计划材料' },
  { pattern: /格式要求|写作要求|撰写说明|注意事项|format/i, reason: '格式约束材料' },
]
const EXECUTION_GUARDRAILS = [
  '执行约束：',
  '- 不要浏览网页，不要打开浏览器，不要调用 web/search/browser 类工具。',
  '- 不要读取仓库、技能、README、AGENTS.md、.omx 或任何未在本 prompt 中提供的文件。',
  '- 不要解释你将如何工作，不要描述环境检查过程，不要输出元评论。',
  '- 只基于本 prompt 中给出的 dossier、会审结果和约束完成任务。',
  '- 严格按照给定 JSON schema 返回，不要附加额外说明。',
].join('\n')

const DEBATERS = {
  gemini: {
    id: 'gemini',
    backend: 'gemini',
    display: 'Gemini',
    role: 'gemini-debater',
  },
  claude: {
    id: 'claude',
    backend: 'claude',
    display: 'Claude',
    role: 'claude-debater',
  },
  gpt: {
    id: 'gpt',
    backend: 'codex',
    display: 'GPT(codex)',
    role: 'codex-gpt-debater',
  },
}

const CHAIR = {
  id: 'chair',
  backend: 'codex',
  display: 'Codex Chair',
  role: 'codex-chair',
}

const PROVIDER_STRATEGY_SUMMARY = [
  'gemini: direct',
  'claude: direct',
  'codex: wrapper',
]

const ROLE_PROMPTS = {
  'gemini-debater': `
你是 Gemini 侧的课题论证专家，擅长问题 framing、评审说服力、系统整合、路线表达与应用价值论证。
你的任务不是重复别人，而是给出独立主张。
重点：
- 把散乱议题收敛为可被评审理解并认可的问题结构
- 识别哪些技术路线更容易形成“有故事、有阶段成果、有可验证价值”的申请书
- 明确指出表达强但技术空心的方案，以及技术强但申报叙事弱的方案
- 输出必须简洁、决断、结构化
`,
  'claude-debater': `
你是 Claude 侧的课题论证专家，擅长论证结构、研究设计、叙事严密性、约束平衡与整体 coherence。
你的任务不是中庸折中，而是提出最能自洽、最能经受审查的问题定义和研究路线。
重点：
- 检查议题是否真正构成“值得立项”的研究问题
- 强调研究目标、实施边界、阶段产出、风险控制之间的连贯性
- 找出听上去宏大但内部逻辑松散的方案
- 输出必须结构化、具体、强判断
`,
  'codex-gpt-debater': `
你代表 OpenAI/GPT 一侧参与课题论证，风格是技术硬核与工程可交付优先。
重点：
- 划清“关键科学问题”和“工程优化问题”的边界
- 识别真实工程瓶颈、验证路径、数据/算力/集成约束
- 对候选路线做 deliverability 与 upside 的排序
- 不要迎合对手，要主动攻击脆弱假设
`,
  'codex-chair': `
你是 Codex 主席，不参与站队，只负责会审、评分、裁决与汇总。
重点：
- 为每个 pair 量化冲突强度和未决程度
- 仅在高价值分歧上建议加赛
- 汇总时必须给出最终路线、淘汰理由、证据缺口和申报书可用表述
- 不允许输出模糊折中结论
`,
}

function printUsage() {
  console.log(`CCG 课题论证

Usage:
  node scripts/run-grant-deliberation.mjs --topic "<议题>"
  node scripts/run-grant-deliberation.mjs --topic "<议题>" --material path/to/file.md

Options:
  --topic <text>         论证议题
  --material <path>      本地材料路径，可重复传入
  --materials <a,b,c>    逗号分隔的材料路径列表
  --language <lang>      输出语言，默认 zh-CN
  --focus <a,b,c>        关注维度，默认 key_scientific_questions,engineering_bottlenecks,technical_route
  --template <name>      章节模板：research | engineering
  --resume-research      显式从已有 research checkpoint 恢复
  --fresh-research       忽略已有 research checkpoint，从头重跑
  --trace                写入本地 orchestration trace 到 .omx/trace/
  --output <path>        自定义输出路径
  --help                 显示帮助

Environment:
  node scripts/doctor.mjs
  node scripts/setup.mjs
`)
}

export function slugifyTopic(topic) {
  return String(topic || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'grant-deliberation'
}

export function resolveOutputPath(cwd, topic, outputPath) {
  if (outputPath) {
    return path.resolve(cwd, outputPath)
  }
  return path.join(cwd, 'reports', 'ccg-grant-deliberation', `${slugifyTopic(topic)}.md`)
}

export function buildRoundRobinPairs(participants = ['gemini', 'claude', 'gpt']) {
  const normalized = [...new Set((participants || []).filter(Boolean))]
  const pairs = []
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      pairs.push({
        id: `${normalized[i]}-vs-${normalized[j]}`,
        participants: [normalized[i], normalized[j]],
      })
    }
  }
  return pairs
}

export function parseCliArgs(argv) {
  const options = {
    topic: '',
    materials: [],
    language: DEFAULT_LANGUAGE,
    focus: [...DEFAULT_FOCUS],
    template: '',
    resumeResearch: false,
    freshResearch: false,
    trace: process.env.CCG_TRACE === '1',
    outputPath: '',
    help: false,
  }

  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--topic':
        options.topic = argv[++i] || ''
        break
      case '--material':
        if (argv[i + 1]) {
          options.materials.push(argv[++i])
        }
        break
      case '--materials':
        if (argv[i + 1]) {
          options.materials.push(...argv[++i].split(',').map(item => item.trim()).filter(Boolean))
        }
        break
      case '--language':
        options.language = argv[++i] || DEFAULT_LANGUAGE
        break
      case '--focus':
        if (argv[i + 1]) {
          options.focus = argv[++i].split(',').map(item => item.trim()).filter(Boolean)
        }
        break
      case '--template':
        options.template = argv[++i] || ''
        break
      case '--trace':
        options.trace = true
        break
      case '--resume-research':
        options.resumeResearch = true
        break
      case '--fresh-research':
        options.freshResearch = true
        break
      case '--output':
        options.outputPath = argv[++i] || ''
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        positional.push(arg)
        break
    }
  }

  if (!options.topic && positional.length > 0) {
    options.topic = positional.join(' ').trim()
  }

  if (options.focus.length === 0) {
    options.focus = [...DEFAULT_FOCUS]
  }

  if (!TEMPLATE_OPTIONS.includes(options.template)) {
    options.template = ''
  }

  if (options.freshResearch) {
    options.resumeResearch = false
  }

  return options
}

export function buildResearchCheckpointTopicDir(cwd, topic, template = 'research') {
  return path.join(cwd, '.omx', 'checkpoints', template, slugifyTopic(topic))
}

export function buildResearchCheckpointRunDir(cwd, topic, template, runId) {
  return path.join(buildResearchCheckpointTopicDir(cwd, topic, template), runId)
}

export function getResearchCheckpointFilePath(checkpointDir, phase) {
  const fileName = RESEARCH_CHECKPOINT_FILE_MAP[phase]
  if (!fileName) {
    throw new Error(`Unknown research checkpoint phase: ${phase}`)
  }
  return path.join(checkpointDir, fileName)
}

async function readJsonFileIfExists(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

function isValidResearchCheckpointRecord(record, phase, topic, template) {
  return Boolean(
    record
    && record.checkpoint_version === RESEARCH_CHECKPOINT_VERSION
    && record.phase === phase
    && record.topic === topic
    && record.template === template
    && Object.hasOwn(record, 'payload')
    && record.payload !== null
    && typeof record.created_at === 'string'
    && record.created_at.length > 0,
  )
}

export function determineResearchResumePhase(phaseRecords = {}) {
  for (const phase of RESEARCH_RESUME_PRIORITY) {
    const requiredPhases = RESEARCH_STAGE_REQUIREMENTS[phase] || []
    if (requiredPhases.every(requiredPhase => phaseRecords[requiredPhase])) {
      return phase
    }
  }
  return ''
}

export function getResearchWritingPendingStages(state = {}) {
  const pending = []
  if (!state.strategy) {
    pending.push('strategy')
  }
  if (!state.outline) {
    pending.push('outline')
  }
  if (!state.composedDraft) {
    pending.push('compose')
  }
  if (!state.review) {
    pending.push('review')
  }
  return pending
}

export async function loadResearchCheckpointState({ cwd, topic, template = 'research', runId }) {
  const checkpointDir = buildResearchCheckpointRunDir(cwd, topic, template, runId)
  const phaseRecords = {}
  for (const phase of Object.keys(RESEARCH_CHECKPOINT_FILE_MAP)) {
    if (phase === 'final-summary') {
      continue
    }
    const record = await readJsonFileIfExists(getResearchCheckpointFilePath(checkpointDir, phase))
    if (isValidResearchCheckpointRecord(record, phase, topic, template)) {
      phaseRecords[phase] = record
    }
  }

  const resumePhase = determineResearchResumePhase(phaseRecords)
  if (!resumePhase) {
    return null
  }

  const pairPayload = phaseRecords['pair-results']?.payload || {}
  return {
    checkpointDir,
    runId,
    resumePhase,
    restored: {
      openings: phaseRecords.openings?.payload || null,
      pairResults: pairPayload.pairResults || null,
      escalatedPairs: Array.isArray(pairPayload.escalatedPairs) ? pairPayload.escalatedPairs : [],
      strategy: phaseRecords.strategy?.payload || null,
      outline: phaseRecords.outline?.payload || null,
      composedDraft: phaseRecords.compose?.payload || null,
      review: phaseRecords.review?.payload || null,
    },
  }
}

export async function resolveResearchCheckpointSession({
  cwd,
  topic,
  template = 'research',
  runId,
  mode = 'auto',
  providerStrategy = PROVIDER_STRATEGY_SUMMARY,
}) {
  const topicDir = buildResearchCheckpointTopicDir(cwd, topic, template)
  await mkdir(topicDir, { recursive: true })

  if (mode !== 'fresh') {
    const entries = await readdir(topicDir, { withFileTypes: true }).catch(() => [])
    const runIds = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
      .reverse()

    for (const candidateRunId of runIds) {
      const state = await loadResearchCheckpointState({ cwd, topic, template, runId: candidateRunId })
      if (state?.resumePhase) {
        return {
          ...state,
          reused: true,
          created: false,
          mode,
          providerStrategy,
        }
      }
    }
  }

  const checkpointDir = buildResearchCheckpointRunDir(cwd, topic, template, runId)
  await mkdir(checkpointDir, { recursive: true })
  return {
    checkpointDir,
    runId,
    resumePhase: '',
    restored: {
      openings: null,
      pairResults: null,
      escalatedPairs: [],
      strategy: null,
      outline: null,
      composedDraft: null,
      review: null,
    },
    reused: false,
    created: true,
    mode,
    providerStrategy,
  }
}

export async function writeResearchCheckpoint({
  checkpointDir,
  phase,
  topic,
  template = 'research',
  providerStrategy = PROVIDER_STRATEGY_SUMMARY,
  payload,
}) {
  const filePath = getResearchCheckpointFilePath(checkpointDir, phase)
  const record = {
    checkpoint_version: RESEARCH_CHECKPOINT_VERSION,
    phase,
    created_at: new Date().toISOString(),
    topic,
    template,
    provider_strategy: providerStrategy,
    payload,
  }
  await mkdir(checkpointDir, { recursive: true })
  await writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8')
  return filePath
}

export function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function parseWrapperOutput(stdout) {
  const text = String(stdout || '')
  const sessionMatch = text.match(/\n---\nSESSION_ID:\s*([^\n]+)\s*$/)
  const sessionId = sessionMatch ? sessionMatch[1].trim() : ''
  const message = sessionMatch ? text.slice(0, sessionMatch.index).trim() : text.trim()
  return { message, sessionId }
}

export function extractJsonPayload(text) {
  const input = String(text || '').trim()
  if (!input) {
    throw new Error('empty model output')
  }

  const cleaned = sanitizeJsonLikeText(input)

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    return JSON.parse(stripTrailingCommas(fenced[1].trim()))
  }

  const start = cleaned.indexOf('{')
  if (start === -1) {
    throw new Error('no JSON object found in model output')
  }

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (inString) {
      if (escaped) {
        escaped = false
      }
      else if (ch === '\\') {
        escaped = true
      }
      else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      depth++
      continue
    }
    if (ch === '}') {
      depth--
      if (depth === 0) {
        return JSON.parse(stripTrailingCommas(cleaned.slice(start, i + 1)))
      }
    }
  }

  throw new Error('unterminated JSON object in model output')
}

function sanitizeJsonLikeText(text) {
  return String(text || '')
    .replace(/\uFEFF/g, '')
    .replace(/^MCP issues detected\.[^\n]*\n?/i, '')
    .trim()
}

function stripTrailingCommas(text) {
  return String(text || '').replace(/,\s*([}\]])/g, '$1')
}

export function shouldEscalatePair(scorecard, threshold = ESCALATION_THRESHOLD) {
  const conflict = Number(scorecard?.conflict_score || 0)
  const unresolved = Number(scorecard?.unresolved_degree || 0)
  return conflict >= threshold || unresolved >= threshold || scorecard?.decision_status === 'needs_addendum'
}

export function scoreResearchPairPriority(scorecard) {
  const conflict = Number(scorecard?.conflict_score || 0)
  const unresolved = Number(scorecard?.unresolved_degree || 0)
  return Math.max(conflict, unresolved)
}

export function selectResearchFocusPairs(pairEntries, maxPairs = RESEARCH_MAX_FOCUS_PAIRS) {
  return [...(pairEntries || [])]
    .filter(entry => shouldEscalatePair(entry?.score))
    .sort((a, b) => scoreResearchPairPriority(b.score) - scoreResearchPairPriority(a.score))
    .slice(0, maxPairs)
}

export function renderMarkdownReport({ dossier, finalSummary, pairResults, escalatedPairs, outputPath, runtimeContext }) {
  const keyQuestions = Array.isArray(finalSummary.key_scientific_questions) ? finalSummary.key_scientific_questions : []
  const engineering = Array.isArray(finalSummary.engineering_bottlenecks) ? finalSummary.engineering_bottlenecks : []
  const routes = Array.isArray(finalSummary.candidate_route_comparison) ? finalSummary.candidate_route_comparison : []
  const evidenceGaps = Array.isArray(finalSummary.evidence_gaps) ? finalSummary.evidence_gaps : []
  const selectedRoute = finalSummary.selected_route || {}
  const proposalParagraphs = finalSummary.proposal_ready_paragraphs || {}
  const sectionMapping = finalSummary.proposal_section_mapping || null
  const activeDebaters = Array.isArray(runtimeContext?.activeDebaterLabels) ? runtimeContext.activeDebaterLabels : []
  const missingOptional = Array.isArray(runtimeContext?.missingOptional) ? runtimeContext.missingOptional : []

  const lines = [
    `# CCG 课题论证报告：${dossier.topic}`,
    '',
    '## 运行环境声明',
    `- 运行状态：${runtimeContext?.status || 'unknown'}`,
    `- 运行级别：${runtimeContext?.runMode || 'unknown'}`,
    `- 实际参与方：${activeDebaters.length > 0 ? activeDebaters.join('、') : '未识别'}`,
    `- 可用命令：${runtimeContext?.commands ? Object.entries(runtimeContext.commands).filter(([, item]) => item.available).map(([name]) => name).join('、') : '未识别'}`,
    `- 缺失可选 provider：${missingOptional.length > 0 ? missingOptional.join('、') : '无'}`,
    '',
    '## 议题归一化 Brief',
    finalSummary.normalized_brief || dossier.normalizedBrief,
    '',
    '## 关键科学问题',
  ]

  if (keyQuestions.length === 0) {
    lines.push('- 暂无明确条目')
  }
  else {
    keyQuestions.forEach((item, index) => {
      lines.push(`${index + 1}. ${typeof item === 'string' ? item : item.question || item.title || JSON.stringify(item)}`)
    })
  }

  lines.push('', '## 工程化卡点/难点')
  if (engineering.length === 0) {
    lines.push('- 暂无明确条目')
  }
  else {
    engineering.forEach((item, index) => {
      if (typeof item === 'string') {
        lines.push(`${index + 1}. ${item}`)
      }
      else {
        const title = item.bottleneck || item.title || `难点 ${index + 1}`
        const rootCause = item.root_cause ? `根因：${item.root_cause}` : ''
        const breakthrough = item.breakthrough_path ? `破局路径：${item.breakthrough_path}` : ''
        lines.push(`${index + 1}. ${title}${rootCause ? `；${rootCause}` : ''}${breakthrough ? `；${breakthrough}` : ''}`)
      }
    })
  }

  lines.push('', '## 候选技术路线对比')
  if (routes.length === 0) {
    lines.push('- 暂无明确条目')
  }
  else {
    lines.push('| 路线 | 优势 | 风险 | 适配度 |')
    lines.push('|------|------|------|--------|')
    routes.forEach((route) => {
      const name = route.name || route.route || '未命名路线'
      const strengths = Array.isArray(route.strengths) ? route.strengths.join('；') : route.strengths || '—'
      const risks = Array.isArray(route.risks) ? route.risks.join('；') : route.risks || '—'
      const fit = route.fit || route.rank || '—'
      lines.push(`| ${name} | ${strengths} | ${risks} | ${fit} |`)
    })
  }

  lines.push('', '## 最优技术路线与淘汰理由')
  lines.push(`**最优技术路线**：${selectedRoute.name || '未明确'}`)
  if (selectedRoute.summary) {
    lines.push('', selectedRoute.summary)
  }
  const whySelected = Array.isArray(selectedRoute.why_selected) ? selectedRoute.why_selected : []
  if (whySelected.length > 0) {
    lines.push('', '### 选择理由')
    whySelected.forEach((item) => lines.push(`- ${item}`))
  }
  const rejectedRoutes = Array.isArray(selectedRoute.rejected_routes) ? selectedRoute.rejected_routes : []
  if (rejectedRoutes.length > 0) {
    lines.push('', '### 淘汰理由')
    rejectedRoutes.forEach((item) => {
      if (typeof item === 'string') {
        lines.push(`- ${item}`)
      }
      else {
        lines.push(`- ${item.name || '未命名路线'}：${item.reason || '未提供理由'}`)
      }
    })
  }

  lines.push('', '## 仍需补证据的点')
  if (evidenceGaps.length === 0) {
    lines.push('- 暂无')
  }
  else {
    evidenceGaps.forEach((item) => lines.push(`- ${typeof item === 'string' ? item : item.gap || JSON.stringify(item)}`))
  }

  lines.push('', '## 可直接写进申报书的表述')
  lines.push('', '### 关键科学问题')
  lines.push(proposalParagraphs.scientific_questions || '暂无可用表述')
  lines.push('', '### 工程化难点')
  lines.push(proposalParagraphs.engineering_bottlenecks || '暂无可用表述')
  lines.push('', '### 技术路线')
  lines.push(proposalParagraphs.technical_route || '暂无可用表述')

  if (sectionMapping?.template && Array.isArray(sectionMapping.sections) && sectionMapping.sections.length > 0) {
    const templateLabel = sectionMapping.template === 'engineering' ? '工程类模板' : '基金/研究类模板'
    lines.push('', '## 申报书章节映射')
    lines.push(`- 模板：${templateLabel}`)
    if (sectionMapping.positioning) {
      lines.push(`- 适配说明：${sectionMapping.positioning}`)
    }
    sectionMapping.sections.forEach((section, index) => {
      lines.push('', `### ${index + 1}. ${section.title || `章节 ${index + 1}`}`)
      if (section.purpose) {
        lines.push(`- 用途：${section.purpose}`)
      }
      lines.push('', section.content || '暂无建议内容')
    })
  }

  lines.push('', '## 会审记录摘要')
  const summarizedPairs = Object.values(pairResults)
  if (summarizedPairs.length === 0) {
    lines.push('- 本次运行未进入 pair 会审；当前结果基于降级模式直接汇总。')
  }
  else {
    summarizedPairs.forEach((pair) => {
      lines.push(`- ${pair.score.pair}: conflict=${pair.score.conflict_score}, unresolved=${pair.score.unresolved_degree}, status=${pair.score.decision_status}`)
    })
  }

  if (escalatedPairs.length > 0) {
    lines.push('', `## 加赛 Pair`, escalatedPairs.map(pair => `- ${pair}`).join('\n'))
  }

  if (dossier.materialWarnings.length > 0) {
    lines.push('', '## 材料说明')
    dossier.materialWarnings.forEach((warning) => lines.push(`- ${warning}`))
  }

  lines.push('', '## 输出路径')
  lines.push(`- ${outputPath}`)

  return `${lines.join('\n')}\n`
}
async function fileLooksReadable(filePath) {
  try {
    await access(filePath)
    const info = await stat(filePath)
    return info.isFile()
  }
  catch {
    return false
  }
}

async function readMaterialSnapshot(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8')
    const normalized = normalizeWhitespace(raw)
    return {
      path: filePath,
      status: 'loaded',
      size: normalized.length,
      excerpt: normalized.slice(0, MATERIAL_SNIPPET_CHARS),
      summary: normalized.slice(0, MAX_MATERIAL_CHARS),
    }
  }
  catch (error) {
    return {
      path: filePath,
      status: 'unreadable',
      error: String(error),
      summary: '',
      excerpt: '',
    }
  }
}

export async function buildDossier({ topic, materials, language = DEFAULT_LANGUAGE, focus = DEFAULT_FOCUS, template = '', cwd = process.cwd() }) {
  const normalizedMaterials = []
  const materialWarnings = []

  for (const material of materials || []) {
    const absolutePath = path.resolve(cwd, material)
    if (!await fileLooksReadable(absolutePath)) {
      materialWarnings.push(`材料不存在或不可读：${material}`)
      continue
    }
    normalizedMaterials.push(await readMaterialSnapshot(absolutePath))
  }

  const normalizedBrief = [
    `议题：${topic}`,
    `输出语言：${language}`,
    `聚焦维度：${(focus || DEFAULT_FOCUS).join('、')}`,
    `章节模板：${TEMPLATE_OPTIONS.includes(template) ? template : '通用'}`,
    materialWarnings.length > 0 ? `材料警告：${materialWarnings.join('；')}` : '材料警告：无',
  ].join('\n')

  const materialsSection = normalizedMaterials.length === 0
    ? '未提供可读材料，仅基于议题进行论证。'
    : normalizedMaterials.map((item, index) => [
        `### 材料 ${index + 1}`,
        `- 路径：${item.path}`,
        `- 摘要：`,
        item.summary,
      ].join('\n')).join('\n\n')

  const styleBriefContext = inferStyleBrief({
    template,
    materials: normalizedMaterials,
  })

  return {
    topic,
    language,
    focus: [...(focus || DEFAULT_FOCUS)],
    template,
    researchEnhancementEnabled: template === 'research',
    styleBriefContext,
    normalizedBrief,
    materialWarnings,
    materials: normalizedMaterials,
    dossierText: [
      '## 统一 dossier',
      normalizedBrief,
      '',
      '## 材料摘要',
      materialsSection,
    ].join('\n'),
  }
}

function buildJsonInstruction(schema) {
  return `Return ONLY valid JSON. Do not use markdown fences.\nJSON schema:\n${schema}`
}

export function inferStyleBrief({ template = '', materials = [] }) {
  if (template !== 'research') {
    return {
      detected: false,
      matchedMaterials: [],
      brief: '非 research 模板，不启用 style brief。',
    }
  }

  const matchedMaterials = []
  for (const item of materials) {
    const haystack = `${item.path}\n${item.summary}`.toLowerCase()
    const reasons = STYLE_BRIEF_HINTS
      .filter(({ pattern }) => pattern.test(haystack))
      .map(({ reason }) => reason)

    if (reasons.length > 0) {
      matchedMaterials.push({
        path: item.path,
        reasons,
      })
    }
  }

  if (matchedMaterials.length === 0) {
    return {
      detected: false,
      matchedMaterials: [],
      brief: '未检测到可用于 style learning 的指南/模板/历史样本材料，回退到通用 research 写作风格。',
    }
  }

  const materialSummary = matchedMaterials
    .map(item => `${item.path}（${item.reasons.join('、')}）`)
    .join('；')

  return {
    detected: true,
    matchedMaterials,
    brief: `检测到可用于 style learning 的材料：${materialSummary}。请提炼其叙事风格、结构密度、评审偏好与应避免表达。`,
  }
}

function buildResearchTemplateWritingGuidance() {
  return [
    '研究类模板写作约束（吸收 scientific-writing 思路）：',
    '- `proposal_section_mapping.sections[].content` 必须写成完整段落，不要写成 bullet points、条目罗列或口号式短句。',
    '- 章节顺序固定为：研究目标、关键科学问题、研究内容、创新点、技术路线、可行性与风险。',
    '- 每个章节先说明为什么重要，再说明项目拟解决什么、如何解决、预期形成什么研究价值。',
    '- 行文要求精确、克制、客观，避免夸大、避免空泛形容词、避免“国际领先/颠覆性”等无证据支撑表述。',
    '- 明确区分研究问题、拟采用的方法、预期贡献和当前证据边界，不要把设想写成既成事实。',
    '- 术语保持前后一致；首次出现的重要概念应在语境中自然定义，不要堆砌缩写。',
    '- 创新点必须建立在现有不足、知识空白或方法局限之上，不能只重复技术清单。',
    '- 可行性与风险章节必须诚实写出关键前提、验证路径、阶段性风险与应对措施。',
    '- 最终内容面向申请书正文，可直接粘贴进章节，不要写“本节建议”或元说明。',
  ].join('\n')
}

function buildResearchReviewerRubric() {
  return [
    'grant reviewer 评分维度（每项 1-5 分）：',
    '- 立项必要性',
    '- 关键科学问题清晰度',
    '- 创新性',
    '- 技术路线合理性',
    '- 可行性与风险控制',
    '- 表达与结构质量',
  ].join('\n')
}

function buildGeminiOpeningContext(dossier) {
  return [
    `议题：${dossier.topic}`,
    '已知背景：',
    '- 现场任务调度高度依赖人工经验',
    '- 多工种并行作业导致动态冲突频发',
    '- 现有系统更多停留在静态计划或单点优化',
    '申报关注点：',
    '- 关键科学问题是否足够清晰',
    '- 工程化难点是否真实且可验证',
    '- 技术路线是否兼顾研究价值与交付可行性',
    dossier.materialWarnings?.length > 0 ? `材料警告：${dossier.materialWarnings.join('；')}` : '',
  ].filter(Boolean).join('\n')
}

function buildClaudeOpeningContext(dossier) {
  return [
    `议题：${dossier.topic}`,
    '已知背景：',
    '- 现场任务调度高度依赖人工经验',
    '- 多工种并行作业导致动态冲突频发',
    '- 现有系统更多停留在静态计划或单点优化',
    '申报关注点：',
    '- 关键科学问题是否足够清晰',
    '- 工程化难点是否真实且可验证',
    '- 技术路线是否兼顾研究价值与交付可行性',
    dossier.materialWarnings?.length > 0 ? `材料警告：${dossier.materialWarnings.join('；')}` : '',
  ].filter(Boolean).join('\n')
}

export function buildOpeningTask(actor, dossier) {
  const schema = `{
  "participant": "${actor.id}",
  "stance": "一句话立场",
  "key_scientific_questions": [{"id":"SQ-1","question":"问题","why_it_matters":"原因","priority":"P0|P1|P2"}],
  "engineering_bottlenecks": [{"id":"ENG-1","bottleneck":"难点","root_cause":"根因","breakthrough_path":"突破路径","priority":"P0|P1|P2"}],
  "candidate_routes": [{"id":"R-1","name":"路线名","summary":"概述","advantages":["优点"],"risks":["风险"],"score":0}],
  "preferred_route_id": "R-1",
  "attacks": ["需要重点攻击的薄弱点"],
  "evidence_gaps": ["需要补证据的点"],
  "confidence": 0
}`

  return {
    backend: actor.backend,
    role: actor.role,
    resumeSession: null,
    prompt: [
      actor.id === 'claude'
        ? [
            '你是 Claude 侧的课题论证专家。',
            '只完成一件事：围绕当前议题输出一份 opening JSON。',
            '要求：问题定义自洽、研究边界明确、论证克制，不输出任何解释文字。',
          ].join('\n')
        : actor.id === 'gemini'
          ? [
              '你是 Gemini 侧的课题论证专家。',
              '只完成一件事：围绕当前议题输出一份 opening JSON。',
              '要求：判断鲜明、结构清楚、不要输出任何解释文字。',
            ].join('\n')
        : ROLE_PROMPTS[actor.role].trim(),
      '',
      EXECUTION_GUARDRAILS,
      '',
      actor.id === 'gemini'
        ? buildGeminiOpeningContext(dossier)
        : actor.id === 'claude'
          ? buildClaudeOpeningContext(dossier)
          : dossier.dossierText,
      '',
      '阶段：立论',
      `参与方：${actor.display}`,
      actor.id === 'claude'
        ? '任务：只围绕当前议题输出一份 opening JSON，不要迎合其他模型，不要输出任何解释文字。'
        : '任务：围绕同一议题给出你的独立立场 memo，不要迎合其他模型。',
      '输出重点：关键科学问题、工程化难点、候选技术路线、首选路线、攻击点、证据缺口。',
      buildJsonInstruction(schema),
    ].join('\n'),
  }
}

export function buildRebuttalTask(pair, sourceActor, targetActor, dossier, openings, challenge = null) {
  const schema = `{
  "source": "${sourceActor.id}",
  "target": "${targetActor.id}",
  "strongest_challenges": ["最强挑战点"],
  "concessions": ["承认对方成立的点"],
  "revised_route_position": "你现在对路线的立场",
  "route_shift": "reinforce|adjust|switch",
  "unresolved_points": ["仍未解决的问题"],
  "confidence": 0
}`

  return {
    backend: sourceActor.backend,
    role: sourceActor.role,
    resumeSession: null,
    prompt: [
      ROLE_PROMPTS[sourceActor.role].trim(),
      '',
      EXECUTION_GUARDRAILS,
      '',
      dossier.dossierText,
      '',
      `阶段：交叉质询`,
      `Pair：${pair.id}`,
      `你的原始 memo：${JSON.stringify(openings[sourceActor.id], null, 2)}`,
      `对方 memo：${JSON.stringify(openings[targetActor.id], null, 2)}`,
      challenge ? `主席追问：${challenge}` : '主席追问：无',
      '任务：对对方 memo 做结构化反驳，同时明确承认哪些点成立，以及你是否调整路线判断。',
      buildJsonInstruction(schema),
    ].join('\n'),
  }
}

export function buildPairScoreTask(pair, dossier, openings, rebuttals, addendum = null) {
  const schema = `{
  "pair": "${pair.id}",
  "conflict_score": 0,
  "unresolved_degree": 0,
  "decision_status": "settled|needs_addendum",
  "key_tensions": ["关键冲突点"],
  "chair_questions": ["若需加赛，要追问的问题"],
  "provisional_winner": "${pair.participants[0]}|${pair.participants[1]}|tie"
}`

  return {
    backend: CHAIR.backend,
    role: CHAIR.role,
    resumeSession: null,
    prompt: [
      ROLE_PROMPTS[CHAIR.role].trim(),
      '',
      EXECUTION_GUARDRAILS,
      '',
      dossier.dossierText,
      '',
      `阶段：Pair 会审`,
      `Pair：${pair.id}`,
      `双方 opening memo：${JSON.stringify({
        [pair.participants[0]]: openings[pair.participants[0]],
        [pair.participants[1]]: openings[pair.participants[1]],
      }, null, 2)}`,
      `双方 rebuttal：${JSON.stringify(rebuttals, null, 2)}`,
      addendum ? `加赛 rebuttal：${JSON.stringify(addendum, null, 2)}` : '加赛 rebuttal：无',
      '任务：给出 conflict_score 与 unresolved_degree（0 到 1），并判断该 pair 是否需要加赛。',
      buildJsonInstruction(schema),
    ].join('\n'),
  }
}

export function buildFinalSynthesisTask(dossier, openings, pairResults, escalatedPairs) {
  const templateSchema = `"proposal_section_mapping": {
    "template": "research|engineering",
    "positioning": "该模板下的申报定位说明",
    "sections": [
      {"title":"章节名","purpose":"该章节用途","content":"可直接写入申报书的内容"}
    ]
  },`
  const schema = `{
  "normalized_brief": "归一化 brief",
  "key_scientific_questions": ["关键科学问题"],
  "engineering_bottlenecks": [{"bottleneck":"难点","root_cause":"根因","breakthrough_path":"路径"}],
  "candidate_route_comparison": [{"name":"路线","strengths":["优势"],"risks":["风险"],"fit":"high|medium|low"}],
  "selected_route": {
    "name": "最终路线",
    "summary": "路线概述",
    "why_selected": ["入选理由"],
    "rejected_routes": [{"name":"被淘汰路线","reason":"淘汰理由"}]
  },
  "evidence_gaps": ["需要补证据的点"],
  "proposal_ready_paragraphs": {
    "scientific_questions": "申报书可用段落",
    "engineering_bottlenecks": "申报书可用段落",
    "technical_route": "申报书可用段落"
  },
  ${dossier.template ? templateSchema : ''}
  "chair_summary": "主席总结"
}`

  const templateInstruction = dossier.template === 'research'
    ? [
        '本次需额外输出基金/研究类申请书章节映射，重点覆盖研究目标、关键科学问题、研究内容、创新点、技术路线、可行性与风险。',
        buildResearchTemplateWritingGuidance(),
      ].join('\n')
    : dossier.template === 'engineering'
      ? '本次需额外输出工程/落地类申请书章节映射，重点覆盖建设目标、工程难点、实施方案、阶段任务、预期成果、示范应用与风险控制。'
      : '本次无需额外输出章节模板映射，只保留通用会审报告结构。'

  return {
    backend: CHAIR.backend,
    role: CHAIR.role,
    resumeSession: null,
    prompt: [
      ROLE_PROMPTS[CHAIR.role].trim(),
      '',
      EXECUTION_GUARDRAILS,
      '',
      dossier.dossierText,
      '',
      `阶段：会审汇总`,
      `立论 memo：${JSON.stringify(openings, null, 2)}`,
      `Pair 会审结果：${JSON.stringify(pairResults, null, 2)}`,
      `加赛 pair：${JSON.stringify(escalatedPairs)}`,
      `章节模板：${dossier.template || '通用'}`,
      templateInstruction,
      '任务：输出最终会审结论，不要保留模糊折中。必须给出最优路线、淘汰理由、证据缺口和申报书可用表述。',
      buildJsonInstruction(schema),
    ].join('\n'),
  }
}

export function buildResearchStrategyTask(dossier, openings, pairResults, escalatedPairs) {
  const schema = `{
  "proposal_strategy": {
    "narrative_positioning": "一句话申报定位",
    "core_argument_chain": ["问题/空白/目标/创新/路线链路"],
    "section_order": ["研究目标","关键科学问题","研究内容","创新点","技术路线","可行性与风险"],
    "reviewer_priorities": ["评审最关注的点"],
    "tone_constraints": ["语气约束"],
    "avoid_phrases": ["应避免表达"]
  },
  "style_brief": {
    "source_mode": "generic|learned",
    "preferred_narrative_style": "偏好叙事风格",
    "section_density": "章节密度建议",
    "argument_emphasis": ["论证重心"],
    "avoid_patterns": ["应避免表达"],
    "orientation": "research|task_oriented"
  }
}`

  return {
    backend: CHAIR.backend,
    role: CHAIR.role,
    resumeSession: null,
    prompt: [
      ROLE_PROMPTS[CHAIR.role].trim(),
      '',
      EXECUTION_GUARDRAILS,
      '',
      dossier.dossierText,
      '',
      '阶段：research strategist',
      `立论 memo：${JSON.stringify(openings, null, 2)}`,
      `Pair 会审结果：${JSON.stringify(pairResults, null, 2)}`,
      `加赛 pair：${JSON.stringify(escalatedPairs)}`,
      `style brief 检测：${dossier.styleBriefContext.brief}`,
      buildResearchTemplateWritingGuidance(),
      '任务：为 research 模板生成 proposal strategy 与 style brief，用于后续章节写作，不要直接输出最终正文。',
      buildJsonInstruction(schema),
    ].join('\n'),
  }
}

export function buildResearchComposeTask(dossier, strategyResult, outlineResult) {
  const schema = `{
  "proposal_ready_paragraphs": {
    "scientific_questions": "申报书可用段落",
    "engineering_bottlenecks": "申报书可用段落",
    "technical_route": "申报书可用段落"
  },
  "claim_evidence_alignment": [
    {
      "section": "章节名",
      "claim": "核心判断",
      "supporting_evidence": ["支持证据"],
      "evidence_strength": "strong|medium|weak",
      "open_gaps": ["仍需补证据"],
      "rewrite_guidance": "改写建议"
    }
  ]
}`

  return {
    backend: CHAIR.backend,
    role: CHAIR.role,
    resumeSession: null,
    prompt: [
      ROLE_PROMPTS[CHAIR.role].trim(),
      '',
      EXECUTION_GUARDRAILS,
      '',
      dossier.dossierText,
      '',
      '阶段：research composer',
      `proposal strategy：${JSON.stringify(strategyResult, null, 2)}`,
      `research outline：${JSON.stringify(outlineResult, null, 2)}`,
      buildResearchTemplateWritingGuidance(),
      'claim-evidence alignment 约束：',
      '- 每个关键章节必须产出 claim_evidence_alignment 条目。',
      '- supporting_evidence 优先引用用户材料摘要与 deliberation 共识，证据不足时必须标记 open_gaps。',
      '- 无材料支撑的强判断不要直接写成肯定句。',
      '任务：只根据 strategy brief 与 research outline 扩写最终正文段落，并生成 claim-evidence alignment。不要重复输出路线裁决、章节骨架或证据缺口列表。',
      buildJsonInstruction(schema),
    ].join('\n'),
  }
}

export function buildResearchOutlineTask(dossier, openings, pairResults, escalatedPairs, strategyResult) {
  const schema = `{
  "normalized_brief": "归一化 brief",
  "key_scientific_questions": ["关键科学问题"],
  "engineering_bottlenecks": [{"bottleneck":"难点","root_cause":"根因","breakthrough_path":"路径"}],
  "candidate_route_comparison": [{"name":"路线","strengths":["优势"],"risks":["风险"],"fit":"high|medium|low"}],
  "selected_route": {
    "name": "最终路线",
    "summary": "路线概述",
    "why_selected": ["入选理由"],
    "rejected_routes": [{"name":"被淘汰路线","reason":"淘汰理由"}]
  },
  "evidence_gaps": ["需要补证据的点"],
  "proposal_section_mapping": {
    "template": "research",
    "positioning": "该模板下的申报定位说明",
    "sections": [
      {"title":"章节名","purpose":"该章节用途","content":"章节正文提纲，不写长段落"}
    ]
  }
}`

  return {
    backend: CHAIR.backend,
    role: CHAIR.role,
    resumeSession: null,
    prompt: [
      ROLE_PROMPTS[CHAIR.role].trim(),
      '',
      EXECUTION_GUARDRAILS,
      '',
      dossier.dossierText,
      '',
      '阶段：research outline',
      `立论 memo：${JSON.stringify(openings, null, 2)}`,
      `Pair 会审结果：${JSON.stringify(pairResults, null, 2)}`,
      `加赛 pair：${JSON.stringify(escalatedPairs)}`,
      `proposal strategy：${JSON.stringify(strategyResult, null, 2)}`,
      buildResearchTemplateWritingGuidance(),
      '任务：先输出 research 章节骨架与路线裁决，不要展开完整正文段落，不要输出 claim_evidence_alignment。',
      buildJsonInstruction(schema),
    ].join('\n'),
  }
}

export function buildResearchReviewTask(dossier, strategyResult, composedResult) {
  const schema = `{
  "review_scores": {
    "立项必要性": 0,
    "关键科学问题清晰度": 0,
    "创新性": 0,
    "技术路线合理性": 0,
    "可行性与风险控制": 0,
    "表达与结构质量": 0
  },
  "major_issues": ["主要问题"],
  "must_fix_before_submission": ["提交前必须修复的点"],
  "revision_priorities": ["优先修改顺序"],
  "section_revision_guidance": [
    {"section":"章节名","guidance":"如何改写"}
  ]
}`

  return {
    backend: CHAIR.backend,
    role: CHAIR.role,
    resumeSession: null,
    prompt: [
      ROLE_PROMPTS[CHAIR.role].trim(),
      '',
      EXECUTION_GUARDRAILS,
      '',
      dossier.dossierText,
      '',
      '阶段：research reviewer',
      `proposal strategy：${JSON.stringify(strategyResult, null, 2)}`,
      `research draft：${JSON.stringify(composedResult, null, 2)}`,
      buildResearchReviewerRubric(),
      'review 规则：',
      '- 若 claim_evidence_alignment 中 evidence_strength=weak，则优先要求降级语气或改写为待验证表述。',
      '- 对明显短板章节必须给出 section_revision_guidance。',
      '- 本阶段只输出评分与修订建议，不直接重写最终成稿。',
      buildJsonInstruction(schema),
    ].join('\n'),
  }
}

export function buildResearchFinalSynthesisTask(dossier, openings, pairResults, escalatedPairs, strategyResult, outlineResult, composedResult, reviewResult) {
  const schema = `{
  "normalized_brief": "归一化 brief",
  "key_scientific_questions": ["关键科学问题"],
  "engineering_bottlenecks": [{"bottleneck":"难点","root_cause":"根因","breakthrough_path":"路径"}],
  "candidate_route_comparison": [{"name":"路线","strengths":["优势"],"risks":["风险"],"fit":"high|medium|low"}],
  "selected_route": {
    "name": "最终路线",
    "summary": "路线概述",
    "why_selected": ["入选理由"],
    "rejected_routes": [{"name":"被淘汰路线","reason":"淘汰理由"}]
  },
  "evidence_gaps": ["需要补证据的点"],
  "proposal_ready_paragraphs": {
    "scientific_questions": "申报书可用段落",
    "engineering_bottlenecks": "申报书可用段落",
    "technical_route": "申报书可用段落"
  },
  "proposal_section_mapping": {
    "template": "research",
    "positioning": "该模板下的申报定位说明",
    "sections": [
      {"title":"章节名","purpose":"该章节用途","content":"可直接写入申报书的内容"}
    ]
  },
  "chair_summary": "主席总结"
}`

  return {
    backend: CHAIR.backend,
    role: CHAIR.role,
    resumeSession: null,
    prompt: [
      ROLE_PROMPTS[CHAIR.role].trim(),
      '',
      dossier.dossierText,
      '',
      '阶段：research final synthesis',
      `立论 memo：${JSON.stringify(openings, null, 2)}`,
      `Pair 会审结果：${JSON.stringify(pairResults, null, 2)}`,
      `加赛 pair：${JSON.stringify(escalatedPairs)}`,
      `proposal strategy：${JSON.stringify(strategyResult, null, 2)}`,
      `research outline：${JSON.stringify(outlineResult, null, 2)}`,
      `research composer draft：${JSON.stringify(composedResult, null, 2)}`,
      `research reviewer result：${JSON.stringify(reviewResult, null, 2)}`,
      buildResearchTemplateWritingGuidance(),
      '任务：吸收 strategy / claim-evidence / reviewer 修订意见，输出最终 research 成稿。',
      '不要在最终 JSON 中展开 claim_evidence_alignment 或 reviewer 评分，只输出对用户可见的最终内容。',
      buildJsonInstruction(schema),
    ].join('\n'),
  }
}

function createStatusTracker(outputPath, activeActorIds = ['gemini', 'claude', 'gpt']) {
  const state = {
    phase: '初始化',
    actors: {
      gemini: activeActorIds.includes('gemini') ? 'idle' : 'unavailable',
      claude: activeActorIds.includes('claude') ? 'idle' : 'unavailable',
      gpt: activeActorIds.includes('gpt') ? 'idle' : 'unavailable',
    },
    latestSignals: {
      gemini: activeActorIds.includes('gemini') ? '暂无' : '未安装',
      claude: activeActorIds.includes('claude') ? '暂无' : '未安装',
      gpt: activeActorIds.includes('gpt') ? '暂无' : '必需',
    },
    currentPair: 'none',
    escalatedPairs: [],
    outputPath,
  }

  let lastRenderedAt = 0

  function render(force = false) {
    const now = Date.now()
    if (!force && now - lastRenderedAt < PROGRESS_RENDER_INTERVAL_MS) {
      return
    }
    lastRenderedAt = now
    console.log([
      '',
      '## CCG 课题论证进度',
      `- 当前阶段: ${state.phase}`,
      `- Gemini: ${state.actors.gemini}`,
      `- Claude: ${state.actors.claude}`,
      `- GPT(codex): ${state.actors.gpt}`,
      `- 当前 Pair: ${state.currentPair}`,
      `- 加赛 Pair: ${state.escalatedPairs.length > 0 ? state.escalatedPairs.join(', ') : 'none'}`,
      `- 输出路径: ${state.outputPath}`,
      '- 最新信号:',
      `  - Gemini: ${state.latestSignals.gemini}`,
      `  - Claude: ${state.latestSignals.claude}`,
      `  - GPT(codex): ${state.latestSignals.gpt}`,
      '',
    ].join('\n'))
  }

  return {
    setPhase(phase, force = true) {
      state.phase = phase
      render(force)
    },
    setActorState(actorId, status, force = true) {
      if (state.actors[actorId] !== undefined) {
        state.actors[actorId] = status
      }
      render(force)
    },
    setCurrentPair(pairId, force = true) {
      state.currentPair = pairId
      render(force)
    },
    setLatestSignal(actorId, signal, force = false) {
      if (state.latestSignals[actorId] !== undefined) {
        state.latestSignals[actorId] = signal
      }
      render(force)
    },
    setEscalatedPairs(pairIds, force = true) {
      state.escalatedPairs = [...pairIds]
      render(force)
    },
    setOutputPath(nextPath) {
      state.outputPath = nextPath
      render(true)
    },
  }
}

function humanizeProgressLine(line) {
  const raw = String(line || '').replace(/^\[PROGRESS\]\s*/, '').trim()
  if (!raw) return '暂无'

  if (raw.startsWith('session_started')) {
    return '会话已建立'
  }
  if (raw.startsWith('turn_started')) {
    return '开始生成当前回合内容'
  }
  if (raw.startsWith('session_completed') || raw.startsWith('turn_completed')) {
    return '当前回合已完成'
  }
  if (raw.startsWith('mcp_call')) {
    return '正在调用外部工具'
  }
  if (raw.startsWith('cmd_done')) {
    return '已完成一条命令执行'
  }

  const textMatch = raw.match(/text=(.+)$/)
  if (textMatch) {
    try {
      return JSON.parse(textMatch[1]).slice(0, 140)
    }
    catch {
      return textMatch[1].slice(0, 140)
    }
  }

  return raw.slice(0, 140)
}

function buildTracePrompt(trace, traceMeta, prompt) {
  if (!trace?.enabled) {
    return prompt
  }
  return [
    `ORCHESTRATION_TRACE_ID: ${traceMeta.traceId}`,
    `ORCHESTRATION_PHASE: ${traceMeta.phase || 'unknown'}`,
    `ORCHESTRATION_PROVIDER: ${traceMeta.provider || 'unknown'}`,
    '',
    prompt,
  ].join('\n')
}

function buildClaudeDirectArgs() {
  return [
    '-p',
    '--no-chrome',
    '--disable-slash-commands',
    '--tools',
    '',
    '--output-format',
    'text',
    '-',
  ]
}

function buildGeminiDirectArgs(geminiModel = '') {
  const args = ['--prompt', '']
  if (geminiModel) {
    args.push('--model', geminiModel)
  }
  args.push('--approval-mode', 'plan', '--output-format', 'text')
  return args
}

function shouldUseDirectCodexForChair(traceMeta = {}) {
  return [
    'research-strategist',
    'research-composer',
    'research-reviewer',
    'research-final-synthesis',
    'final-synthesis',
  ].includes(traceMeta.phase)
}

async function runCodexDirectTask({ prompt, workdir, label, trace, traceMeta, expectJson = true }) {
  let attempt = 0
  while (attempt < 2) {
    attempt += 1
    const promptToSend = buildTracePrompt(trace, traceMeta, prompt)
    const lastMessagePath = path.join(workdir, `.codex-last-${Date.now()}-${attempt}.txt`)
    const args = [
      'e',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '-C',
      workdir,
      '--json',
      '--output-last-message',
      lastMessagePath,
      '-',
    ]
    const taskTrace = trace
      ? await trace.writeTask({
          phase: traceMeta.phase || 'chair',
          provider: traceMeta.provider || CHAIR.display,
          label,
          backend: 'codex-direct',
          attempt,
          prompt: promptToSend,
          args,
          workdir,
          sessionId: '',
          stdout: '',
          stderr: '',
          exit_code: null,
          parse_status: 'started',
          output_last_message_path: lastMessagePath,
        })
      : ''

    const child = spawn('codex', args, {
      cwd: workdir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    const stdoutChunks = []
    const stderrChunks = []
    child.stdout.on('data', chunk => stdoutChunks.push(String(chunk)))
    child.stderr.on('data', chunk => stderrChunks.push(String(chunk)))
    child.stdin.write(promptToSend)
    child.stdin.end()

    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 1000).unref?.()
        reject(new Error(`${label} timed out after ${DEFAULT_TASK_TIMEOUT_MS}ms`))
      }, DEFAULT_TASK_TIMEOUT_MS)
      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        resolve(code)
      })
    })

    const stdout = stdoutChunks.join('')
    const stderr = stderrChunks.join('')
    let lastMessage = ''
    try {
      lastMessage = await readFile(lastMessagePath, 'utf-8')
    }
    catch {}

    if (trace) {
      await trace.updateTask(taskTrace, {
        stdout,
        stderr,
        exit_code: exitCode,
        last_message: lastMessage,
      })
    }

    if (exitCode !== 0) {
      if (trace) {
        await trace.updateTask(taskTrace, { parse_status: 'process_error' })
      }
      if (attempt < 2) {
        continue
      }
      throw new Error(`${label} failed with exit code ${exitCode}\n${stderr || stdout}`)
    }

    const message = String(lastMessage || '').trim()
    if (!message) {
      if (trace) {
        await trace.updateTask(taskTrace, { parse_status: 'empty_output' })
      }
      if (attempt < 2) {
        continue
      }
      throw new Error(`${label} completed without last message output`)
    }

    if (expectJson) {
      try {
        extractJsonPayload(message)
      }
      catch (error) {
        if (trace) {
          await trace.updateTask(taskTrace, { parse_status: 'invalid_json' })
        }
        if (attempt < 2) {
          continue
        }
        throw new Error(`${label} returned invalid JSON\n${String(error instanceof Error ? error.message : error)}`)
      }
    }

    if (trace) {
      await trace.updateTask(taskTrace, { parse_status: 'ok' })
      await trace.writeEvent({
        type: 'provider_success',
        phase: traceMeta.phase || 'chair',
        provider: traceMeta.provider || CHAIR.display,
        label,
        attempt,
        task_file: taskTrace,
      })
    }

    return {
      message,
      sessionId: '',
      stdout,
      stderr,
    }
  }

  throw new Error(`${label} exhausted retries`)
}

async function runClaudeDirectTask({ prompt, workdir, label, tracker, actorId, trace, traceMeta, expectJson = true }) {
  let attempt = 0
  while (attempt < 2) {
    attempt += 1
    tracker.setActorState(actorId, attempt === 1 ? 'running' : 'retrying')
    tracker.setLatestSignal(actorId, attempt === 1 ? `已启动 ${label}` : `正在重试 ${label}（第 ${attempt} 次）`, true)

    const args = buildClaudeDirectArgs()
    const promptToSend = buildTracePrompt(trace, traceMeta, prompt)
    const taskTrace = trace
      ? await trace.writeTask({
          phase: traceMeta.phase || 'wrapper',
          provider: traceMeta.provider || actorId || 'claude',
          label,
          backend: 'claude-direct',
          attempt,
          prompt: promptToSend,
          args,
          workdir,
          sessionId: '',
          stdout: '',
          stderr: '',
          exit_code: null,
          parse_status: 'started',
        })
      : ''

    const child = spawn('claude', args, {
      cwd: workdir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    const stdoutChunks = []
    const stderrChunks = []

    child.stdout.on('data', chunk => stdoutChunks.push(String(chunk)))
    child.stderr.on('data', chunk => stderrChunks.push(String(chunk)))

    child.stdin.write(promptToSend)
    child.stdin.end()

    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        tracker.setLatestSignal(actorId, `${label} 超时，正在终止`, true)
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 1000).unref?.()
        reject(new Error(`${label} timed out after ${DEFAULT_TASK_TIMEOUT_MS}ms`))
      }, DEFAULT_TASK_TIMEOUT_MS)
      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        resolve(code)
      })
    })

    const stdout = stdoutChunks.join('')
    const stderr = stderrChunks.join('')
    if (trace) {
      await trace.updateTask(taskTrace, {
        stdout,
        stderr,
        exit_code: exitCode,
      })
    }

    if (exitCode !== 0) {
      if (trace) {
        await trace.updateTask(taskTrace, { parse_status: 'process_error' })
      }
      if (attempt < 2) {
        tracker.setLatestSignal(actorId, `${label} 失败，准备重试：exit ${exitCode}`, true)
        continue
      }
      tracker.setActorState(actorId, 'failed')
      throw new Error(`${label} failed with exit code ${exitCode}\n${stderr || stdout}`)
    }

    const message = String(stdout || '').trim()
    if (!message) {
      if (trace) {
        await trace.updateTask(taskTrace, { parse_status: 'empty_output' })
      }
      if (attempt < 2) {
        tracker.setLatestSignal(actorId, `${label} 未返回正文，准备重试`, true)
        continue
      }
      tracker.setActorState(actorId, 'failed')
      throw new Error(`${label} completed without message output`)
    }

    if (expectJson) {
      try {
        extractJsonPayload(message)
      }
      catch (error) {
        if (trace) {
          await trace.updateTask(taskTrace, { parse_status: 'invalid_json' })
        }
        if (attempt < 2) {
          tracker.setLatestSignal(actorId, `${label} 返回了非法 JSON，准备重试`, true)
          continue
        }
        tracker.setActorState(actorId, 'failed')
        throw new Error(`${label} returned invalid JSON\n${String(error instanceof Error ? error.message : error)}`)
      }
    }

    tracker.setActorState(actorId, 'completed')
    tracker.setLatestSignal(actorId, `${label} 已完成`, true)
    if (trace) {
      await trace.updateTask(taskTrace, { parse_status: 'ok' })
      await trace.writeEvent({
        type: 'provider_success',
        phase: traceMeta.phase || 'wrapper',
        provider: traceMeta.provider || actorId || 'claude',
        label,
        attempt,
        task_file: taskTrace,
      })
    }

    return {
      message,
      sessionId: '',
      stdout,
      stderr,
    }
  }

  throw new Error(`${label} exhausted retries`)
}

async function runGeminiDirectTask({ prompt, workdir, label, tracker, actorId, trace, traceMeta, geminiModel = '', expectJson = true }) {
  let attempt = 0
  while (attempt < 2) {
    attempt += 1
    tracker.setActorState(actorId, attempt === 1 ? 'running' : 'retrying')
    tracker.setLatestSignal(actorId, attempt === 1 ? `已启动 ${label}` : `正在重试 ${label}（第 ${attempt} 次）`, true)

    const promptToSend = buildTracePrompt(trace, traceMeta, prompt)
    const args = buildGeminiDirectArgs(geminiModel)
    const taskTrace = trace
      ? await trace.writeTask({
          phase: traceMeta.phase || 'wrapper',
          provider: traceMeta.provider || actorId || 'gemini',
          label,
          backend: 'gemini-direct',
          attempt,
          prompt: promptToSend,
          args,
          workdir,
          sessionId: '',
          stdout: '',
          stderr: '',
          exit_code: null,
          parse_status: 'started',
        })
      : ''

    const child = spawn('gemini', args, {
      cwd: workdir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    const stdoutChunks = []
    const stderrChunks = []

    child.stdout.on('data', chunk => stdoutChunks.push(String(chunk)))
    child.stderr.on('data', chunk => stderrChunks.push(String(chunk)))
    child.stdin.write(promptToSend)
    child.stdin.end()

    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        tracker.setLatestSignal(actorId, `${label} 超时，正在终止`, true)
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 1000).unref?.()
        reject(new Error(`${label} timed out after ${DEFAULT_TASK_TIMEOUT_MS}ms`))
      }, DEFAULT_TASK_TIMEOUT_MS)
      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        resolve(code)
      })
    })

    const stdout = stdoutChunks.join('')
    const stderr = stderrChunks.join('')
    if (trace) {
      await trace.updateTask(taskTrace, {
        stdout,
        stderr,
        exit_code: exitCode,
      })
    }

    if (exitCode !== 0) {
      if (trace) {
        await trace.updateTask(taskTrace, { parse_status: 'process_error' })
      }
      if (attempt < 2) {
        tracker.setLatestSignal(actorId, `${label} 失败，准备重试：exit ${exitCode}`, true)
        continue
      }
      tracker.setActorState(actorId, 'failed')
      throw new Error(`${label} failed with exit code ${exitCode}\n${stderr || stdout}`)
    }

    const message = String(stdout || '').trim()
    if (!message) {
      if (trace) {
        await trace.updateTask(taskTrace, { parse_status: 'empty_output' })
      }
      if (attempt < 2) {
        tracker.setLatestSignal(actorId, `${label} 未返回正文，准备重试`, true)
        continue
      }
      tracker.setActorState(actorId, 'failed')
      throw new Error(`${label} completed without message output\n${stderr}`)
    }

    if (expectJson) {
      try {
        extractJsonPayload(message)
      }
      catch (error) {
        if (trace) {
          await trace.updateTask(taskTrace, { parse_status: 'invalid_json' })
        }
        if (attempt < 2) {
          tracker.setLatestSignal(actorId, `${label} 返回了非法 JSON，准备重试`, true)
          continue
        }
        tracker.setActorState(actorId, 'failed')
        throw new Error(`${label} returned invalid JSON\n${String(error instanceof Error ? error.message : error)}\n${stderr}`)
      }
    }

    tracker.setActorState(actorId, 'completed')
    tracker.setLatestSignal(actorId, `${label} 已完成`, true)
    if (trace) {
      await trace.updateTask(taskTrace, { parse_status: 'ok' })
      await trace.writeEvent({
        type: 'provider_success',
        phase: traceMeta.phase || 'wrapper',
        provider: traceMeta.provider || actorId || 'gemini',
        label,
        attempt,
        task_file: taskTrace,
      })
    }

    return {
      message,
      sessionId: '',
      stdout,
      stderr,
    }
  }

  throw new Error(`${label} exhausted retries`)
}

async function runWrapperTask({ wrapperPath, backend, prompt, workdir, sessionId = null, label, tracker, actorId, geminiModel, expectJson = true }) {
  const trace = arguments[0].trace
  const traceMeta = arguments[0].traceMeta || {}
  if (backend === 'gemini') {
    return runGeminiDirectTask({
      prompt,
      workdir,
      label,
      tracker,
      actorId,
      trace,
      traceMeta,
      geminiModel,
      expectJson,
    })
  }
  if (backend === 'claude') {
    return runClaudeDirectTask({
      prompt,
      workdir,
      label,
      tracker,
      actorId,
      trace,
      traceMeta,
      expectJson,
    })
  }
  let attempt = 0

  while (attempt < 2) {
    attempt += 1
    tracker.setActorState(actorId, attempt === 1 ? 'running' : 'retrying')
    tracker.setLatestSignal(actorId, attempt === 1 ? `已启动 ${label}` : `正在重试 ${label}（第 ${attempt} 次）`, true)

    const args = ['--progress', '--backend', backend]
    if (backend === 'gemini' && geminiModel) {
      args.push('--gemini-model', geminiModel)
    }
    if (sessionId) {
      args.push('resume', sessionId, '-', workdir)
    }
    else {
      args.push('-', workdir)
    }
    const promptToSend = buildTracePrompt(trace, traceMeta, prompt)
    const taskTrace = trace
      ? await trace.writeTask({
          phase: traceMeta.phase || 'wrapper',
          provider: traceMeta.provider || actorId || backend,
          label,
          backend,
          attempt,
          prompt: promptToSend,
          args,
          workdir,
          sessionId: sessionId || '',
          stdout: '',
          stderr: '',
          exit_code: null,
          parse_status: 'started',
        })
      : ''

    const child = spawn(wrapperPath, args, {
      cwd: workdir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    const stdoutChunks = []
    const stderrChunks = []
    let earlySessionId = ''

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(String(chunk))
    })

    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      stderrChunks.push(text)
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        if (line.includes('Session-ID:')) {
          earlySessionId = line.split('Session-ID:')[1]?.trim() || earlySessionId
        }
        if (line.startsWith('[PROGRESS]')) {
          tracker.setLatestSignal(actorId, humanizeProgressLine(line))
        }
      }
    })

    child.stdin.write(promptToSend)
    child.stdin.end()

    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        tracker.setLatestSignal(actorId, `${label} 超时，正在终止`, true)
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 1000).unref?.()
        reject(new Error(`${label} timed out after ${DEFAULT_TASK_TIMEOUT_MS}ms`))
      }, DEFAULT_TASK_TIMEOUT_MS)

      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        resolve(code)
      })
    })

    const stdout = stdoutChunks.join('')
    const stderr = stderrChunks.join('')

    if (trace) {
      await trace.updateTask(taskTrace, {
        sessionId: earlySessionId || sessionId || '',
        stdout,
        stderr,
        exit_code: exitCode,
      })
    }

    if (exitCode !== 0) {
      if (trace) {
        await trace.updateTask(taskTrace, { parse_status: 'process_error' })
        await trace.writeEvent({
          type: 'provider_failure',
          phase: traceMeta.phase || 'wrapper',
          provider: traceMeta.provider || actorId || backend,
          label,
          attempt,
          reason: 'process_error',
          task_file: taskTrace,
        })
      }
      if (attempt < 2) {
        tracker.setLatestSignal(actorId, `${label} 失败，准备重试：exit ${exitCode}`, true)
        continue
      }
      tracker.setActorState(actorId, 'failed')
      throw new Error(`${label} failed with exit code ${exitCode}\n${stderr || stdout}`)
    }

    const parsed = parseWrapperOutput(stdout)
    if (!parsed.message) {
      if (trace) {
        await trace.updateTask(taskTrace, { parse_status: 'empty_output' })
        await trace.writeEvent({
          type: 'provider_failure',
          phase: traceMeta.phase || 'wrapper',
          provider: traceMeta.provider || actorId || backend,
          label,
          attempt,
          reason: 'empty_output',
          task_file: taskTrace,
        })
      }
      if (attempt < 2) {
        tracker.setLatestSignal(actorId, `${label} 未返回正文，准备重试`, true)
        continue
      }
      tracker.setActorState(actorId, 'failed')
      throw new Error(`${label} completed without message output`)
    }

    if (expectJson) {
      try {
        extractJsonPayload(parsed.message)
      }
      catch (error) {
        if (trace) {
          await trace.updateTask(taskTrace, { parse_status: 'invalid_json' })
          await trace.writeEvent({
            type: 'provider_failure',
            phase: traceMeta.phase || 'wrapper',
            provider: traceMeta.provider || actorId || backend,
            label,
            attempt,
            reason: 'invalid_json',
            task_file: taskTrace,
            error: String(error instanceof Error ? error.message : error),
          })
        }
        if (attempt < 2) {
          tracker.setLatestSignal(actorId, `${label} 返回了非法 JSON，准备重试`, true)
          continue
        }
        tracker.setActorState(actorId, 'failed')
        throw new Error(`${label} returned invalid JSON\n${String(error instanceof Error ? error.message : error)}`)
      }
    }

    tracker.setActorState(actorId, 'completed')
    tracker.setLatestSignal(actorId, `${label} 已完成`, true)
    if (trace) {
      await trace.updateTask(taskTrace, { parse_status: 'ok' })
      await trace.writeEvent({
        type: 'provider_success',
        phase: traceMeta.phase || 'wrapper',
        provider: traceMeta.provider || actorId || backend,
        label,
        attempt,
        task_file: taskTrace,
      })
    }
    return {
      message: parsed.message,
      sessionId: parsed.sessionId || earlySessionId,
      stdout,
      stderr,
    }
  }

  throw new Error(`${label} exhausted retries`)
}

async function runChairTask({ wrapperPath, prompt, workdir, label, geminiModel, expectJson = true }) {
  const trace = arguments[0].trace
  const traceMeta = arguments[0].traceMeta || {}
  if (shouldUseDirectCodexForChair(traceMeta)) {
    return runCodexDirectTask({
      prompt,
      workdir,
      label,
      trace,
      traceMeta,
      expectJson,
    })
  }
  const args = ['--progress', '--backend', CHAIR.backend, '-', workdir]
  if (CHAIR.backend === 'gemini' && geminiModel) {
    args.push('--gemini-model', geminiModel)
  }

  let attempt = 0
  while (attempt < 2) {
    attempt += 1
    const promptToSend = buildTracePrompt(trace, traceMeta, prompt)
    const taskTrace = trace
      ? await trace.writeTask({
          phase: traceMeta.phase || 'chair',
          provider: traceMeta.provider || CHAIR.display,
          label,
          backend: CHAIR.backend,
          attempt,
          prompt: promptToSend,
          args,
          workdir,
          sessionId: '',
          stdout: '',
          stderr: '',
          exit_code: null,
          parse_status: 'started',
        })
      : ''
    const child = spawn(wrapperPath, args, {
      cwd: workdir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    const stdoutChunks = []
    const stderrChunks = []

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(String(chunk))
    })

    child.stderr.on('data', (chunk) => {
      stderrChunks.push(String(chunk))
    })

    child.stdin.write(promptToSend)
    child.stdin.end()

    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 1000).unref?.()
        reject(new Error(`${label} timed out after ${DEFAULT_TASK_TIMEOUT_MS}ms`))
      }, DEFAULT_TASK_TIMEOUT_MS)

      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        resolve(code)
      })
    })

    const stdout = stdoutChunks.join('')
    const stderr = stderrChunks.join('')
    if (trace) {
      await trace.updateTask(taskTrace, {
        stdout,
        stderr,
        exit_code: exitCode,
      })
    }
    if (exitCode !== 0) {
      if (trace) {
        await trace.updateTask(taskTrace, { parse_status: 'process_error' })
        await trace.writeEvent({
          type: 'provider_failure',
          phase: traceMeta.phase || 'chair',
          provider: traceMeta.provider || CHAIR.display,
          label,
          attempt,
          reason: 'process_error',
          task_file: taskTrace,
        })
      }
      if (attempt < 2) {
        continue
      }
      throw new Error(`${label} failed with exit code ${exitCode}\n${stderr || stdout}`)
    }

    const parsed = parseWrapperOutput(stdout)
    if (!parsed.message) {
      if (trace) {
        await trace.updateTask(taskTrace, { parse_status: 'empty_output' })
        await trace.writeEvent({
          type: 'provider_failure',
          phase: traceMeta.phase || 'chair',
          provider: traceMeta.provider || CHAIR.display,
          label,
          attempt,
          reason: 'empty_output',
          task_file: taskTrace,
        })
      }
      if (attempt < 2) {
        continue
      }
      throw new Error(`${label} completed without message output`)
    }

    if (expectJson) {
      try {
        extractJsonPayload(parsed.message)
      }
      catch (error) {
        if (trace) {
          await trace.updateTask(taskTrace, { parse_status: 'invalid_json' })
          await trace.writeEvent({
            type: 'provider_failure',
            phase: traceMeta.phase || 'chair',
            provider: traceMeta.provider || CHAIR.display,
            label,
            attempt,
            reason: 'invalid_json',
            task_file: taskTrace,
            error: String(error instanceof Error ? error.message : error),
          })
        }
        if (attempt < 2) {
          continue
        }
        throw new Error(`${label} returned invalid JSON\n${String(error instanceof Error ? error.message : error)}`)
      }
    }

    if (trace) {
      await trace.updateTask(taskTrace, { parse_status: 'ok' })
      await trace.writeEvent({
        type: 'provider_success',
        phase: traceMeta.phase || 'chair',
        provider: traceMeta.provider || CHAIR.display,
        label,
        attempt,
        task_file: taskTrace,
      })
    }
    return {
      message: parsed.message,
      sessionId: parsed.sessionId,
      stdout,
      stderr,
    }
  }

  throw new Error(`${label} exhausted retries`)
}

async function runSequentially(items, runner) {
  const results = []
  for (const item of items) {
    results.push(await runner(item))
  }
  return results
}

function formatFailureSummary(error, context = {}) {
  const lines = [
    'CCG 课题论证失败',
    `- 阶段: ${context.phase || 'unknown'}`,
  ]
  if (context.provider) {
    lines.push(`- Provider: ${context.provider}`)
  }
  if (context.label) {
    lines.push(`- 子任务: ${context.label}`)
  }
  if (context.pair) {
    lines.push(`- Pair: ${context.pair}`)
  }
  if (context.template) {
    lines.push(`- 模板: ${context.template}`)
  }
  if (context.checkpointDir) {
    lines.push(`- Checkpoint: ${context.checkpointDir}`)
  }
  lines.push(`- 错误: ${String(error instanceof Error ? error.message : error)}`)
  return lines.join('\n')
}

async function runResearchWritingPipeline({
  dossier,
  openings,
  pairResults,
  escalatedPairs,
  checkpointDir,
  wrapperPath,
  executionWorkdir,
  geminiModel,
  trace,
  traceId,
  tracker,
  ensureRunNotTimedOut,
  strategy: existingStrategy = null,
  outline: existingOutline = null,
  composedDraft: existingComposedDraft = null,
  review: existingReview = null,
}) {
  let strategy = existingStrategy
  let outline = existingOutline
  let composedDraft = existingComposedDraft
  let review = existingReview

  if (!strategy) {
    ensureRunNotTimedOut('research-strategist')
    tracker.setPhase('Research strategist')
    const strategyResult = await runChairTask({
      wrapperPath,
      prompt: buildResearchStrategyTask(dossier, openings, pairResults, escalatedPairs).prompt,
      workdir: executionWorkdir,
      label: 'Research strategy',
      geminiModel,
      trace,
      traceMeta: {
        traceId,
        phase: 'research-strategist',
        provider: CHAIR.display,
      },
    })
    strategy = extractJsonPayload(strategyResult.message)
    if (checkpointDir) {
      await writeResearchCheckpoint({
        checkpointDir,
        phase: 'strategy',
        topic: dossier.topic,
        template: dossier.template,
        providerStrategy: PROVIDER_STRATEGY_SUMMARY,
        payload: strategy,
      })
    }
  }

  if (!outline) {
    ensureRunNotTimedOut('research-outline')
    tracker.setPhase('Research outline')
    const outlineResult = await runChairTask({
      wrapperPath,
      prompt: buildResearchOutlineTask(dossier, openings, pairResults, escalatedPairs, strategy).prompt,
      workdir: executionWorkdir,
      label: 'Research outline',
      geminiModel,
      trace,
      traceMeta: {
        traceId,
        phase: 'research-outline',
        provider: CHAIR.display,
      },
    })
    outline = extractJsonPayload(outlineResult.message)
    if (checkpointDir) {
      await writeResearchCheckpoint({
        checkpointDir,
        phase: 'outline',
        topic: dossier.topic,
        template: dossier.template,
        providerStrategy: PROVIDER_STRATEGY_SUMMARY,
        payload: outline,
      })
    }
  }

  if (!composedDraft) {
    ensureRunNotTimedOut('research-composer')
    tracker.setPhase('Research composer')
    const composeResult = await runChairTask({
      wrapperPath,
      prompt: buildResearchComposeTask(dossier, strategy, outline).prompt,
      workdir: executionWorkdir,
      label: 'Research composition',
      geminiModel,
      trace,
      traceMeta: {
        traceId,
        phase: 'research-composer',
        provider: CHAIR.display,
      },
    })
    composedDraft = extractJsonPayload(composeResult.message)
    if (checkpointDir) {
      await writeResearchCheckpoint({
        checkpointDir,
        phase: 'compose',
        topic: dossier.topic,
        template: dossier.template,
        providerStrategy: PROVIDER_STRATEGY_SUMMARY,
        payload: composedDraft,
      })
    }
  }

  if (!review) {
    ensureRunNotTimedOut('research-reviewer')
    tracker.setPhase('Research reviewer')
    const reviewResult = await runChairTask({
      wrapperPath,
      prompt: buildResearchReviewTask(dossier, strategy, composedDraft).prompt,
      workdir: executionWorkdir,
      label: 'Research review',
      geminiModel,
      trace,
      traceMeta: {
        traceId,
        phase: 'research-reviewer',
        provider: CHAIR.display,
      },
    })
    review = extractJsonPayload(reviewResult.message)
    if (checkpointDir) {
      await writeResearchCheckpoint({
        checkpointDir,
        phase: 'review',
        topic: dossier.topic,
        template: dossier.template,
        providerStrategy: PROVIDER_STRATEGY_SUMMARY,
        payload: review,
      })
    }
  }

  ensureRunNotTimedOut('research-final-synthesis')
  tracker.setPhase('Research final synthesis')
  const finalResult = await runChairTask({
    wrapperPath,
    prompt: buildResearchFinalSynthesisTask(dossier, openings, pairResults, escalatedPairs, strategy, outline, composedDraft, review).prompt,
    workdir: executionWorkdir,
    label: 'Research final synthesis',
    geminiModel,
    trace,
    traceMeta: {
      traceId,
      phase: 'research-final-synthesis',
      provider: CHAIR.display,
    },
  })

  const finalSummary = extractJsonPayload(finalResult.message)
  if (checkpointDir) {
    await writeResearchCheckpoint({
      checkpointDir,
      phase: 'final-summary',
      topic: dossier.topic,
      template: dossier.template,
      providerStrategy: PROVIDER_STRATEGY_SUMMARY,
      payload: finalSummary,
    })
  }

  return {
    strategy,
    outline,
    composedDraft,
    review,
    finalSummary,
  }
}

async function runGrantDeliberation(options, executionWorkdir = process.cwd()) {
  const sourceCwd = process.cwd()
  const outputPath = resolveOutputPath(sourceCwd, options.topic, options.outputPath)
  const runtimeContext = inspectRuntimeEnvironment({ cwd: sourceCwd })
  const tracker = createStatusTracker(outputPath, runtimeContext.activeDebaterIds)
  const traceId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${slugifyTopic(options.topic)}`
  const checkpointMode = options.template === 'research'
    ? (options.freshResearch ? 'fresh' : (options.resumeResearch ? 'resume' : 'auto'))
    : 'fresh'
  const researchCheckpoint = options.template === 'research'
    ? await resolveResearchCheckpointSession({
      cwd: sourceCwd,
      topic: options.topic,
      template: 'research',
      runId: traceId,
      mode: checkpointMode,
      providerStrategy: PROVIDER_STRATEGY_SUMMARY,
    })
    : null
  const trace = await createTraceRecorder({
    enabled: options.trace,
    baseDir: path.join(sourceCwd, '.omx', 'trace'),
    traceId,
    runMeta: {
      trace_id: traceId,
      topic: options.topic,
      template: options.template || 'generic',
      source_cwd: sourceCwd,
      execution_workdir: executionWorkdir,
      runtime_mode: runtimeContext.runMode,
      active_providers: runtimeContext.activeDebaterLabels,
      checkpoint_dir: researchCheckpoint?.checkpointDir || '',
      checkpoint_resume_phase: researchCheckpoint?.resumePhase || '',
      started_at: new Date().toISOString(),
    },
  })

  try {
    if (runtimeContext.status === 'blocked') {
      const nextSteps = runtimeContext.installAdvice.map(item => `- ${item.advice}`).join('\n')
      throw new Error([
        `当前环境无法运行 CCG 课题论证（status=${runtimeContext.status}）。`,
        '最低运行门槛：codex + codeagent-wrapper',
        `阻塞项：${runtimeContext.missingRequired.join(', ')}`,
        nextSteps,
        '先运行 `node scripts/doctor.mjs` 查看详情。',
      ].join('\n'))
    }
    const wrapperPath = runtimeContext.commands['codeagent-wrapper'].path
    const runStartedAt = Date.now()
    function ensureRunNotTimedOut(phase) {
      if (Date.now() - runStartedAt > DEFAULT_RUN_TIMEOUT_MS) {
        throw new Error(`Run timed out after ${DEFAULT_RUN_TIMEOUT_MS}ms at phase ${phase}`)
      }
    }

    tracker.setPhase(`环境检查完成（${runtimeContext.runMode}）`)
    if (trace.enabled) {
      await trace.writeEvent({ type: 'phase_enter', phase: '环境检查完成', trace_id: traceId })
    }
    tracker.setPhase('Brief 构建中')
    const dossier = await buildDossier({
      topic: options.topic,
      materials: options.materials,
      language: options.language,
      focus: options.focus,
      template: options.template,
      cwd: sourceCwd,
    })

    const geminiModel = process.env.GEMINI_MODEL?.trim() || ''
    const activeDebaters = runtimeContext.activeDebaterIds.map(id => DEBATERS[id]).filter(Boolean)
    const pairs = buildRoundRobinPairs(runtimeContext.activeDebaterIds)
    const restoredResearchState = researchCheckpoint ? { ...researchCheckpoint.restored } : null

    if (restoredResearchState?.openings) {
      const hasAllOpenings = activeDebaters.every(actor => restoredResearchState.openings[actor.id])
      if (!hasAllOpenings) {
        restoredResearchState.openings = null
        restoredResearchState.pairResults = null
        restoredResearchState.escalatedPairs = []
        restoredResearchState.strategy = null
        restoredResearchState.outline = null
        restoredResearchState.composedDraft = null
        restoredResearchState.review = null
      }
    }
    if (restoredResearchState?.pairResults) {
      const hasAllPairs = pairs.every(pair => restoredResearchState.pairResults[pair.id])
      if (!hasAllPairs) {
        restoredResearchState.pairResults = null
        restoredResearchState.escalatedPairs = []
        restoredResearchState.strategy = null
        restoredResearchState.outline = null
        restoredResearchState.composedDraft = null
        restoredResearchState.review = null
      }
    }
    if (restoredResearchState && !restoredResearchState.pairResults) {
      restoredResearchState.strategy = null
      restoredResearchState.outline = null
      restoredResearchState.composedDraft = null
      restoredResearchState.review = null
    }
    if (restoredResearchState && !restoredResearchState.strategy) {
      restoredResearchState.outline = null
      restoredResearchState.composedDraft = null
      restoredResearchState.review = null
    }
    if (restoredResearchState && !restoredResearchState.outline) {
      restoredResearchState.composedDraft = null
      restoredResearchState.review = null
    }
    if (restoredResearchState && !restoredResearchState.composedDraft) {
      restoredResearchState.review = null
    }

    let openings = restoredResearchState?.openings || {}
    if (dossier.template === 'research' && restoredResearchState?.openings) {
      tracker.setPhase(`Research checkpoint restored：${researchCheckpoint.resumePhase || 'openings'} (${researchCheckpoint.runId})`)
      console.log(`- Research checkpoint resumed from ${researchCheckpoint.resumePhase || 'openings'}: ${researchCheckpoint.checkpointDir}`)
    }
    else {
      tracker.setPhase('立论轮已启动')
      const openingResults = await runSequentially(activeDebaters, actor => runWrapperTask({
      wrapperPath,
      backend: actor.backend,
      prompt: buildOpeningTask(actor, dossier).prompt,
      workdir: executionWorkdir,
      label: `${actor.display} 立论`,
      tracker,
      actorId: actor.id,
      geminiModel,
      trace,
      traceMeta: {
        traceId,
        phase: 'opening',
        provider: actor.display,
      },
      }))

      openings = {}
      activeDebaters.forEach((actor, index) => {
        openings[actor.id] = extractJsonPayload(openingResults[index].message)
      })
      if (dossier.template === 'research' && researchCheckpoint?.checkpointDir) {
        await writeResearchCheckpoint({
          checkpointDir: researchCheckpoint.checkpointDir,
          phase: 'openings',
          topic: dossier.topic,
          template: dossier.template,
          providerStrategy: PROVIDER_STRATEGY_SUMMARY,
          payload: openings,
        })
      }
      tracker.setPhase('立论轮已完成')
    }

    let pairResults = restoredResearchState?.pairResults || {}
    let escalatedPairs = restoredResearchState?.escalatedPairs || []

    if (dossier.template === 'research') {
      if (restoredResearchState?.pairResults) {
        tracker.setPhase(`Research checkpoint restored：${researchCheckpoint.resumePhase} (${researchCheckpoint.runId})`)
        tracker.setEscalatedPairs(escalatedPairs)
      }
      else {
        tracker.setPhase('Research pair triage')
        if (trace.enabled) {
          await trace.writeEvent({ type: 'phase_enter', phase: 'research-pair-triage', trace_id: traceId })
        }
        const triagedPairs = []
        for (const pair of pairs) {
          ensureRunNotTimedOut(`research-triage:${pair.id}`)
          const triageResult = await runChairTask({
            wrapperPath,
            prompt: buildPairScoreTask(pair, dossier, openings, {}).prompt,
            workdir: executionWorkdir,
            label: `Chair triage ${pair.id}`,
            geminiModel,
            trace,
            traceMeta: {
              traceId,
              phase: 'research-pair-triage',
              provider: CHAIR.display,
            },
          })
          const triageScore = extractJsonPayload(triageResult.message)
          pairResults[pair.id] = {
            pair,
            rebuttals: {},
            addendum: null,
            score: triageScore,
          }
          triagedPairs.push({ pair, score: triageScore })
        }

        const focusedPairs = selectResearchFocusPairs(triagedPairs)
        for (const focused of focusedPairs) {
          const pair = focused.pair
          ensureRunNotTimedOut(`research-focus:${pair.id}`)
          tracker.setPhase(`Research focused rebuttal：${pair.id}`)
          tracker.setCurrentPair(pair.id)
          const [leftId, rightId] = pair.participants
          const leftActor = DEBATERS[leftId]
          const rightActor = DEBATERS[rightId]

          const [leftRebuttalResult, rightRebuttalResult] = await runSequentially([
            { actor: leftActor, prompt: buildRebuttalTask(pair, leftActor, rightActor, dossier, openings).prompt, label: `${leftActor.display} 反驳 ${rightActor.display}` },
            { actor: rightActor, prompt: buildRebuttalTask(pair, rightActor, leftActor, dossier, openings).prompt, label: `${rightActor.display} 反驳 ${leftActor.display}` },
          ], async ({ actor, prompt, label }) => {
            try {
              return await runWrapperTask({
                wrapperPath,
                backend: actor.backend,
                prompt,
                workdir: executionWorkdir,
                label,
                tracker,
                actorId: actor.id,
                geminiModel,
                trace,
                traceMeta: {
                  traceId,
                  phase: 'research-focused-rebuttal',
                  provider: actor.display,
                },
              })
            }
            catch (error) {
              throw new Error(formatFailureSummary(error, {
                phase: 'research-focused-rebuttal',
                provider: actor.display,
                label,
                pair: pair.id,
                template: dossier.template || 'generic',
                checkpointDir: researchCheckpoint?.checkpointDir,
              }))
            }
          })

          const rebuttals = {
            [`${leftId}->${rightId}`]: extractJsonPayload(leftRebuttalResult.message),
            [`${rightId}->${leftId}`]: extractJsonPayload(rightRebuttalResult.message),
          }

          const scoreResult = await runChairTask({
            wrapperPath,
            prompt: buildPairScoreTask(pair, dossier, openings, rebuttals).prompt,
            workdir: executionWorkdir,
            label: `Chair focused score ${pair.id}`,
            geminiModel,
            trace,
            traceMeta: {
              traceId,
              phase: 'research-focused-score',
              provider: CHAIR.display,
            },
          })
          const score = extractJsonPayload(scoreResult.message)

          let addendum = null
          const finalScore = score
          if (shouldEscalatePair(score)) {
            escalatedPairs.push(pair.id)
            tracker.setEscalatedPairs(escalatedPairs)
          }

          pairResults[pair.id] = {
            pair,
            rebuttals,
            addendum,
            score: finalScore,
          }
        }

        if (researchCheckpoint?.checkpointDir) {
          await writeResearchCheckpoint({
            checkpointDir: researchCheckpoint.checkpointDir,
            phase: 'pair-results',
            topic: dossier.topic,
            template: dossier.template,
            providerStrategy: PROVIDER_STRATEGY_SUMMARY,
            payload: {
              pairResults,
              escalatedPairs,
            },
          })
        }
      }
    }
    else {
      for (const pair of pairs) {
        ensureRunNotTimedOut(`pair:${pair.id}`)
        tracker.setPhase(`交叉质询：${pair.id}`)
        if (trace.enabled) {
          await trace.writeEvent({ type: 'phase_enter', phase: '交叉质询', pair: pair.id, trace_id: traceId })
        }
        tracker.setCurrentPair(pair.id)
        const [leftId, rightId] = pair.participants
        const leftActor = DEBATERS[leftId]
        const rightActor = DEBATERS[rightId]

        const [leftRebuttalResult, rightRebuttalResult] = await runSequentially([
          { actor: leftActor, prompt: buildRebuttalTask(pair, leftActor, rightActor, dossier, openings).prompt, label: `${leftActor.display} 反驳 ${rightActor.display}` },
          { actor: rightActor, prompt: buildRebuttalTask(pair, rightActor, leftActor, dossier, openings).prompt, label: `${rightActor.display} 反驳 ${leftActor.display}` },
        ], async ({ actor, prompt, label }) => {
          try {
            return await runWrapperTask({
              wrapperPath,
              backend: actor.backend,
              prompt,
              workdir: executionWorkdir,
              label,
              tracker,
              actorId: actor.id,
              geminiModel,
              trace,
              traceMeta: {
                traceId,
                phase: '交叉质询',
                provider: actor.display,
              },
            })
          }
          catch (error) {
            throw new Error(formatFailureSummary(error, {
              phase: '交叉质询',
              provider: actor.display,
              label,
              pair: pair.id,
              template: dossier.template || 'generic',
            }))
          }
        })

        const rebuttals = {
          [`${leftId}->${rightId}`]: extractJsonPayload(leftRebuttalResult.message),
          [`${rightId}->${leftId}`]: extractJsonPayload(rightRebuttalResult.message),
        }

        const scoreResult = await runChairTask({
          wrapperPath,
          prompt: buildPairScoreTask(pair, dossier, openings, rebuttals).prompt,
          workdir: executionWorkdir,
          label: `Chair score ${pair.id}`,
          geminiModel,
          trace,
          traceMeta: {
            traceId,
            phase: 'pair-score',
            provider: CHAIR.display,
          },
        })
        const score = extractJsonPayload(scoreResult.message)

        let addendum = null
        let finalScore = score
        if (shouldEscalatePair(score)) {
          escalatedPairs.push(pair.id)
          tracker.setEscalatedPairs(escalatedPairs)
          tracker.setPhase(`加赛：${pair.id}`)
          if (trace.enabled) {
            await trace.writeEvent({ type: 'phase_enter', phase: '加赛', pair: pair.id, trace_id: traceId })
          }

          const chairQuestions = Array.isArray(score.chair_questions) ? score.chair_questions.join('；') : '请只回应最核心冲突'
          const [leftAddendumResult, rightAddendumResult] = await runSequentially([
            { actor: leftActor, prompt: buildRebuttalTask(pair, leftActor, rightActor, dossier, openings, chairQuestions).prompt, label: `${leftActor.display} 加赛回应 ${rightActor.display}` },
            { actor: rightActor, prompt: buildRebuttalTask(pair, rightActor, leftActor, dossier, openings, chairQuestions).prompt, label: `${rightActor.display} 加赛回应 ${leftActor.display}` },
          ], async ({ actor, prompt, label }) => {
            try {
              return await runWrapperTask({
                wrapperPath,
                backend: actor.backend,
                prompt,
                workdir: executionWorkdir,
                label,
                tracker,
                actorId: actor.id,
                geminiModel,
                trace,
                traceMeta: {
                  traceId,
                  phase: '加赛',
                  provider: actor.display,
                },
              })
            }
            catch (error) {
              throw new Error(formatFailureSummary(error, {
                phase: '加赛',
                provider: actor.display,
                label,
                pair: pair.id,
                template: dossier.template || 'generic',
              }))
            }
          })

          addendum = {
            [`${leftId}->${rightId}`]: extractJsonPayload(leftAddendumResult.message),
            [`${rightId}->${leftId}`]: extractJsonPayload(rightAddendumResult.message),
          }

          const rescoredResult = await runChairTask({
            wrapperPath,
            prompt: buildPairScoreTask(pair, dossier, openings, rebuttals, addendum).prompt,
            workdir: executionWorkdir,
            label: `Chair rescore ${pair.id}`,
            geminiModel,
            trace,
            traceMeta: {
              traceId,
              phase: 'pair-rescore',
              provider: CHAIR.display,
            },
          })
          finalScore = extractJsonPayload(rescoredResult.message)
        }

        pairResults[pair.id] = {
          pair,
          rebuttals,
          addendum,
          score: finalScore,
        }
      }
    }

    tracker.setPhase('会审汇总中')
    if (trace.enabled) {
      await trace.writeEvent({ type: 'phase_enter', phase: '会审汇总中', trace_id: traceId })
    }
    tracker.setCurrentPair('none')

    let finalSummary
    if (dossier.template === 'research') {
      const pipelineResult = await runResearchWritingPipeline({
        dossier,
        openings,
        pairResults,
        escalatedPairs,
        checkpointDir: researchCheckpoint?.checkpointDir || '',
        wrapperPath,
        executionWorkdir,
        geminiModel,
        trace,
        traceId,
        tracker,
        ensureRunNotTimedOut,
        strategy: restoredResearchState?.strategy || null,
        outline: restoredResearchState?.outline || null,
        composedDraft: restoredResearchState?.composedDraft || null,
        review: restoredResearchState?.review || null,
      })
      finalSummary = pipelineResult.finalSummary
    }
    else {
      ensureRunNotTimedOut('final-synthesis')
      const finalResult = await runChairTask({
        wrapperPath,
        prompt: buildFinalSynthesisTask(dossier, openings, pairResults, escalatedPairs).prompt,
        workdir: executionWorkdir,
        label: 'Chair final synthesis',
        geminiModel,
        trace,
        traceMeta: {
          traceId,
          phase: 'final-synthesis',
          provider: CHAIR.display,
        },
      })
      finalSummary = extractJsonPayload(finalResult.message)
    }

    const report = renderMarkdownReport({
      dossier,
      finalSummary,
      pairResults,
      escalatedPairs,
      outputPath,
      runtimeContext,
    })

    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, report, 'utf-8')
    tracker.setOutputPath(outputPath)
    tracker.setPhase('会审汇总完成')
    if (trace.enabled) {
      await trace.writeRunMeta({
        completed_at: new Date().toISOString(),
        output_path: outputPath,
        status: 'success',
      })
      await trace.writeEvent({ type: 'run_success', trace_id: traceId, output_path: outputPath })
    }

    console.log([
      '',
      '## CCG 课题论证完成',
      `- 总报告: ${outputPath}`,
      `- 运行级别: ${runtimeContext.runMode}`,
      `- 实际参与方: ${runtimeContext.activeDebaterLabels.join(', ')}`,
      `- Provider strategy: ${PROVIDER_STRATEGY_SUMMARY.join(' | ')}`,
      ...(researchCheckpoint?.checkpointDir ? [`- Checkpoint: ${researchCheckpoint.checkpointDir}`] : []),
      `- 加赛 Pair: ${escalatedPairs.length > 0 ? escalatedPairs.join(', ') : 'none'}`,
      `- 最优技术路线: ${finalSummary.selected_route?.name || '未明确'}`,
      '',
    ].join('\n'))

    return {
      outputPath,
      dossier,
      openings,
      pairResults,
      finalSummary,
    }
  }
  catch (error) {
    if (trace.enabled) {
      await trace.writeRunMeta({
        completed_at: new Date().toISOString(),
        status: 'failure',
        error: String(error instanceof Error ? error.message : error),
      })
      await trace.writeEvent({
        type: 'run_failure',
        trace_id: traceId,
        error: String(error instanceof Error ? error.message : error),
      })
    }
    const message = String(error instanceof Error ? error.message : error)
    const suffix = [
      trace.enabled ? `Trace: ${trace.traceDir}` : '',
      researchCheckpoint?.checkpointDir ? `Checkpoint: ${researchCheckpoint.checkpointDir}` : '',
    ].filter(Boolean).join('\n')
    throw new Error(suffix ? `${message}\n${suffix}` : message)
  }
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2))
  if (options.help || !options.topic) {
    printUsage()
    process.exit(options.help ? 0 : 1)
  }

  const scratchDir = await mkdtemp(path.join(os.tmpdir(), 'ccg-grant-deliberation-'))
  try {
    await runGrantDeliberation(options, scratchDir)
  }
  catch (error) {
    console.error('\nCCG 课题论证失败')
    console.error(String(error instanceof Error ? error.message : error))
    process.exitCode = 1
  }
  finally {
    await rm(scratchDir, { recursive: true, force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
