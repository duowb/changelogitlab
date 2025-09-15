import type { AuthorInfo, ChangelogOptions, Commit } from './types'
import * as github from './github'
import * as gitlab from './gitlab'

export interface RepoProvider {
  sendRelease: (options: ChangelogOptions, content: string) => Promise<void>
  resolveAuthors: (commits: Commit[], options: ChangelogOptions) => Promise<AuthorInfo[]>
  hasTag: (tag: string, options: ChangelogOptions) => Promise<boolean>
  uploadAssets: (options: ChangelogOptions, assets: string | string[]) => Promise<void>
}

class GitHubProvider implements RepoProvider {
  async sendRelease(options: ChangelogOptions, content: string): Promise<void> {
    return github.sendRelease(options, content)
  }

  async resolveAuthors(commits: Commit[], options: ChangelogOptions): Promise<AuthorInfo[]> {
    return github.resolveAuthors(commits, options)
  }

  async hasTag(tag: string, options: ChangelogOptions): Promise<boolean> {
    return github.hasTagOnGitHub(tag, options)
  }

  async uploadAssets(options: ChangelogOptions, assets: string | string[]): Promise<void> {
    return github.uploadAssets(options, assets)
  }
}

class GitLabProvider implements RepoProvider {
  async sendRelease(options: ChangelogOptions, content: string): Promise<void> {
    return gitlab.sendRelease(options, content)
  }

  async resolveAuthors(commits: Commit[], options: ChangelogOptions): Promise<AuthorInfo[]> {
    return gitlab.resolveAuthors(commits, options)
  }

  async hasTag(tag: string, options: ChangelogOptions): Promise<boolean> {
    return gitlab.hasTagOnGitLab(tag, options)
  }

  async uploadAssets(options: ChangelogOptions, assets: string | string[]): Promise<void> {
    return gitlab.uploadAssets(options, assets)
  }
}

const providers = {
  github: new GitHubProvider(),
  gitlab: new GitLabProvider(),
}

export function getProvider(repoProvider: string): RepoProvider {
  const provider = providers[repoProvider as keyof typeof providers]
  if (!provider) {
    throw new Error(`Unsupported repository provider: ${repoProvider}`)
  }
  return provider
}

// Export unified functions that delegate to the appropriate provider
export async function sendRelease(options: ChangelogOptions, content: string): Promise<void> {
  const provider = getProvider(options.repoProvider || 'github')
  return provider.sendRelease(options, content)
}

export async function resolveAuthors(commits: Commit[], options: ChangelogOptions): Promise<AuthorInfo[]> {
  const provider = getProvider(options.repoProvider || 'github')
  return provider.resolveAuthors(commits, options)
}

export async function hasTag(tag: string, options: ChangelogOptions): Promise<boolean> {
  const provider = getProvider(options.repoProvider || 'github')
  return provider.hasTag(tag, options)
}

export async function uploadAssets(options: ChangelogOptions, assets: string | string[]): Promise<void> {
  const provider = getProvider(options.repoProvider || 'github')
  return provider.uploadAssets(options, assets)
}
