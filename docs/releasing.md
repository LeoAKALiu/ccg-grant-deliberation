# Releasing

This repository uses a tag-driven GitHub prerelease flow.

## Release rules

- Version numbers must match in `package.json` and `.codex-plugin/plugin.json`
- Git tags use the format `vX.Y.Z`
- Release notes come from `CHANGELOG.md`
- `v0.x.y` releases are published as GitHub prereleases

## Release steps

1. Update the version in `package.json`
2. Update the version in `.codex-plugin/plugin.json`
3. Add or revise the matching section in `CHANGELOG.md`
4. Run:

```bash
npm install
npm run check
npm run docs:check
npm run version:check
npm test
```

5. Commit the release prep changes
6. Create the tag:

```bash
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

7. Wait for `.github/workflows/release.yml` to publish the GitHub Release

## Current channel

- `v0.3.0` is the current intended GitHub prerelease
- Stable release policy can be revisited once live template quality and release automation are proven
