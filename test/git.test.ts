import { expect, it } from 'vitest'
import { generate, getGitRepo } from '../src'

const COMMIT_FROM = '19cf4f84f16f1a8e1e7032bbef550c382938649d'
const COMMIT_TO = '49b0222e8d60b7f299941def7511cee0460a8149'
const regexToFindAllUrls = /https:\/\/\S*/g

it('parse', async () => {
  const { config, md } = await generate({
    from: COMMIT_FROM,
    to: COMMIT_TO,
  })

  expect(config).toMatchInlineSnapshot(`
    {
      "baseUrl": "https://github.com",
      "baseUrlApi": "https://api.github.com",
      "capitalize": true,
      "contributors": true,
      "from": "19cf4f84f16f1a8e1e7032bbef550c382938649d",
      "group": true,
      "prerelease": false,
      "releaseRepo": "duowb/changelogitlab",
      "repo": "duowb/changelogitlab",
      "repoProvider": "github",
      "scopeMap": {},
      "tag": "v%s",
      "tagFilter": [Function],
      "titles": {
        "breakingChanges": "🚨 Breaking Changes",
      },
      "to": "49b0222e8d60b7f299941def7511cee0460a8149",
      "types": {
        "feat": {
          "title": "🚀 Features",
        },
        "fix": {
          "title": "🐞 Bug Fixes",
        },
        "perf": {
          "title": "🏎 Performance",
        },
      },
    }
  `)
  expect(md.replace(/&nbsp;/g, ' ').replace(/ +/g, ' ')).toMatchInlineSnapshot(`
    "### Breaking Changes

    - **cli**: Rename \`groupByScope\` to \`group\` - by **Enzo Innocenzi** in https://github.com/duowb/changelogitlab/issues/22 [<samp>(89282)</samp>](https://github.com/duowb/changelogitlab/commit/8928229)

    ### Features

    - Inline contributors - by **Anthony Fu** [<samp>(e4044)</samp>](https://github.com/duowb/changelogitlab/commit/e404493)
    - Throw on shallow repo - by **Anthony Fu** [<samp>(f1c1f)</samp>](https://github.com/duowb/changelogitlab/commit/f1c1fad)
    - Improve how references are displayed - by **Enzo Innocenzi** in https://github.com/duowb/changelogitlab/issues/19 [<samp>(cdf8f)</samp>](https://github.com/duowb/changelogitlab/commit/cdf8fe5)
    - Support \`--no-emoji\` - by **Enzo Innocenzi** in https://github.com/duowb/changelogitlab/issues/20 [<samp>(e94ba)</samp>](https://github.com/duowb/changelogitlab/commit/e94ba4a)
    - **contributors**:
     - Improve author list - by **Enzo Innocenzi** in https://github.com/duowb/changelogitlab/issues/18 [<samp>(8d8d9)</samp>](https://github.com/duowb/changelogitlab/commit/8d8d914)
    - **style**:
     - Group scopes only when one of the scope have multiple commits - by **Anthony Fu** [<samp>(312f7)</samp>](https://github.com/duowb/changelogitlab/commit/312f796)
     - Use \`<sup>\` for author info - by **Anthony Fu** [<samp>(b51c0)</samp>](https://github.com/duowb/changelogitlab/commit/b51c075)
     - Limit sha to 5 letters and make monospace - by **Anthony Fu** [<samp>(b07ad)</samp>](https://github.com/duowb/changelogitlab/commit/b07ade8)

    ### Bug Fixes

    - Use \`creatordate\` to sort tags - by **Frost Ming** in https://github.com/duowb/changelogitlab/issues/17 [<samp>(5666d)</samp>](https://github.com/duowb/changelogitlab/commit/5666d8d)
    - Config defaults - by **Anthony Fu** [<samp>(9232f)</samp>](https://github.com/duowb/changelogitlab/commit/9232fdf)
    - Use \`replace\` instead of \`replaceAll\` for Node 14 - by **Anthony Fu** [<samp>(5154e)</samp>](https://github.com/duowb/changelogitlab/commit/5154e78)
    - **cli**: Add missing \`--group\` option - by **Enzo Innocenzi** in https://github.com/duowb/changelogitlab/issues/21 [<samp>(22800)</samp>](https://github.com/duowb/changelogitlab/commit/228001d)
    - **style**: Revert \`<sup>\` style - by **Anthony Fu** [<samp>(742ae)</samp>](https://github.com/duowb/changelogitlab/commit/742ae0b)

    ##### [View changes on GitHub](https://github.com/duowb/changelogitlab/compare/19cf4f84f16f1a8e1e7032bbef550c382938649d...49b0222e8d60b7f299941def7511cee0460a8149)"
  `)
})

it.each([
  { baseUrl: undefined, baseUrlApi: undefined, repo: undefined },
  { baseUrl: 'test.github.com', baseUrlApi: 'api.test.github.com', repo: 'user/changelogits' },
])('should generate config while baseUrl is set to $baseUrl', async (proposedConfig) => {
  const { config, md } = await generate({
    ...proposedConfig,
    from: COMMIT_FROM,
    to: COMMIT_TO,
  })

  if (proposedConfig.baseUrl) {
    expect(config).toEqual(expect.objectContaining(proposedConfig))
  }
  else {
    expect(config).toEqual(expect.objectContaining({
      baseUrl: 'https://github.com',
      baseUrlApi: 'https://api.github.com',
    }))
  }

  const urlsToGithub = md.match(regexToFindAllUrls)
  expect(urlsToGithub?.every(url => url.startsWith(config.baseUrl))).toBe(true)
})

it('should match with current github repo', async () => {
  const repo = await getGitRepo('github.com')
  expect(repo).toContain('changelogits')
})

it('should throw error when baseUrl is different from git repository', async () => {
  await expect(async () => {
    await getGitRepo('custom.git.com')
  }).rejects.toThrow('Can not parse GitHub repo from url')
})
