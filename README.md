# CCG Grant Deliberation

`ccg-grant-deliberation` 是一个基于 [ccg-workflow](https://github.com/fengshao1227/ccg-workflow) 改进的科技申请书专用仓库，面向基金/课题/项目申请书撰写与改进场景。

它保留多模型交叉论证的核心机制，但把输出目标收束到科技申请书真正需要的几个维度：

- 关键科学问题是否成立
- 工程化难点是否真实且可验证
- 候选技术路线如何取舍
- 哪些表述可以直接写入申报书

## 适用场景

- 科技项目申请书
- 基金/课题申报书
- 技术路线论证
- 关键科学问题梳理
- 工程化瓶颈与实施风险分析

## 核心流程

仓库默认组织 3 个立场方和 1 个主席方：

- Gemini 侧论证者
- Claude 侧论证者
- GPT(Codex) 侧论证者
- Codex 主席

执行流程固定为：

1. 根据 `topic + materials` 构建统一 dossier
2. 三个模型分别产出 opening memo
3. 执行固定 pair 交叉质询
   - Gemini vs Claude
   - Gemini vs GPT(Codex)
   - Claude vs GPT(Codex)
4. 仅对高冲突 pair 加赛
5. 由主席输出最终会审结论与申报书可用表述

## 输入与输出

输入：

- 一个申请书议题 `--topic`
- 零个或多个材料文件 `--material`

输出：

- 一份 Markdown 总报告
- 默认路径：`reports/ccg-grant-deliberation/<topic-slug>.md`

报告内容聚焦：

- 议题归一化 brief
- 关键科学问题
- 工程化卡点/难点
- 候选技术路线对比
- 最优技术路线与淘汰理由
- 证据缺口
- 可直接写进申报书的表述

## 使用方式

首次使用建议先跑环境检查：

```bash
node scripts/doctor.mjs
```

如需自动安装项目依赖并生成环境摘要：

```bash
node scripts/setup.mjs
```

3 分钟快速开始：

```bash
node scripts/setup.mjs
node scripts/doctor.mjs
node scripts/run-grant-deliberation.mjs \
  --topic "论证某科技项目申请书的关键科学问题、工程化难点和最优技术路线" \
  --material examples/materials/minimal-brief.md
```

只给议题：

```bash
node scripts/run-grant-deliberation.mjs \
  --topic "论证某科技项目申请书的关键科学问题、工程化难点和最优技术路线"
```

带材料一起运行：

```bash
node scripts/run-grant-deliberation.mjs \
  --topic "论证某科技项目申请书的关键科学问题、工程化难点和最优技术路线" \
  --material /path/to/brief.md \
  --material /path/to/notes.md
```

查看帮助：

```bash
node scripts/run-grant-deliberation.mjs --help
```

## 降级运行规则

本插件现在支持按环境自动降级：

- `full`: `codex + codeagent-wrapper + gemini + claude`
- `partial`: `codex + codeagent-wrapper + (gemini 或 claude)`
- `minimal`: `codex + codeagent-wrapper`
- `blocked`: 缺少 `codex` 或 `codeagent-wrapper`

缺少 `gemini` 或 `claude` 时不会直接失败，但报告会显式写明当前运行级别和实际参与方。

## 示例输入与输出

最小示例材料：

- [examples/materials/minimal-brief.md](/Users/leo/Projects/ccg-grant-deliberation/examples/materials/minimal-brief.md)

示例报告：

- [examples/output/example-report.md](/Users/leo/Projects/ccg-grant-deliberation/examples/output/example-report.md)

## 开发与测试

```bash
npm install
npm run doctor
npm run check
npm test
```

## 仓库定位

这个仓库现在只保留“科技申请书论证与输出”相关能力。

已主动清理掉与该目标无关的通用模板残留，例如：

- 本地 home plugin 安装脚本
- 面向通用插件分发的 README 说明

保留内容包括：

- Codex 插件 manifest 与 hooks
- grant deliberation 主运行脚本
- `setup` / `doctor` 安装与自诊断入口
- 相关技能入口与测试
- 品牌资源

## 来源与致谢

本仓库的多模型交叉论证思路来源于 [ccg-workflow](https://github.com/fengshao1227/ccg-workflow)。

在此基础上，本仓库将目标明确收束为科技申请书撰写与改进，不再追求通用工作流能力。
