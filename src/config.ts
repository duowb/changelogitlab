import type { ChangelogOptions, ResolvedChangelogOptions } from './types'
import { getCurrentGitBranch, getFirstGitCommit, getGitRepo, getLastMatchingTag, getSafeTagTemplate, isPrerelease } from './git'

export function defineConfig(config: ChangelogOptions) {
  return config
}

const providerToDomain = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
}
const providerToApiDomain = {
  github: 'https://api.github.com',
  gitlab: 'https://gitlab.com/api/v4',
}

const defaultConfig = {
  scopeMap: {},
  types: {
    feat: { title: '🚀 Features' },
    fix: { title: '🐞 Bug Fixes' },
    perf: { title: '🏎 Performance' },
  },
  titles: {
    breakingChanges: '🚨 Breaking Changes',
  },
  contributors: true,
  capitalize: true,
  group: true,
  tag: 'v%s',
  repoProvider: 'github',
} satisfies ChangelogOptions

export async function resolveConfig(options: ChangelogOptions) {
  const { loadConfig } = await import('c12')
  const config = await loadConfig<ChangelogOptions>({
    name: 'changelogits',
    defaults: defaultConfig,
    overrides: options,
    packageJson: 'changelogits',
  }).then(r => r.config || defaultConfig)

  config.baseUrl = config.baseUrl ?? providerToDomain[config.repoProvider || defaultConfig.repoProvider]
  config.baseUrlApi = config.baseUrlApi ?? providerToApiDomain[config.repoProvider || defaultConfig.repoProvider]
  config.to = config.to || await getCurrentGitBranch()
  config.tagFilter = config.tagFilter ?? (() => true)
  config.tag = getSafeTagTemplate(config.tag ?? defaultConfig.tag)
  config.from = config.from || await getLastMatchingTag(
    config.to,
    config.tagFilter,
    config.tag,
  ) || await getFirstGitCommit()
  // @ts-expect-error backward compatibility
  config.repo = config.repo || config.github || config.gitlab || await getGitRepo(config.baseUrl)
  // @ts-expect-error backward compatibility
  config.releaseRepo = config.releaseRepo || config.releaseGithub || config.releaseGitlab || config.repo
  config.prerelease = config.prerelease ?? isPrerelease(config.to)

  if (typeof config.repo !== 'string')
    throw new Error(`Invalid repository, expected a string but got ${JSON.stringify(config.repo)}`)

  return config as ResolvedChangelogOptions
}
