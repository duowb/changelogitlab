#!/usr/bin/env node

import process from 'node:process'
import { blue, bold, cyan, dim, red, yellow } from 'ansis'
import cac from 'cac'
import { execa } from 'execa'
import { version } from '../package.json'
import { executeChangelog, type ExecuteChangelogResult, ReleaseExecutionError } from './run'

const cli = cac('changelogits')

cli
  .version(version)
  .option('-t, --token <path>', 'Repository Token (GitHub Token or GitLab Private Token)')
  .option('--from <ref>', 'From tag')
  .option('--to <ref>', 'To tag')
  .option('--github <path>', 'GitHub Repository, e.g. antfu/changelogits')
  .option('--gitlab <path>', 'GitLab Repository, e.g. group/project')
  .option('--release-github <path>', 'Release GitHub Repository, defaults to `github`')
  .option('--release-gitlab <path>', 'Release GitLab Repository, defaults to `gitlab`')
  .option('--name <name>', 'Name of the release')
  .option('--contributors', 'Show contributors section')
  .option('--prerelease', 'Mark release as prerelease')
  .option('-d, --draft', 'Mark release as draft')
  .option('--output <path>', 'Output to file instead of sending to repository')
  .option('--capitalize', 'Should capitalize for each comment message')
  .option('--emoji', 'Use emojis in section titles', { default: true })
  .option('--group', 'Nest commit messages under their scopes')
  .option('--dry', 'Dry run')
  .option('--repo-provider', 'Repository Provider (github or gitlab)', { default: 'github' })
  .option('--assets <paths...>', 'Files to upload as assets to the release. Use quotes to prevent shell glob expansion, e.g., "--assets \'dist/*.js\'"')
  .option('--json', 'Output changelog and metadata as JSON to stdout and exit')
  .option('--print-md', 'Print only the generated markdown to stdout and exit')
  .option('--quiet', 'Reduce logs (useful when capturing output)')
  .help()

async function readTokenFromGitHubCli() {
  try {
    return (await execa('gh', ['auth', 'token'])).stdout.trim()
  }
  catch {
    return ''
  }
}

async function readTokenFromGitLabCli() {
  try {
    return (await execa('glab', ['auth', 'token'])).stdout.trim()
  }
  catch {
    return ''
  }
}

async function readTokenFromFile(path: string) {
  try {
    const fs = await import('node:fs/promises')
    const data = await fs.readFile(path, 'utf-8')
    return data.trim()
  }
  catch {
    return ''
  }
}

cli
  .command('')
  .action(async (args) => {
    const repoProvider = args.repoProvider || 'github'
    let token = args.token

    if (!token) {
      if (repoProvider === 'gitlab') {
        token = process.env.GITLAB_TOKEN || process.env.GITLAB_PRIVATE_TOKEN || ''
        if (!token) {
          const envPath = process.env.GITLAB_TOKEN_PATH || process.env.GITLAB_PRIVATE_TOKEN_PATH
          if (envPath)
            token = await readTokenFromFile(envPath)
        }
        if (!token)
          token = await readTokenFromGitLabCli()
      }
      else {
        token = process.env.GITHUB_TOKEN || ''
        if (!token) {
          const envPath = process.env.GITHUB_TOKEN_PATH
          if (envPath)
            token = await readTokenFromFile(envPath)
        }
        if (!token)
          token = await readTokenFromGitHubCli()
      }
    }
    else {
      if (typeof token === 'string' && token.length < 512 && /[\\/]/.test(token)) {
        const fileToken = await readTokenFromFile(token)
        if (fileToken)
          token = fileToken
      }
    }

    if (token)
      args.token = token

    let execution: ExecuteChangelogResult | undefined

    try {
      execution = await executeChangelog(args as any)
      const { context, markdown, mode } = execution
      const { config, commits } = context

      if (!args.quiet) {
        console.log()
        const providerName = config.repoProvider === 'gitlab' ? 'GitLab' : 'GitHub'
        console.log(dim(`changelo${bold(providerName)} `) + dim(`v${version}`))
      }

      if (mode === 'json') {
        if (execution.jsonPayload)
          console.log(JSON.stringify(execution.jsonPayload))
        return
      }

      if (mode === 'print-md') {
        console.log(markdown)
        return
      }

      if (!args.quiet) {
        console.log(cyan(config.from) + dim(' -> ') + blue(config.to) + dim(` (${commits.length} commits)`))
        console.log(dim('--------------'))
        console.log()
        console.log(markdown)
        console.log()
        console.log(dim('--------------'))
      }

      const releaseResult = execution.release!

      if (releaseResult.outcome === 'dry-run') {
        console.log(yellow('Dry run. Release skipped.'))
        printManualLink(context.webUrl)
        return
      }

      if (releaseResult.outcome === 'output-saved') {
        console.log(yellow(`Saved to ${releaseResult.outputPath}`))
      }
    }
    catch (error) {
      if (error instanceof ReleaseExecutionError) {
        handleReleaseExecutionError(error)
        return
      }

      console.error(red(String(error)))
      if ((error as any)?.stack)
        console.error(dim((error as any).stack?.split('\n').slice(1).join('\n')))

      if (execution?.context.webUrl) {
        console.log()
        console.error(red('Failed to create the release. Using the following link to create it manually:'))
        console.error(yellow(execution.context.webUrl))
        console.log()
      }

      process.exit(1)
    }
  })

cli.parse()

function handleReleaseExecutionError(error: ReleaseExecutionError) {
  if (error.code === 'MISSING_TOKEN')
    console.error(red(error.message))
  else
    console.error(yellow(error.message))

  process.exitCode = 1
  printManualLink(error.details.webUrl)
}

function printManualLink(url: string) {
  console.log()
  console.error(yellow('Using the following link to create it manually:'))
  console.error(yellow(url))
  console.log()
}
