import type { AuthorInfo, ChangelogOptions, Commit } from './types'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
/* eslint-disable no-console */
import { notNullish } from '@antfu/utils'
import { cyan, green, red } from 'ansis'
import { $fetch } from 'ofetch'
import { glob } from 'tinyglobby'

export async function getProjectId(options: ChangelogOptions): Promise<number> {
  // 优先从环境变量中获取 Project ID
  const envProjectId = process.env.GITLAB_PROJECT_ID
  if (envProjectId) {
    const projectId = Number.parseInt(envProjectId, 10)
    if (!Number.isNaN(projectId)) {
      return projectId
    }
  }

  // 如果环境变量中没有或无效，则通过 API 请求获取
  const headers = getHeaders(options)
  // GitLab uses URL-encoded project path (e.g., "group%2Fproject")
  const encodedRepo = encodeURIComponent(options.releaseRepo as string)
  const data = await $fetch(`${options.baseUrlApi}/projects/${encodedRepo}`, {
    headers,
  })
  return data.id
}

export async function sendRelease(
  options: ChangelogOptions,
  content: string,
) {
  const headers = getHeaders(options)
  const projectId = await getProjectId(options)

  let url = `${options.baseUrlApi}/projects/${projectId}/releases`
  let method = 'POST'
  let existingRelease = null

  // Check if release already exists
  try {
    existingRelease = await $fetch(`${options.baseUrlApi}/projects/${projectId}/releases/${options.to}`, {
      headers,
    })
    if (existingRelease) {
      url = `${options.baseUrlApi}/projects/${projectId}/releases/${options.to}`
      method = 'PUT'
    }
  }
  catch {
    // Release doesn't exist, will create new one
  }

  const body = {
    name: options.name || options.to,
    tag_name: options.to,
    description: content,
    // GitLab doesn't have draft concept like GitHub, but has released flag
    released_at: options.draft ? null : new Date().toISOString(),
  }

  console.log(cyan(method === 'POST'
    ? 'Creating release notes...'
    : 'Updating release notes...'),
  )

  const res = await $fetch(url, {
    method,
    body: JSON.stringify(body),
    headers,
  })

  console.log(green(`Released on ${res._links.self}`))
}

function getHeaders(options: ChangelogOptions) {
  return {
    'Content-Type': 'application/json',
    'PRIVATE-TOKEN': options.token,
  }
}

const excludeAuthors = [
  /\[bot\]/i,
  /dependabot/i,
  /\(bot\)/i,
]

export async function resolveAuthorInfo(options: ChangelogOptions, info: AuthorInfo) {
  if (info.login)
    return info

  // token not provided, skip gitlab resolving
  if (!options.token)
    return info

  try {
    // GitLab API: Search users by email
    const data = await $fetch(`${options.baseUrlApi}/users?search=${encodeURIComponent(info.email)}`, {
      headers: getHeaders(options),
    })
    if (data.length > 0) {
      // Find user with matching email
      const user = data.find((u: any) => u.email === info.email || u.public_email === info.email)
      if (user) {
        info.login = user.username
      }
    }
  }
  catch {}

  if (info.login)
    return info

  if (info.commits.length) {
    try {
      const projectId = await getProjectId(options)
      const data = await $fetch(`${options.baseUrlApi}/projects/${projectId}/repository/commits/${info.commits[0]}`, {
        headers: getHeaders(options),
      })
      info.login = data.author_name
    }
    catch {}
  }

  return info
}

export async function resolveAuthors(commits: Commit[], options: ChangelogOptions) {
  const map = new Map<string, AuthorInfo>()
  commits.forEach((commit) => {
    commit.resolvedAuthors = commit.authors.map((a, idx) => {
      if (!a.email || !a.name)
        return null
      if (excludeAuthors.some(re => re.test(a.name)))
        return null
      if (!map.has(a.email)) {
        map.set(a.email, {
          commits: [],
          name: a.name,
          email: a.email,
        })
      }
      const info = map.get(a.email)!

      // record commits only for the first author
      if (idx === 0)
        info.commits.push(commit.shortHash)

      return info
    }).filter(notNullish)
  })
  const authors = Array.from(map.values())
  const resolved = await Promise.all(authors.map(info => resolveAuthorInfo(options, info)))

  const loginSet = new Set<string>()
  const nameSet = new Set<string>()
  return resolved
    .sort((a, b) => (a.login || a.name).localeCompare(b.login || b.name))
    .filter((i) => {
      if (i.login && loginSet.has(i.login))
        return false
      if (i.login) {
        loginSet.add(i.login)
      }
      else {
        if (nameSet.has(i.name))
          return false
        nameSet.add(i.name)
      }
      return true
    })
}

export async function hasTagOnGitLab(tag: string, options: ChangelogOptions) {
  try {
    const projectId = await getProjectId(options)
    await $fetch(`${options.baseUrlApi}/projects/${projectId}/repository/tags/${tag}`, {
      headers: getHeaders(options),
    })
    return true
  }
  catch {
    return false
  }
}

export async function uploadAssets(options: ChangelogOptions, assets: string | string[]) {
  const headers = getHeaders(options)
  const projectId = await getProjectId(options)

  let assetList: string[] = []
  if (typeof assets === 'string') {
    assetList = assets.split(',').map(s => s.trim()).filter(Boolean)
  }
  else if (Array.isArray(assets)) {
    assetList = assets.flatMap(item =>
      typeof item === 'string' ? item.split(',').map(s => s.trim()) : [],
    ).filter(Boolean)
  }

  // Expand glob patterns to actual file paths
  const expandedAssets: string[] = []
  for (const pattern of assetList) {
    try {
      // Use the pattern directly without shell expansion
      const matches = await glob(pattern)
      if (matches.length) {
        expandedAssets.push(...matches)
      }
      else {
        // If no matches found, treat as literal path
        expandedAssets.push(pattern)
      }
    }
    catch (error) {
      console.error(red(`Failed to process glob pattern "${pattern}": ${error}`))
      // Keep the original pattern as fallback
      expandedAssets.push(pattern)
    }
  }

  // GitLab doesn't have direct release asset upload like GitHub
  // Instead, we need to upload files to the project and then link them to the release
  const uploadedLinks: Array<{ name: string, url: string }> = []

  for (const asset of expandedAssets) {
    const filePath = path.resolve(asset)
    try {
      const fileData = await fs.readFile(filePath)
      const fileName = path.basename(filePath)

      console.log(cyan(`Uploading ${fileName}...`))

      // Upload the file to GitLab's repository files API
      const fileContent = fileData.toString('base64')

      try {
        // Use GitLab's repository files API to upload the file
        await $fetch(`${options.baseUrlApi}/projects/${projectId}/repository/files/${encodeURIComponent(fileName)}`, {
          method: 'POST',
          headers: getHeaders(options),
          body: JSON.stringify({
            branch: 'main',
            content: fileContent,
            commit_message: `Add release asset: ${fileName}`,
            encoding: 'base64',
          }),
        })

        uploadedLinks.push({
          name: fileName,
          url: `${options.baseUrl}/${options.releaseRepo}/-/blob/main/${fileName}`,
        })

        console.log(green(`Uploaded ${fileName} successfully.`))
      }
      catch (error) {
        console.error(red(`Failed to upload ${fileName}: ${error}`))
      }
    }
    catch (error) {
      console.error(red(`Failed to read file ${filePath}: ${error}`))
    }
  }

  // Update the release description to include links to uploaded assets
  if (uploadedLinks.length > 0) {
    try {
      const release = await $fetch(`${options.baseUrlApi}/projects/${projectId}/releases/${options.to}`, {
        headers,
      })

      const assetLinks = uploadedLinks.map(link => `- [${link.name}](${link.url})`).join('\n')
      const updatedDescription = `${release.description}\n\n## Assets\n${assetLinks}`

      await $fetch(`${options.baseUrlApi}/projects/${projectId}/releases/${options.to}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          description: updatedDescription,
        }),
      })

      console.log(green('Updated release with asset links.'))
    }
    catch (error) {
      console.error(red(`Failed to update release with asset links: ${error}`))
    }
  }
}
