# CCG Grant Deliberation

Codex plugin for technology grant / project proposal deliberation.

It organizes three model personas:

- Gemini debater
- Claude debater
- GPT-side Codex debater

And a separate Codex chair persona that scores pairwise conflict, decides whether a pair needs an addendum round, and produces a final report.

## What it does

- Builds a unified dossier from `topic + materials`
- Runs one opening memo per model
- Runs the fixed round-robin pairs:
  - Gemini vs Claude
  - Gemini vs GPT(Codex)
  - Claude vs GPT(Codex)
- Escalates only high-conflict pairs
- Writes one final report for proposal writing

## Run

```bash
node scripts/run-grant-deliberation.mjs --topic "论证某科技项目申请书的关键科学问题、工程化难点和最优技术路线"
```

With materials:

```bash
node scripts/run-grant-deliberation.mjs \
  --topic "论证某科技项目申请书的关键科学问题、工程化难点和最优技术路线" \
  --material /path/to/brief.md \
  --material /path/to/notes.md
```

Default output:

```text
reports/ccg-grant-deliberation/<topic-slug>.md
```

## Install into Codex UI

```bash
node scripts/install-home-plugin.mjs
```

This symlinks the repo into `~/plugins/ccg-grant-deliberation` and updates `~/.agents/plugins/marketplace.json`.

## Development

```bash
npm install
npm test
```
