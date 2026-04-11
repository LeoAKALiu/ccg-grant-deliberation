# CCG Grant Deliberation

[![CI](https://github.com/LeoAKALiu/ccg-grant-deliberation/actions/workflows/ci.yml/badge.svg)](https://github.com/LeoAKALiu/ccg-grant-deliberation/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./package.json)
[![Status](https://img.shields.io/badge/status-beta-0F766E)](https://github.com/LeoAKALiu/ccg-grant-deliberation)
[![Release Target](https://img.shields.io/badge/release-v0.3.0--prerelease-F59E0B)](./CHANGELOG.md)

[中文](./README.md) | English

`ccg-grant-deliberation` is a Codex plugin repository for technology grant proposals, research funding applications, and project deliberation workflows. It builds on the multi-model collaboration idea in [ccg-workflow](https://github.com/fengshao1227/ccg-workflow), but narrows the scope to a single goal: run structured multi-model deliberation around one proposal topic and convert the result into application-ready writing.

## Overview

Primary use cases:

- Validate whether key scientific questions are fundable
- Surface real engineering bottlenecks and validation paths
- Compare candidate technical routes and force a clear decision
- Rewrite deliberation results into research-style or engineering-style proposal sections

## Features

- Multi-model deliberation across Gemini, Claude, GPT(Codex), and a Codex chair
- Proposal-oriented output with key questions, bottlenecks, route comparisons, evidence gaps, and ready-to-use paragraphs
- Template-based section mapping for `research` and `engineering`
- A research-only quality pipeline with strategy brief, claim-evidence alignment, reviewer simulation, and style brief extraction
- A converged research path that triages all pairs, focuses on the single highest-value disagreement, and then moves quickly into strategist / composer / reviewer / final synthesis
- `setup` / `doctor` diagnostics for environment readiness
- Degraded runtime support when optional providers are unavailable

## Requirements

Minimum runtime:

- Node.js 18+
- `codeagent-wrapper`
- `codex`

Recommended full environment:

- `codeagent-wrapper`
- `codex`
- `gemini`
- `claude`

## Provider Strategy

The current provider strategy is:

- `gemini: direct`
- `claude: direct`
- `codex-debater: direct`
- `codex-chair: wrapper/direct-hybrid`

Why:

- `Gemini` and `Claude` now use direct local CLI execution to reduce localhost/Web UI side effects introduced by wrapper-based execution and to keep outputs closer to plain text / JSON behavior.
- `Codex` still uses the wrapper path because the current research pipeline still depends on that execution path for strategist / composer / reviewer / final synthesis stages.

Environment variables that still matter:

- `CCG_TASK_TIMEOUT_MS`
- `CCG_RUN_TIMEOUT_MS`
- `CCG_TRACE`
- `GEMINI_MODEL`

Notes:

- `codeagent-wrapper` is still part of the minimum runtime because chair stages still depend on it in part of the pipeline.
- `Gemini` / `Claude` and the `GPT(codex)` debater no longer go through the wrapper by default.

## Quick Start

```bash
node scripts/setup.mjs
node scripts/doctor.mjs
```

Generic deliberation report:

```bash
node scripts/run-grant-deliberation.mjs \
  --topic "Evaluate the key scientific questions, engineering bottlenecks, and best technical route for a technology grant proposal" \
  --material examples/materials/minimal-brief.md
```

Research-style section mapping:

```bash
node scripts/run-grant-deliberation.mjs \
  --template research \
  --topic "Evaluate the key scientific questions, engineering bottlenecks, and best technical route for a technology grant proposal" \
  --material examples/materials/minimal-brief.md
```

Resume a research run:

```bash
node scripts/run-grant-deliberation.mjs \
  --template research \
  --resume-research \
  --topic "Evaluate the key scientific questions, engineering bottlenecks, and best technical route for a technology grant proposal" \
  --material examples/materials/minimal-brief.md
```

Engineering-style section mapping:

```bash
node scripts/run-grant-deliberation.mjs \
  --template engineering \
  --topic "Evaluate the key scientific questions, engineering bottlenecks, and best technical route for a technology grant proposal" \
  --material examples/materials/minimal-brief.md
```

## CLI

```bash
node scripts/run-grant-deliberation.mjs [options]
```

Main flags:

- `--topic <text>`
- `--material <path>`
- `--materials <a,b,c>`
- `--language <lang>`
- `--focus <a,b,c>`
- `--template <name>`: `research` or `engineering`
- `--resume-research`: explicitly resume from the latest reusable research checkpoint
- `--fresh-research`: ignore existing research checkpoints and rerun from scratch
- `--trace`: write full local orchestration traces to `.omx/trace/`
- `--output <path>`

## Templates

### `research`

Targets research-style proposals, with emphasis on:

- research objectives
- key scientific questions
- research content
- innovation points
- technical route
- feasibility and risks

This template incorporates scientific-writing-style constraints: full paragraphs, problem-gap-goal logic, consistent terminology, restrained claims, innovation grounded in real gaps, and explicit feasibility/risk language.

In addition, the `research` template now enables four internal quality controls by default:

- strategy brief
- claim-evidence alignment
- grant reviewer simulation
- style brief extraction

These capabilities are distilled and localized from multiple external academic writing and research skill repositories to better fit technology grant proposal writing rather than paper-writing workflows.

To improve the odds of producing a full deliverable, the `research` mode no longer tries to fully exhaust every rebuttal/addendum branch by default. Instead, it triages all pairs, keeps the single highest-value disagreement for focused rebuttal, and then moves into the writing stages.

In addition, `research` now enables checkpoint / resume by default:

- checkpoint directory: `.omx/checkpoints/`
- stage files: `openings / pair-results / strategy / outline / compose / review / final-summary`
- default behavior: reuse the latest resumable research intermediate state when available
- force a clean rerun: `--fresh-research`

### `engineering`

Targets engineering and delivery-oriented proposals, with emphasis on:

- construction goals
- engineering bottlenecks
- implementation plan
- phased tasks
- expected outputs
- pilot deployment and risk control

### Default behavior

If `--template` is omitted, the tool outputs the generic deliberation report only.

## Runtime Modes

- `full`: `codex + codeagent-wrapper + gemini + claude`
- `partial`: `codex + codeagent-wrapper + (gemini or claude)`
- `minimal`: `codex + codeagent-wrapper`
- `blocked`: missing `codex` or `codeagent-wrapper`

The CLI should also print a provider strategy summary at the end of a run or on failure:

- `gemini: direct`
- `claude: direct`
- `codex-debater: direct`
- `codex-chair: wrapper/direct-hybrid`

## Output

Default output path:

```text
reports/ccg-grant-deliberation/<topic-slug>.md
```

Examples:

- [Minimal example brief](./examples/materials/minimal-brief.md)
- [Generic example report](./examples/output/example-report.md)
- [Research template example](./examples/output/example-report-research.md)

## Orchestration Tracing

To verify whether each provider actually receives the intended orchestration prompt, run with:

```bash
node scripts/run-grant-deliberation.mjs --trace --template research ...
```

Notes:

- tracing is off by default
- traces are written to `.omx/trace/`
- traces include prompts, raw stdout/stderr, phase events, and failure reasons
- this is intended for local debugging rather than normal daily usage

## Checkpoint / Resume

`research` mode now uses local checkpoint / resume by default to avoid restarting a full live run every time a provider becomes unstable.

- automatic resume: reuse the latest resumable `research` checkpoint
- explicit resume: `--resume-research`
- force a fresh run: `--fresh-research`
- local directory: `.omx/checkpoints/`

These checkpoints are local continuation/debug artifacts, not part of the final user-facing report.

## Release

Current release target:

- version: `0.3.0`
- channel: GitHub prerelease
- source of truth: [CHANGELOG.md](./CHANGELOG.md) and [docs/releasing.md](./docs/releasing.md)

## Roadmap

Done:

- [x] Base deliberation workflow
- [x] `setup` / `doctor`
- [x] degraded runtime support
- [x] `research` / `engineering` templates
- [x] GitHub Actions CI
- [x] tag-driven GitHub prerelease workflow
- [x] research-only strategy / claim-evidence / reviewer / style-brief quality pipeline

Next:

- [ ] live output quality validation for both templates
- [ ] formal engineering template example report
- [ ] deeper template adaptation by funding/program type
- [ ] clearer separation of install/login/provider failure states

## Development

```bash
npm install
npm run doctor
npm run check
npm run docs:check
npm run version:check
npm test
```

## Limitations

- Templates are still generic rather than agency-specific
- Budget sheets, schedules, appendices, and ethics forms are out of scope
- Output quality still depends on source material quality and provider behavior
- Human review remains mandatory

## Privacy and Terms

- [Privacy Policy](./docs/privacy.md)
- [Terms of Use](./docs/terms.md)

## Acknowledgements

This project builds on the multi-model deliberation idea from [ccg-workflow](https://github.com/fengshao1227/ccg-workflow), but narrows the scope to proposal writing, review, and rewriting for technology grant applications.

The `research` template also absorbs and adapts ideas from multiple external academic writing and research skill repositories, especially around strategy planning, claim-evidence discipline, reviewer simulation, and style learning.
