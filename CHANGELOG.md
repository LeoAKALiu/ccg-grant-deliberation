# Changelog

All notable changes to this project will be documented in this file.

The format is intentionally lightweight and release-oriented for GitHub Releases.

## Unreleased

- No unreleased entries yet.

## v0.2.1

### Added

- Provider strategy documentation and runtime summary for `gemini: direct`, `claude: direct`, `codex: wrapper`
- Local orchestration tracing under `.omx/trace/` with run-level events and task-level prompt/output capture
- Research-only converged deliberation path with pair triage and focused rebuttal
- Research writing pipeline split into strategist, outline, composer, reviewer, and final synthesis stages

### Changed

- Switched Gemini and Claude off `codeagent-wrapper` onto direct local CLI execution
- Lightweight opening prompts for Gemini and Claude to reduce provider-side latency and output instability
- Research composer narrowed to proposal paragraphs plus claim-evidence alignment, reusing outline structure

### Notes

- `v0.2.1` is the next GitHub prerelease and focuses on runtime stability, observability, and research-mode convergence rather than new end-user surface area.

## v0.2.0

### Added

- Formal `setup` / `doctor` environment preparation and diagnosis flow
- Degraded runtime support with `full`, `partial`, and `minimal` execution modes
- `research` and `engineering` proposal template entrypoints
- Research-template writing guidance inspired by scientific-writing conventions
- Bilingual GitHub-facing README, examples, privacy/terms docs, and roadmap content
- GitHub Actions CI workflow with documentation and version consistency checks
- Tag-driven GitHub prerelease workflow using changelog-driven release notes

### Changed

- Synced repository-facing version metadata to `0.2.0`
- Upgraded README badges from display-only status toward real CI-backed badges
