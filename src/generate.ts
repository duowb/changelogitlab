import type { ChangelogOptions } from './types'
import { getGitDiff } from 'changelogen'
import { resolveConfig } from './config'
import { generateMarkdown } from './markdown'
import { parseCommits } from './parse'
import { resolveAuthors } from './providers'

export async function generate(options: ChangelogOptions) {
  const resolved = await resolveConfig(options)

  const rawCommits = await getGitDiff(resolved.from, resolved.to)
  const commits = parseCommits(rawCommits, resolved)
  if (resolved.contributors)
    await resolveAuthors(commits, resolved)
  const md = generateMarkdown(commits, resolved)

  return { config: resolved, md, commits }
}
