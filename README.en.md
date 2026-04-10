# CCG Grant Deliberation

[![CI](https://github.com/LeoAKALiu/ccg-grant-deliberation/actions/workflows/ci.yml/badge.svg)](https://github.com/LeoAKALiu/ccg-grant-deliberation/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./package.json)
[![Status](https://img.shields.io/badge/status-beta-0F766E)](https://github.com/LeoAKALiu/ccg-grant-deliberation)
[![Release Target](https://img.shields.io/badge/release-v0.2.0--prerelease-F59E0B)](./CHANGELOG.md)

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

## Output

Default output path:

```text
reports/ccg-grant-deliberation/<topic-slug>.md
```

Examples:

- [Minimal example brief](./examples/materials/minimal-brief.md)
- [Generic example report](./examples/output/example-report.md)
- [Research template example](./examples/output/example-report-research.md)

## Release

Current release target:

- version: `0.2.0`
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
