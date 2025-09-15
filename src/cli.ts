#!/usr/bin/env node

import fs from 'node:fs/promises'
import process from 'node:process'
import { blue, bold, cyan, dim, red, yellow } from 'ansis'
import cac from 'cac'
import { execa } from 'execa'
import { version } from '../package.json'
import { generate, hasTag, isRepoShallow, sendRelease, uploadAssets } from './index'

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

    // Resolve token from CLI/env/CLI file path/env file path/CLI tools
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
      // If token looks like a file path, try read content
      if (typeof token === 'string' && token.length < 512 && /[\\/]/.test(token)) {
        const fileToken = await readTokenFromFile(token)
        if (fileToken)
          token = fileToken
      }
    }

    if (token)
      args.token = token

    let webUrl = ''

    try {
      if (!args.quiet) {
        console.log()
        const providerName = repoProvider === 'gitlab' ? 'GitLab' : 'GitHub'
        console.log(dim(`changelo${bold(providerName)} `) + dim(`v${version}`))
      }

      const { config, md, commits } = await generate(args as any)

      // Generate appropriate web URL based on provider
      if (config.repoProvider === 'gitlab') {
        webUrl = `${config.baseUrl}/${config.releaseRepo}/-/releases/new?tag_name=${encodeURIComponent(String(config.to))}&release_title=${encodeURIComponent(String(config.name || config.to))}&release_notes=${encodeURIComponent(String(md))}`
      }
      else {
        webUrl = `${config.baseUrl}/${config.releaseRepo}/releases/new?title=${encodeURIComponent(String(config.name || config.to))}&body=${encodeURIComponent(String(md))}&tag=${encodeURIComponent(String(config.to))}&prerelease=${config.prerelease}`
      }

      const comparePath = config.repoProvider === 'gitlab'
        ? `/-/compare/${config.from}...${config.to}`
        : `/compare/${config.from}...${config.to}`
      const compareUrl = `${config.baseUrl}/${config.repo}${comparePath}`

      if (args.json) {
        const payload = {
          md: md.replace(/&nbsp;/g, ''),
          from: String(config.from),
          to: String(config.to),
          repoProvider: config.repoProvider,
          repo: String(config.repo),
          releaseRepo: String(config.releaseRepo),
          prerelease: !!config.prerelease,
          commitsCount: commits.length,
          compareUrl,
        }
        console.log(JSON.stringify(payload))
        return
      }

      if (args.printMd) {
        console.log(md.replace(/&nbsp;/g, ''))
        return
      }

      if (!args.quiet) {
        console.log(cyan(config.from) + dim(' -> ') + blue(config.to) + dim(` (${commits.length} commits)`))
        console.log(dim('--------------'))
        console.log()
        console.log(md.replace(/&nbsp;/g, ''))
        console.log()
        console.log(dim('--------------'))
      }

      function printWebUrl() {
        console.log()
        console.error(yellow('Using the following link to create it manually:'))
        console.error(yellow(webUrl))
        console.log()
      }

      if (config.dry) {
        console.log(yellow('Dry run. Release skipped.'))
        printWebUrl()
        return
      }

      if (typeof config.output === 'string') {
        await fs.writeFile(config.output, md, 'utf-8')
        console.log(yellow(`Saved to ${config.output}`))
        return
      }

      if (!config.token) {
        const tokenEnvName = config.repoProvider === 'gitlab' ? 'GITLAB_TOKEN or GITLAB_PRIVATE_TOKEN' : 'GITHUB_TOKEN or GITHUB_TOKEN_PATH'
        console.error(red(`No ${config.repoProvider} token found, specify it via ${tokenEnvName} env. Release skipped.`))
        process.exitCode = 1
        printWebUrl()
        return
      }

      if (!await hasTag(config.to, config)) {
        const providerName = config.repoProvider === 'gitlab' ? 'GitLab' : 'GitHub'
        console.error(yellow(`Current ref "${bold(config.to)}" is not available as tags on ${providerName}. Release skipped.`))
        process.exitCode = 1
        printWebUrl()
        return
      }

      if (!commits.length && await isRepoShallow()) {
        console.error(yellow('The repo seems to be clone shallowly, which make changelog failed to generate. You might want to specify `fetch-depth: 0` in your CI config.'))
        process.exitCode = 1
        printWebUrl()
        return
      }

      await sendRelease(config, md)

      if (args.assets && args.assets.length > 0) {
        await uploadAssets(config, args.assets)
      }
    }
    catch (e: any) {
      console.error(red(String(e)))
      if (e?.stack)
        console.error(dim(e.stack?.split('\n').slice(1).join('\n')))

      if (webUrl) {
        console.log()
        console.error(red('Failed to create the release. Using the following link to create it manually:'))
        console.error(yellow(webUrl))
        console.log()
      }

      process.exit(1)
    }
  })

cli.parse()
