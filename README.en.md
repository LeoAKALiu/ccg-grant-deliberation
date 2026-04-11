# CCG Grant Deliberation

[![CI](https://github.com/LeoAKALiu/ccg-grant-deliberation/actions/workflows/ci.yml/badge.svg)](https://github.com/LeoAKALiu/ccg-grant-deliberation/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./package.json)
[![Status](https://img.shields.io/badge/status-prerelease-0F766E)](./CHANGELOG.md)

![CCG Grant Deliberation Logo](./assets/grant-deliberation-logo.svg)

[中文](./README.md) | English

## About

`ccg-grant-deliberation` is a Codex plugin repository for technology grant proposals, research funding applications, and project deliberation.

It builds on the multi-model collaboration idea in [ccg-workflow](https://github.com/fengshao1227/ccg-workflow) and narrows it to one goal: run structured multi-model deliberation on a single proposal topic and turn the result into application-ready writing.

The repository is focused on three jobs:

- validate whether the proposed problem is fundable
- compare candidate technical routes and force a decision
- rewrite the deliberation result into research-style or engineering-style proposal sections

## Features

- Multi-model deliberation across Gemini, Claude, GPT(Codex), and a Codex Chair
- Proposal-oriented output with key questions, engineering bottlenecks, route selection, evidence gaps, and ready-to-use paragraphs
- Built-in `research` and `engineering` templates
- Research quality pipeline with strategy brief, claim-evidence alignment, reviewer simulation, and style brief extraction
- Local checkpoint / resume for `research`
- Environment self-check with `setup` and `doctor`
- Degraded runtime modes when optional providers are missing

## Quick Start

First run:

```bash
node scripts/setup.mjs
node scripts/doctor.mjs
```

Generic report:

```bash
node scripts/run-grant-deliberation.mjs \
  --topic "Evaluate the key scientific questions, engineering bottlenecks, and best technical route for a technology grant proposal" \
  --material examples/materials/minimal-brief.md
```

Research template:

```bash
node scripts/run-grant-deliberation.mjs \
  --template research \
  --topic "Evaluate the key scientific questions, engineering bottlenecks, and best technical route for a technology grant proposal" \
  --material examples/materials/minimal-brief.md
```

Engineering template:

```bash
node scripts/run-grant-deliberation.mjs \
  --template engineering \
  --topic "Evaluate the key scientific questions, engineering bottlenecks, and best technical route for a technology grant proposal" \
  --material examples/materials/minimal-brief.md
```

Resume a research run:

```bash
node scripts/run-grant-deliberation.mjs \
  --template research \
  --resume-research \
  --topic "Evaluate the key scientific questions, engineering bottlenecks, and best technical route for a technology grant proposal"
```

## Requirements

Minimum runtime:

- Node.js 18+
- `codeagent-wrapper`
- `codex`

Recommended full runtime:

- `codeagent-wrapper`
- `codex`
- `gemini`
- `claude`

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
- `--resume-research`
- `--fresh-research`
- `--trace`
- `--output <path>`

Help:

```bash
node scripts/run-grant-deliberation.mjs --help
```

## Templates

### `research`

Target output:

- research objectives
- key scientific questions
- research content
- innovation points
- technical route
- feasibility and risks

### `engineering`

Target output:

- construction goals
- engineering bottlenecks
- implementation plan
- phased tasks
- expected outputs
- pilot deployment and risk control

If `--template` is omitted, the tool outputs the generic deliberation report only.

## Runtime

Runtime levels:

- `full`: `codex + codeagent-wrapper + gemini + claude`
- `partial`: `codex + codeagent-wrapper + (gemini or claude)`
- `minimal`: `codex + codeagent-wrapper`
- `blocked`: missing `codex` or `codeagent-wrapper`

The CLI reports active providers and provider strategy summary at the end of each run.

## Output

Default output path:

```text
reports/ccg-grant-deliberation/<topic-slug>.md
```

A typical report includes:

- runtime declaration
- normalized brief
- key scientific questions
- engineering bottlenecks
- candidate route comparison
- selected route and rejected routes
- evidence gaps
- ready-to-use proposal paragraphs
- template-based section mapping

Examples:

- [Minimal example brief](./examples/materials/minimal-brief.md)
- [Generic example report](./examples/output/example-report.md)
- [Research example report](./examples/output/example-report-research.md)

## Checkpoint and Trace

`research` uses local checkpoint / resume by default:

- directory: `.omx/checkpoints/`
- stage files: `openings / pair-results / strategy / outline / compose / review / final-summary`

For orchestration debugging:

```bash
node scripts/run-grant-deliberation.mjs --trace --template research ...
```

Trace directory:

- `.omx/trace/`

These artifacts are local continuation/debug data, not part of the final deliverable.

## Repo Layout

```text
.
├── .codex-plugin/        # plugin manifest
├── .github/workflows/    # CI and release workflows
├── assets/               # logo and icon assets
├── docs/                 # privacy, terms, release docs
├── examples/             # sample inputs and outputs
├── scripts/              # main runner, setup, doctor, checks
├── skills/               # Codex skill entrypoints
└── tests/                # unit tests
```

## Development

```bash
npm install
npm run check
npm run docs:check
npm run version:check
npm test
```

## Release

Current release state:

- version: `v0.3.0`
- channel: GitHub prerelease
- release notes: [CHANGELOG.md](./CHANGELOG.md)
- release process: [docs/releasing.md](./docs/releasing.md)

## Limitations

- Templates are still generic rather than agency-specific
- Budget sheets, schedules, appendices, and ethics forms are out of scope
- Output quality still depends on input material quality and provider stability
- Human review, fact checking, and compliance review remain mandatory

## Privacy and Terms

- [Privacy Policy](./docs/privacy.md)
- [Terms of Use](./docs/terms.md)

## Acknowledgements

This project builds on the multi-model deliberation idea from [ccg-workflow](https://github.com/fengshao1227/ccg-workflow).

The `research` template also adapts ideas from multiple academic writing and research skill repositories, especially around strategy planning, claim-evidence discipline, reviewer simulation, and style learning.
