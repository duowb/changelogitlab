import type { ChangelogOptions, Commit, ResolvedChangelogOptions } from './types'
import fs from 'node:fs/promises'
import { generate } from './generate'
import { isRepoShallow } from './git'
import { hasTag, sendRelease, uploadAssets } from './providers'

export interface ReleaseContext {
  config: ResolvedChangelogOptions
  md: string
  commits: Commit[]
  webUrl: string
  compareUrl: string
}

export type ReleaseOutcome = 'dry-run' | 'output-saved' | 'released'

export interface ReleaseResult {
  outcome: ReleaseOutcome
  outputPath?: string
  uploadedAssets?: string[]
}

export type ReleaseErrorCode = 'MISSING_TOKEN' | 'MISSING_TAG' | 'SHALLOW_REPO'

export interface ReleaseErrorDetails {
  webUrl: string
  tokenEnvName?: string
  compareUrl?: string
}

export class ReleaseExecutionError extends Error {
  readonly code: ReleaseErrorCode
  readonly details: ReleaseErrorDetails

  constructor(code: ReleaseErrorCode, message: string, details: ReleaseErrorDetails) {
    super(message)
    this.name = 'ReleaseExecutionError'
    this.code = code
    this.details = details
  }
}

export async function prepareRelease(options: ChangelogOptions): Promise<ReleaseContext> {
  const { config, md, commits } = await generate(options)
  const webUrl = buildReleaseUrl(config, md)
  const compareUrl = buildCompareUrl(config)

  return {
    config,
    md,
    commits,
    webUrl,
    compareUrl,
  }
}

export interface PerformReleaseOptions {
  assets?: string | string[]
}

export async function performRelease(
  context: ReleaseContext,
  options: PerformReleaseOptions = {},
): Promise<ReleaseResult> {
  const { config, md, commits, webUrl } = context

  if (config.dry)
    return { outcome: 'dry-run' }

  if (typeof config.output === 'string') {
    await fs.writeFile(config.output, md, 'utf-8')
    return {
      outcome: 'output-saved',
      outputPath: config.output,
    }
  }

  if (!config.token) {
    const tokenEnvName = getTokenEnvName(config.repoProvider)
    throw new ReleaseExecutionError(
      'MISSING_TOKEN',
      getMissingTokenMessage(config.repoProvider, tokenEnvName),
      {
        webUrl,
        tokenEnvName,
        compareUrl: context.compareUrl,
      },
    )
  }

  const hasTargetTag = await hasTag(config.to, config)
  if (!hasTargetTag) {
    const providerName = getProviderName(config.repoProvider)
    throw new ReleaseExecutionError(
      'MISSING_TAG',
      `Current ref "${config.to}" is not available as tags on ${providerName}. Release skipped.`,
      {
        webUrl,
        compareUrl: context.compareUrl,
      },
    )
  }

  if (!commits.length && await isRepoShallow()) {
    throw new ReleaseExecutionError(
      'SHALLOW_REPO',
      'The repo seems to be clone shallowly, which make changelog failed to generate. You might want to specify `fetch-depth: 0` in your CI config.',
      {
        webUrl,
        compareUrl: context.compareUrl,
      },
    )
  }

  await sendRelease(config, md)

  const assetsInput = options.assets ?? config.assets
  const normalizedAssets = normalizeAssets(assetsInput)
  if (assetsInput && normalizedAssets.length > 0)
    await uploadAssets(config, assetsInput)

  return {
    outcome: 'released',
    uploadedAssets: normalizedAssets.length > 0 ? normalizedAssets : undefined,
  }
}

export async function runRelease(options: ChangelogOptions): Promise<{ context: ReleaseContext, result: ReleaseResult }> {
  const context = await prepareRelease(options)
  const result = await performRelease(context)
  return { context, result }
}

export interface ExecuteChangelogOptions extends ChangelogOptions {
  json?: boolean
  printMd?: boolean
  quiet?: boolean
}

export type ExecutionMode = 'release' | 'json' | 'print-md'

export interface ExecutionJsonPayload {
  md: string
  from: string
  to: string
  repoProvider: string
  repo: string
  releaseRepo: string
  prerelease: boolean
  commitsCount: number
  compareUrl: string
}

export interface ExecuteChangelogResult {
  context: ReleaseContext
  markdown: string
  mode: ExecutionMode
  jsonPayload?: ExecutionJsonPayload
  release?: ReleaseResult
}

export async function executeChangelog(options: ExecuteChangelogOptions): Promise<ExecuteChangelogResult> {
  const context = await prepareRelease(options)
  const markdown = sanitizeMarkdown(context.md)

  if (options.json) {
    return {
      context,
      markdown,
      mode: 'json',
      jsonPayload: buildJsonPayload(context, markdown),
    }
  }

  if (options.printMd) {
    return {
      context,
      markdown,
      mode: 'print-md',
    }
  }

  const release = await performRelease(context, { assets: options.assets })
  return {
    context,
    markdown,
    mode: 'release',
    release,
  }
}

function buildReleaseUrl(config: ResolvedChangelogOptions, md: string): string {
  const encodedBody = encodeURIComponent(md)
  const encodedTag = encodeURIComponent(String(config.to))
  const encodedTitle = encodeURIComponent(String(config.name || config.to))

  if (config.repoProvider === 'gitlab') {
    const encodedPrerelease = encodeURIComponent(String(config.prerelease))
    return `${config.baseUrl}/${config.releaseRepo}/-/releases/new?tag_name=${encodedTag}&release_title=${encodedTitle}&release_notes=${encodedBody}&pre_release=${encodedPrerelease}`
  }

  return `${config.baseUrl}/${config.releaseRepo}/releases/new?title=${encodedTitle}&body=${encodedBody}&tag=${encodedTag}&prerelease=${config.prerelease}`
}

function buildCompareUrl(config: ResolvedChangelogOptions): string {
  const comparePath = config.repoProvider === 'gitlab'
    ? `/-/compare/${config.from}...${config.to}`
    : `/compare/${config.from}...${config.to}`
  return `${config.baseUrl}/${config.repo}${comparePath}`
}

function getProviderName(provider: string): 'GitHub' | 'GitLab' {
  return provider === 'gitlab' ? 'GitLab' : 'GitHub'
}

function getTokenEnvName(provider: string): string {
  return provider === 'gitlab'
    ? 'GITLAB_TOKEN or GITLAB_PRIVATE_TOKEN'
    : 'GITHUB_TOKEN or GITHUB_TOKEN_PATH'
}

function getMissingTokenMessage(provider: string, tokenEnvName: string): string {
  const providerName = getProviderName(provider)
  return `No ${providerName} token found, specify it via ${tokenEnvName} env. Release skipped.`
}

function normalizeAssets(assets: string | string[] | undefined): string[] {
  if (!assets)
    return []
  if (Array.isArray(assets)) {
    return assets
      .flatMap(item => item.split(',').map(s => s.trim()))
      .filter(Boolean)
  }
  return assets.split(',').map(s => s.trim()).filter(Boolean)
}

function sanitizeMarkdown(input: string): string {
  return input.replace(/&nbsp;/g, '')
}

function buildJsonPayload(context: ReleaseContext, markdown: string): ExecutionJsonPayload {
  const { config, commits, compareUrl } = context
  return {
    md: markdown,
    from: String(config.from),
    to: String(config.to),
    repoProvider: config.repoProvider,
    repo: String(config.repo),
    releaseRepo: String(config.releaseRepo),
    prerelease: !!config.prerelease,
    commitsCount: commits.length,
    compareUrl,
  }
}
