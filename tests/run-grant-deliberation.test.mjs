import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildDossier,
  buildFinalSynthesisTask,
  buildPairScoreTask,
  buildRoundRobinPairs,
  extractJsonPayload,
  parseWrapperOutput,
  renderMarkdownReport,
  resolveOutputPath,
  shouldEscalatePair,
  slugifyTopic,
} from '../scripts/run-grant-deliberation.mjs'

const tmpDirs = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await import('node:fs/promises').then(fs => fs.rm(dir, { recursive: true, force: true }))
  }
})

describe('grant deliberation helpers', () => {
  it('slugifies topic into a stable filename component', () => {
    expect(slugifyTopic('面向复杂施工现场的多智能体协同调度系统')).toContain('面向复杂施工现场的多智能体协同调度系统')
    expect(slugifyTopic('Grant Review: Multi-Agent Scheduling / 2026')).toBe('grant-review-multi-agent-scheduling-2026')
  })

  it('builds the fixed round-robin pair set', () => {
    expect(buildRoundRobinPairs()).toEqual([
      { id: 'gemini-vs-claude', participants: ['gemini', 'claude'] },
      { id: 'gemini-vs-gpt', participants: ['gemini', 'gpt'] },
      { id: 'claude-vs-gpt', participants: ['claude', 'gpt'] },
    ])
  })

  it('uses the default report path when none is provided', () => {
    const cwd = '/tmp/demo'
    expect(resolveOutputPath(cwd, 'Grant Review 2026')).toBe('/tmp/demo/reports/ccg-grant-deliberation/grant-review-2026.md')
  })

  it('extracts JSON from fenced output', () => {
    const parsed = extractJsonPayload('```json\n{"ok":true,"value":1}\n```')
    expect(parsed).toEqual({ ok: true, value: 1 })
  })

  it('parses wrapper output and strips SESSION_ID trailer', () => {
    const parsed = parseWrapperOutput('body text\n---\nSESSION_ID: abc-123\n')
    expect(parsed).toEqual({ message: 'body text', sessionId: 'abc-123' })
  })

  it('escalates only pairs over the threshold or explicitly marked', () => {
    expect(shouldEscalatePair({ conflict_score: 0.8, unresolved_degree: 0.2 })).toBe(true)
    expect(shouldEscalatePair({ conflict_score: 0.4, unresolved_degree: 0.81 })).toBe(true)
    expect(shouldEscalatePair({ conflict_score: 0.4, unresolved_degree: 0.2, decision_status: 'needs_addendum' })).toBe(true)
    expect(shouldEscalatePair({ conflict_score: 0.3, unresolved_degree: 0.2, decision_status: 'settled' })).toBe(false)
  })

  it('builds dossier from topic plus multiple material files', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ccg-grant-test-'))
    tmpDirs.push(tmpDir)
    const fileA = path.join(tmpDir, 'a.md')
    const fileB = path.join(tmpDir, 'b.md')
    await writeFile(fileA, '# A\n施工调度研究材料', 'utf-8')
    await writeFile(fileB, '# B\n多智能体协同材料', 'utf-8')

    const dossier = await buildDossier({
      topic: '复杂施工现场协同调度',
      materials: [fileA, fileB],
      cwd: tmpDir,
    })

    expect(dossier.materials).toHaveLength(2)
    expect(dossier.dossierText).toContain('施工调度研究材料')
    expect(dossier.dossierText).toContain('多智能体协同材料')
  })

  it('keeps chair tasks on fresh sessions', () => {
    const pairTask = buildPairScoreTask(
      { id: 'gemini-vs-claude', participants: ['gemini', 'claude'] },
      { dossierText: 'dossier' },
      { gemini: { stance: 'a' }, claude: { stance: 'b' } },
      { 'gemini->claude': { strongest_challenges: [] }, 'claude->gemini': { strongest_challenges: [] } },
    )
    const finalTask = buildFinalSynthesisTask(
      { topic: 't', normalizedBrief: 'b', dossierText: 'dossier' },
      { gemini: { stance: 'a' }, claude: { stance: 'b' }, gpt: { stance: 'c' } },
      {},
      [],
    )

    expect(pairTask.backend).toBe('codex')
    expect(pairTask.resumeSession).toBeNull()
    expect(finalTask.backend).toBe('codex')
    expect(finalTask.resumeSession).toBeNull()
  })

  it('renders a report with all required sections', () => {
    const report = renderMarkdownReport({
      dossier: {
        topic: '复杂施工现场协同调度',
        normalizedBrief: 'brief',
        materialWarnings: [],
      },
      finalSummary: {
        normalized_brief: 'brief',
        key_scientific_questions: ['问题 1'],
        engineering_bottlenecks: [{ bottleneck: '难点 1', root_cause: '根因 1', breakthrough_path: '路径 1' }],
        candidate_route_comparison: [{ name: '路线 A', strengths: ['优势'], risks: ['风险'], fit: 'high' }],
        selected_route: {
          name: '路线 A',
          summary: '路线 A 概述',
          why_selected: ['理由 1'],
          rejected_routes: [{ name: '路线 B', reason: '理由 B' }],
        },
        evidence_gaps: ['证据缺口'],
        proposal_ready_paragraphs: {
          scientific_questions: '科学问题段落',
          engineering_bottlenecks: '工程难点段落',
          technical_route: '技术路线段落',
        },
      },
      pairResults: {
        'gemini-vs-claude': { score: { pair: 'gemini-vs-claude', conflict_score: 0.5, unresolved_degree: 0.4, decision_status: 'settled' } },
      },
      escalatedPairs: [],
      outputPath: '/tmp/report.md',
    })

    expect(report).toContain('## 议题归一化 Brief')
    expect(report).toContain('## 关键科学问题')
    expect(report).toContain('## 工程化卡点/难点')
    expect(report).toContain('## 最优技术路线与淘汰理由')
    expect(report).toContain('## 可直接写进申报书的表述')
  })
})
