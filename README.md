# CCG Grant Deliberation

[![CI](https://github.com/LeoAKALiu/ccg-grant-deliberation/actions/workflows/ci.yml/badge.svg)](https://github.com/LeoAKALiu/ccg-grant-deliberation/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./package.json)
[![Status](https://img.shields.io/badge/status-beta-0F766E)](https://github.com/LeoAKALiu/ccg-grant-deliberation)
[![Release Target](https://img.shields.io/badge/release-v0.2.0--prerelease-F59E0B)](./CHANGELOG.md)
[![Templates](https://img.shields.io/badge/templates-research%20%7C%20engineering-2563EB)](#模板)
[![Runtime](https://img.shields.io/badge/runtime-full%20%7C%20partial%20%7C%20minimal-7C3AED)](#运行模式)

中文 | [English](./README.en.md)

`ccg-grant-deliberation` 是一个面向科技项目申请书、基金申报书与课题论证场景的 Codex 插件仓库。项目基于 [ccg-workflow](https://github.com/fengshao1227/ccg-workflow) 的多模型协同思路演进而来，但目标被明确收束到一类任务：围绕同一申报主题，组织多模型开展交叉论证，并输出可直接进入申请书正文的结构化结论。

## 项目概览

适用任务：

- 梳理关键科学问题是否成立、是否值得立项
- 提炼真实工程化难点及验证路径
- 比较候选技术路线并形成取舍结论
- 将会审结论转写为研究类或工程类申请书章节内容

## 核心能力

- 多模型会审  
  组织 Gemini、Claude 与 GPT(Codex) 侧论证者独立立论、交叉质询、定向加赛与主席汇总。

- 申请书导向输出  
  生成关键科学问题、工程化难点、技术路线、证据缺口与可直接写入正文的段落。

- 模板化章节映射  
  支持 `research` 与 `engineering` 两类模板。

- 环境自诊断  
  提供 `setup` / `doctor` 入口，检查依赖与运行模式。

- 降级运行  
  当部分 provider 缺失时，在满足最低门槛的前提下仍可运行。

## 工作流

默认角色：

- Gemini debater
- Claude debater
- GPT(Codex) debater
- Codex chair

标准流程：

1. 根据 `topic + materials` 构建统一 dossier
2. 各论证方独立输出 opening memo
3. 执行两两交叉质询
4. 对高冲突 pair 进行加赛
5. 由主席给出最终路线、淘汰理由、证据缺口和申请书可用表述
6. 如指定模板，则额外输出申报书章节映射

## 系统要求

最低运行门槛：

- Node.js 18+
- `codeagent-wrapper`
- `codex`

完整三方会审推荐环境：

- `codeagent-wrapper`
- `codex`
- `gemini`
- `claude`

## 快速开始

首次建议：

```bash
node scripts/setup.mjs
node scripts/doctor.mjs
```

通用会审报告：

```bash
node scripts/run-grant-deliberation.mjs \
  --topic "论证某科技项目申请书的关键科学问题、工程化难点和最优技术路线" \
  --material examples/materials/minimal-brief.md
```

研究/基金类章节映射：

```bash
node scripts/run-grant-deliberation.mjs \
  --template research \
  --topic "论证某科技项目申请书的关键科学问题、工程化难点和最优技术路线" \
  --material examples/materials/minimal-brief.md
```

工程/落地类章节映射：

```bash
node scripts/run-grant-deliberation.mjs \
  --template engineering \
  --topic "论证某科技项目申请书的关键科学问题、工程化难点和最优技术路线" \
  --material examples/materials/minimal-brief.md
```

帮助：

```bash
node scripts/run-grant-deliberation.mjs --help
```

## 命令行接口

```bash
node scripts/run-grant-deliberation.mjs [options]
```

主要参数：

- `--topic <text>`：申报议题或项目主题
- `--material <path>`：材料路径，可重复传入
- `--materials <a,b,c>`：逗号分隔材料列表
- `--language <lang>`：输出语言，默认 `zh-CN`
- `--focus <a,b,c>`：关注维度
- `--template <name>`：章节模板，支持 `research` 或 `engineering`
- `--output <path>`：自定义输出路径

## 模板

### `research`

面向基金类、研究类申请书，重点覆盖：

- 研究目标
- 关键科学问题
- 研究内容
- 创新点
- 技术路线
- 可行性与风险

该模板已经吸收 `scientific-writing` 风格约束：强调完整段落、问题与知识空白链路、术语一致、克制表达、创新建立在现有不足之上，并显式交代风险与证据边界。

### `engineering`

面向工程类、落地类申请书，重点覆盖：

- 建设目标
- 工程难点
- 实施方案
- 阶段任务
- 预期成果
- 示范应用与风险控制

### 默认行为

若不传 `--template`，系统仅输出通用会审报告，不附加章节映射区块。

## 运行模式

- `full`：`codex + codeagent-wrapper + gemini + claude`
- `partial`：`codex + codeagent-wrapper + (gemini 或 claude)`
- `minimal`：`codex + codeagent-wrapper`
- `blocked`：缺少 `codex` 或 `codeagent-wrapper`

含义如下：

- `full`：完整三方会审
- `partial`：双方会审 + 主席汇总
- `minimal`：Codex 单方论证 + 主席汇总
- `blocked`：无法运行，需先补齐最低依赖

报告会显式写出运行状态、运行级别与实际参与方。

## 输出内容

默认输出路径：

```text
reports/ccg-grant-deliberation/<topic-slug>.md
```

主报告通常包含以下部分：

- 运行环境声明
- 议题归一化 brief
- 关键科学问题
- 工程化卡点或难点
- 候选技术路线对比
- 最优技术路线与淘汰理由
- 证据缺口
- 可直接写入正文的段落
- 申报书章节映射（模板模式）

示例：

- [最小示例材料](./examples/materials/minimal-brief.md)
- [通用示例报告](./examples/output/example-report.md)
- [研究类模板示例报告](./examples/output/example-report-research.md)

## 发布状态

当前仓库状态：

- 当前代码版本：`0.2.0`
- 当前定位：`beta`
- 当前发布方式：Git tag 驱动的 GitHub prerelease
- 当前规则来源：[CHANGELOG.md](./CHANGELOG.md) + [docs/releasing.md](./docs/releasing.md)
- 当前事实：首个正式 GitHub Release 目标为 `v0.2.0` prerelease

发布规则：

- Patch：文档修正、测试补充、非破坏性 prompt/UX 改进
- Minor：新模板、新输出能力、兼容性增强
- Major：工作流语义变化或不兼容的 CLI / schema 变化

当前目标：

- `v0.2.0`：第一版正式 GitHub prerelease，包含 CI、版本同步、changelog 驱动 release notes 与 tag 驱动发布

## 路线图

### 已完成

- [x] 基础多模型 deliberation 主流程
- [x] `setup` / `doctor` 环境检查
- [x] 降级运行模式：`full / partial / minimal`
- [x] `research` / `engineering` 模板入口
- [x] `research` 模板吸收 scientific-writing 写作约束
- [x] GitHub Actions CI 工作流
- [x] tag 驱动的 GitHub prerelease 工作流

### 进行中

- [ ] 对 `research` 与 `engineering` 模板做真实 live 输出质量验证
- [ ] 为 `engineering` 模板补一份正式示例报告
- [ ] 增强针对不同资助类型的章节深度，而不仅是通用模板
- [ ] 细化错误提示，区分“未安装”“未登录”“外部 provider 调用失败”

### 后续候选

- [ ] 增加 `auto` 模板判断模式
- [ ] 增加申报书版本对比与多轮改稿支持
- [ ] 增加更细粒度的机构或项目类别模板
- [ ] 增加真实发布工件与更细的 release 校验

## 项目结构

```text
.
├── .codex-plugin/               # 插件 manifest
├── .github/workflows/           # CI 与 Release workflow
├── assets/                      # 图标与品牌资源
├── docs/                        # 隐私、条款与发布说明
├── examples/                    # 示例材料与示例输出
├── scripts/                     # setup / doctor / 校验 / 主运行脚本
├── skills/                      # Codex skill 入口
└── tests/                       # 单元测试
```

## 开发与验证

安装依赖：

```bash
npm install
```

运行检查与测试：

```bash
npm run doctor
npm run check
npm run docs:check
npm run version:check
npm test
```

## 设计原则

- 只做“科技申请书论证与输出”相关能力
- 优先输出可写入正文的结构化内容，而不是泛泛摘要
- 不把设想写成既成事实
- 不默认持久化完整辩论 transcript
- 不引入与申请书写作无关的通用插件分发功能

## 已知限制

- 当前模板仍是“通用研究类 / 通用工程类”，尚未针对具体资助机构做深度定制
- 尚未处理预算、进度表、附件、伦理表等专门表单
- 真实输出质量仍依赖输入材料质量与外部模型表现
- 不能替代人工审稿、事实核查与合规判断

## 隐私与条款

- [Privacy Policy](./docs/privacy.md)
- [Terms of Use](./docs/terms.md)

## 致谢

本项目的多模型交叉论证思路来源于 [ccg-workflow](https://github.com/fengshao1227/ccg-workflow)。

在此基础上，`ccg-grant-deliberation` 将目标明确收束为科技申请书撰写、会审与改写，不追求通用工作流能力，而专注于“问题是否成立、路线如何取舍、结论如何写进申报书”。
