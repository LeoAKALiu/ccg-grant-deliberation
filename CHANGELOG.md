# Changelog

All notable changes to this project will be documented in this file.

The format is intentionally lightweight and release-oriented for GitHub Releases.

## Unreleased

## v0.3.1

### Added

- CLI timeout controls: `--task-timeout-ms` and `--run-timeout-ms`, both supporting `infinite`

### Changed

- Rebuttal and addendum failures now degrade a single pair instead of hanging or aborting the entire run
- Research rebuttal / pair-score prompts now use compacted context to reduce provider-side prompt bloat
- Trace/task failure metadata now records timeout config, prompt sizes, and structured failure reasons
- Default report output now writes to `ccg-grant-deliberation-*.md` in the working directory unless `--output` is set
- Run artifacts and trace outputs now write under `ccg-grant-deliberation-runs/` instead of the previous `.omx/` layout

### Notes

- `v0.3.1` focuses on runtime hardening, CI-safe release checks, and operational controls without widening the proposal template surface.

## v0.3.0

### Added

- Research checkpoint / resume under `.omx/checkpoints/` with stage-level persistence for `openings`, `pair-results`, `strategy`, `outline`, `compose`, `review`, and `final-summary`
- New CLI flags `--resume-research` and `--fresh-research`
- Failure and completion summaries now include checkpoint paths for research-mode continuation

### Changed

- `research` mode now reuses the latest resumable intermediate state by default instead of restarting the full live run
- Research writing stages now run in a fill-missing-only mode, skipping strategist / outline / compose / review when valid checkpoint artifacts already exist
- README and skill docs now document local continuation and recovery behavior for research live runs

### Notes

- `v0.3.0` is the next GitHub prerelease and focuses on making research-mode live runs resumable rather than re-running every provider stage from scratch.

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

- `v0.2.1` focused on runtime stability, observability, and research-mode convergence rather than new end-user surface area.

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
