import { describe, expect, it } from 'vitest'
import { getProvider } from '../src/providers'

describe('providers', () => {
  it('should return GitHub provider for github', () => {
    const provider = getProvider('github')
    expect(provider).toBeDefined()
    expect(provider.sendRelease).toBeDefined()
    expect(provider.resolveAuthors).toBeDefined()
    expect(provider.hasTag).toBeDefined()
    expect(provider.uploadAssets).toBeDefined()
  })

  it('should return GitLab provider for gitlab', () => {
    const provider = getProvider('gitlab')
    expect(provider).toBeDefined()
    expect(provider.sendRelease).toBeDefined()
    expect(provider.resolveAuthors).toBeDefined()
    expect(provider.hasTag).toBeDefined()
    expect(provider.uploadAssets).toBeDefined()
  })

  it('should throw error for unsupported provider', () => {
    expect(() => getProvider('unsupported')).toThrow('Unsupported repository provider: unsupported')
  })
})
