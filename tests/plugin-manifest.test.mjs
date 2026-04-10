import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const pluginRoot = path.resolve(import.meta.dirname, '..')
const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json')

describe('ccg-grant-deliberation plugin manifest', () => {
  it('has a valid plugin manifest shape', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
    expect(manifest.name).toBe('ccg-grant-deliberation')
    expect(manifest.skills).toBe('./skills/')
    expect(manifest.hooks).toBe('./hooks.json')
    expect(manifest.interface.displayName).toBe('CCG 课题论证')
    expect(manifest.interface.defaultPrompt).toHaveLength(3)
    expect(manifest.interface.composerIcon).toBe('./assets/grant-deliberation-icon.svg')
    expect(manifest.interface.logo).toBe('./assets/grant-deliberation-logo.png')
    expect(manifest.interface.screenshots).toContain('./assets/grant-deliberation-logo.png')
    expect(manifest.interface.privacyPolicyURL).toContain('/docs/privacy.md')
    expect(manifest.interface.termsOfServiceURL).toContain('/docs/terms.md')
  })

  it('ships its hook and asset files', async () => {
    await expect(access(path.join(pluginRoot, 'hooks.json'))).resolves.toBeUndefined()
    await expect(access(path.join(pluginRoot, 'assets', 'grant-deliberation-icon.svg'))).resolves.toBeUndefined()
    await expect(access(path.join(pluginRoot, 'assets', 'grant-deliberation-logo.png'))).resolves.toBeUndefined()
    await expect(access(path.join(pluginRoot, 'docs', 'privacy.md'))).resolves.toBeUndefined()
    await expect(access(path.join(pluginRoot, 'docs', 'terms.md'))).resolves.toBeUndefined()
  })
})
