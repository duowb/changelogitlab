# changelogits

[![NPM version](https://img.shields.io/npm/v/changelogits?color=a1b858&label=)](https://www.npmjs.com/package/changelogits)

Generate changelog for GitHub and GitLab releases from [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), powered by [changelogen](https://github.com/unjs/changelogen).

[👉 GitHub Changelog example](https://github.com/unocss/unocss/releases/tag/v0.39.0)

## Features

- Support exclamation mark as breaking change, e.g. `chore!: drop node v10`
- Grouped scope in changelog
- Create the release note, or update the existing one
- List contributors
- Support both GitHub and GitLab platforms

## Usage

### GitHub Actions

In GitHub Actions:

```yml
# .github/workflows/release.yml

name: Release

permissions:
  contents: write

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set node
        uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org/
          node-version: lts/*

      - run: npx changelogits # or changelogits@0.12 to ensure a stable result
        env:
          GITHUB_TOKEN: ${{secrets.GITHUB_TOKEN}}
```

It will be trigged whenever you push a tag to GitHub that starts with `v`.

### GitLab CI/CD

In GitLab CI/CD:

```yml
# .gitlab-ci.yml

stages:
  - release

release:
  stage: release
  image: node:lts
  rules:
    - if: $CI_COMMIT_TAG =~ /^v.*/
  before_script:
    - npm install -g changelogits
  script:
    - changelogits --repo-provider gitlab
  variables:
    GITLAB_TOKEN: $CI_JOB_TOKEN
```

It will be triggered whenever you push a tag to GitLab that starts with `v`.

### Local Usage

For GitHub:
```bash
npx changelogits --repo-provider github
```

For GitLab:
```bash
npx changelogits --repo-provider gitlab
```

## Configuration

You can put a configuration file in the project root, named as `changelogits.config.{json,ts,js,mjs,cjs}`, `.changelogitsrc` or use the `changelogits` field in `package.json`.

### Configuration Options

```typescript
export interface ChangelogOptions {
  // Repository provider: 'github' or 'gitlab'
  repoProvider?: 'github' | 'gitlab'

  // Repository configuration
  github?: string // GitHub repository (e.g., 'owner/repo')
  gitlab?: string // GitLab repository (e.g., 'group/project')

  // Token for authentication
  token?: string // GitHub token or GitLab private token

  // Release configuration
  name?: string // Name of the release
  draft?: boolean // Mark as draft (GitHub only)
  prerelease?: boolean // Mark as prerelease

  // Other options...
}
```

### Environment Variables

For GitHub:
- `GITHUB_TOKEN`: GitHub personal access token

For GitLab:
- `GITLAB_TOKEN` or `GITLAB_PRIVATE_TOKEN`: GitLab private token

## Preview Locally

For GitHub:
```bash
npx changelogits --dry --repo-provider github
```

For GitLab:
```bash
npx changelogits --dry --repo-provider gitlab
```

## Why?

I used to use [`conventional-github-releaser`](https://github.com/conventional-changelog/releaser-tools/tree/master/packages/conventional-github-releaser) for almost all my projects. Until I found that it [does NOT support using exclamation marks for breaking changes](https://github.com/conventional-changelog/conventional-changelog/issues/648) - hiding those important breaking changes in the changelog without the awareness from maintainers.

## License

[MIT](./LICENSE) License © 2022 [Anthony Fu](https://github.com/antfu)
