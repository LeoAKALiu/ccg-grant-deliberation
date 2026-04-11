import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildDossier,
  buildFinalSynthesisTask,
  buildOpeningTask,
  buildPairScoreTask,
  buildResearchCheckpointRunDir,
  buildResearchComposeTask,
  buildResearchFinalSynthesisTask,
  buildResearchOutlineTask,
  buildResearchReviewTask,
  buildResearchStrategyTask,
  buildRoundRobinPairs,
  determineResearchResumePhase,
  extractJsonPayload,
  getResearchCheckpointFilePath,
  getResearchWritingPendingStages,
  inferStyleBrief,
  loadResearchCheckpointState,
  parseCliArgs,
  parseWrapperOutput,
  renderMarkdownReport,
  resolveResearchCheckpointSession,
  resolveOutputPath,
  scoreResearchPairPriority,
  selectResearchFocusPairs,
  shouldEscalatePair,
  slugifyTopic,
  writeResearchCheckpoint,
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

  it('builds a reduced pair set when providers are degraded', () => {
    expect(buildRoundRobinPairs(['gemini', 'gpt'])).toEqual([
      { id: 'gemini-vs-gpt', participants: ['gemini', 'gpt'] },
    ])
    expect(buildRoundRobinPairs(['gpt'])).toEqual([])
  })

  it('uses the default report path when none is provided', () => {
    const cwd = '/tmp/demo'
    expect(resolveOutputPath(cwd, 'Grant Review 2026')).toBe('/tmp/demo/reports/ccg-grant-deliberation/grant-review-2026.md')
  })

  it('parses template options and keeps default behavior when absent', () => {
    expect(parseCliArgs(['--topic', 't', '--template', 'research']).template).toBe('research')
    expect(parseCliArgs(['--topic', 't', '--template', 'engineering']).template).toBe('engineering')
    expect(parseCliArgs(['--topic', 't']).template).toBe('')
    expect(parseCliArgs(['--topic', 't', '--template', 'invalid']).template).toBe('')
    expect(parseCliArgs(['--topic', 't', '--trace']).trace).toBe(true)
    expect(parseCliArgs(['--topic', 't', '--resume-research']).resumeResearch).toBe(true)
    expect(parseCliArgs(['--topic', 't', '--fresh-research']).freshResearch).toBe(true)
  })

  it('extracts JSON from fenced output', () => {
    const parsed = extractJsonPayload('```json\n{"ok":true,"value":1}\n```')
    expect(parsed).toEqual({ ok: true, value: 1 })
  })

  it('cleans MCP prelude and trailing commas before parsing JSON', () => {
    const parsed = extractJsonPayload('MCP issues detected. Run /mcp list for status.\n{"ok": true, "items": [1,2,],}')
    expect(parsed).toEqual({ ok: true, items: [1, 2] })
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

  it('scores and selects the highest-priority research focus pair', () => {
    expect(scoreResearchPairPriority({ conflict_score: 0.2, unresolved_degree: 0.8 })).toBe(0.8)
    expect(selectResearchFocusPairs([
      { pair: { id: 'a' }, score: { conflict_score: 0.73, unresolved_degree: 0.2 } },
      { pair: { id: 'b' }, score: { conflict_score: 0.74, unresolved_degree: 0.1 } },
      { pair: { id: 'c' }, score: { conflict_score: 0.2, unresolved_degree: 0.1 } },
    ])).toEqual([
      { pair: { id: 'b' }, score: { conflict_score: 0.74, unresolved_degree: 0.1 } },
    ])
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
      template: 'research',
      cwd: tmpDir,
    })

    expect(dossier.materials).toHaveLength(2)
    expect(dossier.dossierText).toContain('施工调度研究材料')
    expect(dossier.dossierText).toContain('多智能体协同材料')
    expect(dossier.normalizedBrief).toContain('章节模板：research')
    expect(dossier.researchEnhancementEnabled).toBe(true)
    expect(dossier.styleBriefContext.detected).toBe(false)
  })

  it('infers a style brief from guide-like research materials', () => {
    const result = inferStyleBrief({
      template: 'research',
      materials: [
        {
          path: '/tmp/国家自然科学基金申报指南.md',
          summary: '本指南说明申请书写作要求、格式要求和注意事项。',
        },
      ],
    })

    expect(result.detected).toBe(true)
    expect(result.brief).toContain('style learning')
    expect(result.matchedMaterials[0].path).toContain('申报指南')
  })

  it('keeps chair tasks on fresh sessions', () => {
    const pairTask = buildPairScoreTask(
      { id: 'gemini-vs-claude', participants: ['gemini', 'claude'] },
      { dossierText: 'dossier' },
      { gemini: { stance: 'a' }, claude: { stance: 'b' } },
      { 'gemini->claude': { strongest_challenges: [] }, 'claude->gemini': { strongest_challenges: [] } },
    )
    const finalTask = buildFinalSynthesisTask(
      { topic: 't', normalizedBrief: 'b', dossierText: 'dossier', template: 'research' },
      { gemini: { stance: 'a' }, claude: { stance: 'b' }, gpt: { stance: 'c' } },
      {},
      [],
    )

    expect(pairTask.backend).toBe('codex')
    expect(pairTask.resumeSession).toBeNull()
    expect(finalTask.backend).toBe('codex')
    expect(finalTask.resumeSession).toBeNull()
    expect(finalTask.prompt).toContain('章节模板：research')
    expect(finalTask.prompt).toContain('基金/研究类申请书章节映射')
    expect(finalTask.prompt).toContain('必须写成完整段落')
    expect(finalTask.prompt).toContain('章节顺序固定为：研究目标、关键科学问题、研究内容、创新点、技术路线、可行性与风险')
    expect(finalTask.prompt).toContain('避免夸大')
  })

  it('uses lighter dossiers for gemini and claude opening while keeping gpt on the full dossier', () => {
    const dossier = {
      topic: 't',
      language: 'zh-CN',
      focus: ['a', 'b'],
      template: 'research',
      materialWarnings: [],
      materials: [
        {
          path: '/tmp/a.md',
          excerpt: '材料节选',
          summary: '材料节选',
        },
      ],
      dossierText: '## 统一 dossier\n完整版',
    }

    const geminiTask = buildOpeningTask({ id: 'gemini', backend: 'gemini', display: 'Gemini', role: 'gemini-debater' }, dossier)
    const claudeTask = buildOpeningTask({ id: 'claude', backend: 'claude', display: 'Claude', role: 'claude-debater' }, dossier)
    const gptTask = buildOpeningTask({ id: 'gpt', backend: 'codex', display: 'GPT(codex)', role: 'codex-gpt-debater' }, dossier)

    expect(geminiTask.prompt).toContain('已知背景：')
    expect(geminiTask.prompt).toContain('材料 1：材料节选')
    expect(geminiTask.prompt).toContain('只完成一件事：围绕当前议题输出一份 opening JSON。')
    expect(geminiTask.prompt).not.toContain('## 统一 dossier\n完整版')
    expect(geminiTask.prompt).not.toContain('现场任务调度高度依赖人工经验')
    expect(claudeTask.prompt).toContain('已知背景：')
    expect(claudeTask.prompt).toContain('只完成一件事：围绕当前议题输出一份 opening JSON。')
    expect(claudeTask.prompt).not.toContain('补充材料：')
    expect(claudeTask.prompt).not.toContain('## 统一 dossier\n完整版')
    expect(claudeTask.prompt).not.toContain('多工种并行作业导致动态冲突频发')
    expect(gptTask.prompt).toContain('## 统一 dossier\n完整版')
  })

  it('builds research strategist/composer/reviewer prompts with internal quality controls', () => {
    const dossier = {
      topic: 't',
      normalizedBrief: 'b',
      dossierText: 'dossier',
      template: 'research',
      styleBriefContext: {
        detected: true,
        brief: '检测到可用于 style learning 的材料。',
      },
    }
    const openings = { gemini: { stance: 'a' }, claude: { stance: 'b' }, gpt: { stance: 'c' } }
    const pairResults = {}
    const strategyTask = buildResearchStrategyTask(dossier, openings, pairResults, [])
    const outlineTask = buildResearchOutlineTask(dossier, openings, pairResults, [], {
      proposal_strategy: { narrative_positioning: 'x' },
      style_brief: { source_mode: 'learned' },
    })
    const composeTask = buildResearchComposeTask(dossier, {
      proposal_strategy: { narrative_positioning: 'x' },
      style_brief: { source_mode: 'learned' },
    }, {
      proposal_section_mapping: { template: 'research', sections: [] },
      selected_route: { name: '路线 A' },
    })
    const reviewTask = buildResearchReviewTask(dossier, { proposal_strategy: { narrative_positioning: 'x' } }, {
      proposal_section_mapping: { template: 'research', sections: [] },
      claim_evidence_alignment: [],
    })
    const finalTask = buildResearchFinalSynthesisTask(
      dossier,
      openings,
      pairResults,
      [],
      { proposal_strategy: {} },
      { proposal_section_mapping: { template: 'research', sections: [] } },
      { claim_evidence_alignment: [] },
      { review_scores: {} },
    )

    expect(strategyTask.prompt).toContain('阶段：research strategist')
    expect(strategyTask.prompt).toContain('style brief 检测')
    expect(outlineTask.prompt).toContain('阶段：research outline')
    expect(outlineTask.prompt).toContain('先输出 research 章节骨架')
    expect(composeTask.prompt).toContain('阶段：research composer')
    expect(composeTask.prompt).toContain('claim-evidence alignment 约束')
    expect(composeTask.prompt).toContain('supporting_evidence')
    expect(reviewTask.prompt).toContain('阶段：research reviewer')
    expect(reviewTask.prompt).toContain('grant reviewer 评分维度')
    expect(reviewTask.prompt).toContain('立项必要性')
    expect(finalTask.prompt).toContain('阶段：research final synthesis')
    expect(finalTask.prompt).toContain('执行约束：')
    expect(finalTask.prompt).toContain('不要在最终 JSON 中展开 claim_evidence_alignment 或 reviewer 评分')
  })

  it('keeps engineering and generic modes on the existing single-stage final synthesis path', () => {
    const engineeringTask = buildFinalSynthesisTask(
      { topic: 't', normalizedBrief: 'b', dossierText: 'dossier', template: 'engineering' },
      { gpt: { stance: 'c' } },
      {},
      [],
    )
    const genericTask = buildFinalSynthesisTask(
      { topic: 't', normalizedBrief: 'b', dossierText: 'dossier', template: '' },
      { gpt: { stance: 'c' } },
      {},
      [],
    )

    expect(engineeringTask.prompt).toContain('工程/落地类申请书章节映射')
    expect(engineeringTask.prompt).not.toContain('research strategist')
    expect(genericTask.prompt).toContain('本次无需额外输出章节模板映射')
    expect(genericTask.prompt).not.toContain('claim-evidence alignment')
  })

  it('writes research checkpoint artifacts with phase metadata', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ccg-research-checkpoint-'))
    tmpDirs.push(tmpDir)
    const checkpointDir = buildResearchCheckpointRunDir(tmpDir, '复杂施工现场协同调度', 'research', 'run-1')

    await writeResearchCheckpoint({
      checkpointDir,
      phase: 'openings',
      topic: '复杂施工现场协同调度',
      template: 'research',
      providerStrategy: ['gemini: direct', 'claude: direct', 'codex-debater: direct', 'codex-chair: wrapper/direct-hybrid'],
      payload: { gemini: { stance: 'a' } },
    })
    await writeResearchCheckpoint({
      checkpointDir,
      phase: 'pair-results',
      topic: '复杂施工现场协同调度',
      template: 'research',
      providerStrategy: ['gemini: direct', 'claude: direct', 'codex-debater: direct', 'codex-chair: wrapper/direct-hybrid'],
      payload: { pairResults: { x: {} }, escalatedPairs: ['x'] },
    })
    await writeResearchCheckpoint({
      checkpointDir,
      phase: 'strategy',
      topic: '复杂施工现场协同调度',
      template: 'research',
      providerStrategy: ['gemini: direct', 'claude: direct', 'codex-debater: direct', 'codex-chair: wrapper/direct-hybrid'],
      payload: { proposal_strategy: {} },
    })
    await writeResearchCheckpoint({
      checkpointDir,
      phase: 'outline',
      topic: '复杂施工现场协同调度',
      template: 'research',
      providerStrategy: ['gemini: direct', 'claude: direct', 'codex-debater: direct', 'codex-chair: wrapper/direct-hybrid'],
      payload: { proposal_section_mapping: { sections: [] } },
    })
    await writeResearchCheckpoint({
      checkpointDir,
      phase: 'compose',
      topic: '复杂施工现场协同调度',
      template: 'research',
      providerStrategy: ['gemini: direct', 'claude: direct', 'codex-debater: direct', 'codex-chair: wrapper/direct-hybrid'],
      payload: { proposal_ready_paragraphs: {} },
    })
    await writeResearchCheckpoint({
      checkpointDir,
      phase: 'review',
      topic: '复杂施工现场协同调度',
      template: 'research',
      providerStrategy: ['gemini: direct', 'claude: direct', 'codex-debater: direct', 'codex-chair: wrapper/direct-hybrid'],
      payload: { review_scores: {} },
    })

    const openingsRecord = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(getResearchCheckpointFilePath(checkpointDir, 'openings'), 'utf-8')))
    const reviewRecord = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(getResearchCheckpointFilePath(checkpointDir, 'review'), 'utf-8')))

    expect(openingsRecord.phase).toBe('openings')
    expect(openingsRecord.topic).toBe('复杂施工现场协同调度')
    expect(openingsRecord.template).toBe('research')
    expect(openingsRecord.provider_strategy).toContain('codex-debater: direct')
    expect(reviewRecord.phase).toBe('review')
  })

  it('loads the latest resumable research checkpoint and restores intermediate state', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ccg-research-resume-'))
    tmpDirs.push(tmpDir)
    const topic = '复杂施工现场协同调度'
    const olderRun = '2026-04-11T10-00-00-000Z-run'
    const newerRun = '2026-04-11T11-00-00-000Z-run'

    const olderDir = buildResearchCheckpointRunDir(tmpDir, topic, 'research', olderRun)
    const newerDir = buildResearchCheckpointRunDir(tmpDir, topic, 'research', newerRun)

    await writeResearchCheckpoint({
      checkpointDir: olderDir,
      phase: 'openings',
      topic,
      template: 'research',
      payload: { gemini: { stance: 'old' }, claude: { stance: 'old' }, gpt: { stance: 'old' } },
    })

    await writeResearchCheckpoint({
      checkpointDir: newerDir,
      phase: 'openings',
      topic,
      template: 'research',
      payload: { gemini: { stance: 'a' }, claude: { stance: 'b' }, gpt: { stance: 'c' } },
    })
    await writeResearchCheckpoint({
      checkpointDir: newerDir,
      phase: 'pair-results',
      topic,
      template: 'research',
      payload: {
        pairResults: {
          'gemini-vs-claude': {},
          'gemini-vs-gpt': {},
          'claude-vs-gpt': {},
        },
        escalatedPairs: ['claude-vs-gpt'],
      },
    })
    await writeResearchCheckpoint({
      checkpointDir: newerDir,
      phase: 'strategy',
      topic,
      template: 'research',
      payload: { proposal_strategy: { narrative_positioning: 'x' } },
    })
    await writeResearchCheckpoint({
      checkpointDir: newerDir,
      phase: 'outline',
      topic,
      template: 'research',
      payload: { proposal_section_mapping: { sections: [] } },
    })
    await writeResearchCheckpoint({
      checkpointDir: newerDir,
      phase: 'compose',
      topic,
      template: 'research',
      payload: { proposal_ready_paragraphs: { scientific_questions: 'x' } },
    })
    await writeResearchCheckpoint({
      checkpointDir: newerDir,
      phase: 'review',
      topic,
      template: 'research',
      payload: { review_scores: { innovation: 4 } },
    })

    const loaded = await loadResearchCheckpointState({
      cwd: tmpDir,
      topic,
      template: 'research',
      runId: newerRun,
    })
    const resolved = await resolveResearchCheckpointSession({
      cwd: tmpDir,
      topic,
      template: 'research',
      runId: '2026-04-11T12-00-00-000Z-run',
      mode: 'auto',
    })

    expect(loaded.resumePhase).toBe('review')
    expect(loaded.restored.escalatedPairs).toEqual(['claude-vs-gpt'])
    expect(resolved.reused).toBe(true)
    expect(resolved.runId).toBe(newerRun)
    expect(resolved.resumePhase).toBe('review')
  })

  it('skips corrupt checkpoint JSON and falls back to the next valid run', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ccg-research-corrupt-'))
    tmpDirs.push(tmpDir)
    const topic = '复杂施工现场协同调度'
    const corruptRun = buildResearchCheckpointRunDir(tmpDir, topic, 'research', '2026-04-11T12-00-00-000Z-run')
    const validRun = buildResearchCheckpointRunDir(tmpDir, topic, 'research', '2026-04-11T11-00-00-000Z-run')

    await mkdir(corruptRun, { recursive: true })
    await writeFile(getResearchCheckpointFilePath(corruptRun, 'openings'), '{bad json', 'utf-8')
    await writeResearchCheckpoint({
      checkpointDir: validRun,
      phase: 'openings',
      topic,
      template: 'research',
      payload: { gemini: {}, claude: {}, gpt: {} },
    })

    const resolved = await resolveResearchCheckpointSession({
      cwd: tmpDir,
      topic,
      template: 'research',
      runId: '2026-04-11T13-00-00-000Z-run',
      mode: 'auto',
    })

    expect(resolved.runId).toBe('2026-04-11T11-00-00-000Z-run')
    expect(resolved.resumePhase).toBe('openings')
  })

  it('marks explicit resume when no valid checkpoint is found', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ccg-research-resume-miss-'))
    tmpDirs.push(tmpDir)

    const resolved = await resolveResearchCheckpointSession({
      cwd: tmpDir,
      topic: 'missing resume topic',
      template: 'research',
      runId: '2026-04-11T17-00-00-000Z-run',
      mode: 'resume',
    })

    expect(resolved.reused).toBe(false)
    expect(resolved.resumeRequestedButMissing).toBe(true)
  })

  it('scans lazily across recent checkpoint runs instead of hard-stopping at five', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ccg-research-scan-cap-'))
    tmpDirs.push(tmpDir)
    const topic = 'scan cap topic'

    for (let index = 0; index < 8; index += 1) {
      const runId = `2026-04-11T1${index}-00-00-000Z-run`
      const checkpointDir = buildResearchCheckpointRunDir(tmpDir, topic, 'research', runId)
      await mkdir(checkpointDir, { recursive: true })
      await writeFile(getResearchCheckpointFilePath(checkpointDir, 'openings'), '{bad json', 'utf-8')
    }

    const olderValidDir = buildResearchCheckpointRunDir(tmpDir, topic, 'research', '2026-04-11T09-00-00-000Z-run')
    await writeResearchCheckpoint({
      checkpointDir: olderValidDir,
      phase: 'openings',
      topic,
      template: 'research',
      payload: { gemini: {}, claude: {}, gpt: {} },
    })

    const resolved = await resolveResearchCheckpointSession({
      cwd: tmpDir,
      topic,
      template: 'research',
      runId: '2026-04-11T17-00-00-000Z-run',
      mode: 'auto',
    })

    expect(resolved.runId).toBe('2026-04-11T09-00-00-000Z-run')
  })

  it('derives resume priority and pending writing stages from available checkpoints', () => {
    expect(determineResearchResumePhase({
      openings: { payload: {} },
      'pair-results': { payload: {} },
      strategy: { payload: {} },
    })).toBe('strategy')
    expect(determineResearchResumePhase({
      openings: { payload: {} },
      'pair-results': { payload: {} },
      strategy: { payload: {} },
      outline: { payload: {} },
      compose: { payload: {} },
      review: { payload: {} },
    })).toBe('review')

    expect(getResearchWritingPendingStages({
      strategy: { proposal_strategy: {} },
    })).toEqual(['outline', 'compose', 'review'])
    expect(getResearchWritingPendingStages({
      strategy: { proposal_strategy: {} },
      outline: { proposal_section_mapping: {} },
      composedDraft: { proposal_ready_paragraphs: {} },
    })).toEqual(['review'])
    expect(getResearchWritingPendingStages({
      strategy: {},
      outline: {},
      composedDraft: {},
      review: {},
    })).toEqual([])
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
        proposal_section_mapping: {
          template: 'research',
          positioning: '适合基金/研究类申请书组织方式',
          sections: [
            {
              title: '研究目标',
              purpose: '定义项目拟解决的核心目标',
              content: '围绕施工现场多智能体协同调度建立研究目标。',
            },
          ],
        },
      },
      pairResults: {
        'gemini-vs-claude': { score: { pair: 'gemini-vs-claude', conflict_score: 0.5, unresolved_degree: 0.4, decision_status: 'settled' } },
      },
      escalatedPairs: [],
      outputPath: '/tmp/report.md',
      runtimeContext: {
        status: 'degraded',
        runMode: 'partial',
        activeDebaterLabels: ['Gemini', 'GPT(codex)'],
        missingOptional: ['claude'],
        commands: {
          'codeagent-wrapper': { available: true },
          codex: { available: true },
          gemini: { available: true },
        },
      },
    })

    expect(report).toContain('## 运行环境声明')
    expect(report).toContain('运行级别：partial')
    expect(report).toContain('## 议题归一化 Brief')
    expect(report).toContain('## 关键科学问题')
    expect(report).toContain('## 工程化卡点/难点')
    expect(report).toContain('## 最优技术路线与淘汰理由')
    expect(report).toContain('## 可直接写进申报书的表述')
    expect(report).toContain('## 申报书章节映射')
    expect(report).toContain('模板：基金/研究类模板')
    expect(report).toContain('### 1. 研究目标')
    expect(report).toContain('用途：定义项目拟解决的核心目标')
  })

  it('keeps report in generic mode when no template mapping is provided', () => {
    const report = renderMarkdownReport({
      dossier: {
        topic: '复杂施工现场协同调度',
        normalizedBrief: 'brief',
        materialWarnings: [],
      },
      finalSummary: {
        normalized_brief: 'brief',
        key_scientific_questions: [],
        engineering_bottlenecks: [],
        candidate_route_comparison: [],
        selected_route: {},
        evidence_gaps: [],
        proposal_ready_paragraphs: {},
      },
      pairResults: {},
      escalatedPairs: [],
      outputPath: '/tmp/report.md',
      runtimeContext: {
        status: 'ready',
        runMode: 'full',
        activeDebaterLabels: ['Gemini', 'Claude', 'GPT(codex)'],
        missingOptional: [],
        commands: {},
      },
    })

    expect(report).not.toContain('## 申报书章节映射')
  })
})
