---
name: grant-deliberation
description: CCG 课题论证。面向科技申请书/项目申请书，组织 Gemini、Claude 与 GPT 侧 Codex 完成多轮立论、交叉质询与会审汇总，输出可直接写入申报书的总报告。
---

# CCG 课题论证

这是 **Codex 专用入口**。优先调用配套脚本，不要手工重演整场辩论。

## 适用场景

- 科技项目申请书
- 基金/课题申报书
- 技术路线论证
- 关键科学问题梳理
- 工程化卡点/难点提炼

## 运行方式

从仓库根目录执行：

```bash
node scripts/doctor.mjs
node scripts/run-grant-deliberation.mjs --template research --topic "<议题>"
```

带材料路径：

```bash
node scripts/run-grant-deliberation.mjs \
  --template engineering \
  --topic "<议题>" \
  --material <材料路径1> \
  --material <材料路径2>
```

## 执行规则

1. 从用户请求中提炼 `topic`
2. 收集用户明确给出的材料路径，按 `--material` 传给脚本
3. 如环境未就绪，先建议运行 `node scripts/setup.mjs` 或 `node scripts/doctor.mjs`
4. 默认不要改动输出路径；让脚本写到 `reports/ccg-grant-deliberation/<slug>.md`
5. 如果脚本成功，向用户汇报：
   - 报告路径
   - 当前运行级别（full / partial / minimal）
   - 当前章节模板（research / engineering / 通用）
   - provider strategy（gemini: direct / claude: direct / codex: wrapper）
   - 最优技术路线
   - 关键科学问题
   - 工程化难点
6. 如果脚本失败，向用户汇报失败原因、缺失依赖和下一步命令，不要伪造结论

如果用户选择 `--template research`：

- 优先生成可直接写入申请书正文的完整段落
- 不要把研究类章节写成 bullet list
- 强化“研究意义 -> 知识空白 -> 研究目标 -> 创新点 -> 技术路线 -> 可行性与风险”的逻辑链
- 避免夸大式表述和无证据支撑的结论
- 默认启用 strategy brief、claim-evidence alignment、grant reviewer simulation 与 style brief extraction
- 默认采用收敛版会审路径：先做 pair triage，只围绕最高价值的 1 组分歧进入 focused rebuttal，然后尽快进入 strategist / composer / reviewer / final synthesis
- 这些中间步骤只用于内部质量控制，最终仍只向用户展示成品章节与正文

如果用户明确要求排查“provider 是否真的收到编排”：

- 优先建议使用 `--trace`
- trace 会落到 `.omx/trace/`
- trace 会保存完整 prompt 与 provider 原始输出，仅适合本地调试

当前 provider strategy：

- `gemini: direct`
- `claude: direct`
- `codex: wrapper`

## 不要做的事

- 不要手工在会话里替代脚本运行完整赛制
- 不要在失败时输出“半成品最终报告”
- 不要默认持久化每个 pair 的完整 transcript
