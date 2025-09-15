# changelogits

[![NPM version](https://img.shields.io/npm/v/changelogits?color=a1b858&label=)](https://www.npmjs.com/package/changelogits)

基于 Conventional Commits 自动生成发布说明（Changelog），并在 GitHub/GitLab 上创建或更新 Release，底层使用 changelogen。

## 功能特性

- 识别感叹号形式的破坏性变更（如：`chore!: drop node v10`）
- 支持按 scope 分组，支持“多个提交同 scope”智能折叠
- 自动创建/更新 Release Notes，可附带贡献者列表
- 同时支持 GitHub 与 GitLab（自托管可通过 baseUrl/baseUrlApi 适配）
- 支持本地预览、写入文件、或直接发布；支持上传 Release 资产（artifact）
- 对比链接文案统一为“View changes”，并按平台生成正确 URL：
  - GitHub: `/{repo}/compare/{from}...{to}`
  - GitLab: `/{repo}/-/compare/{from}...{to}`

## 环境要求

- Node.js >= 18.18.0（建议使用 18 LTS/20 LTS）
- 仓库需要存在 git 历史与 tag；CI 场景请确保 `fetch-depth: 0` 获取完整历史

## 快速开始

### GitHub Actions

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

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org/
          node-version: '18'

      - run: npx changelogits --repo-provider github
        env:
          GITHUB_TOKEN: ${{secrets.GITHUB_TOKEN}}
```

当推送以 `v` 开头的 tag 时自动触发并发布。

### GitLab CI/CD

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

当推送以 `v` 开头的 tag 时自动触发并发布。

### 本地使用

GitHub：

```bash
npx changelogits --repo-provider github
```

GitLab：

```bash
npx changelogits --repo-provider gitlab
```

仅预览（不发布）：

```bash
npx changelogits --dry --repo-provider github
npx changelogits --dry --repo-provider gitlab
```

输出到文件：

```bash
npx changelogits --output CHANGELOG_RELEASE.md --repo-provider github
```

## 配置

可在项目根目录提供下列任意配置来源（由 c12 自动解析）：

- `changelogits.config.{json,ts,js,mjs,cjs}`
- `.changelogitsrc`
- `package.json` 中的 `changelogits` 字段

常用配置项（节选）：

```ts
export interface ChangelogOptions {
  // 仓库提供方（默认 'github'）
  repoProvider?: 'github' | 'gitlab'

  // 令牌（GitHub Token 或 GitLab Private Token）
  token?: string

  // 发布名称、草稿、预发布标记
  name?: string
  draft?: boolean
  prerelease?: boolean

  // 是否在发布说明中展示贡献者（默认 true）
  contributors?: boolean

  // 标题样式与分组
  capitalize?: boolean
  group?: boolean | 'multiple'
  emoji?: boolean
  titles?: { breakingChanges?: string }

  // 标签模板与过滤
  tag?: string // 默认 'v%s'
  tagFilter?: (tag: string) => boolean

  // 仓库：源与发布（可相同或不同）
  repo?: string
  releaseRepo?: string

  // 自托管域名（默认 GitHub/GitLab 公网域名）
  baseUrl?: string
  baseUrlApi?: string

  // 上传资产（支持数组或逗号分隔字符串）
  assets?: string[] | string
}
```

自托管示例：

```json
{
  "changelogits": {
    "repoProvider": "gitlab",
    "baseUrl": "https://gitlab.example.com",
    "baseUrlApi": "https://gitlab.example.com/api/v4",
    "repo": "group/project"
  }
}
```

## CLI 参数

```text
--repo-provider <github|gitlab>   指定平台（可在配置文件中设置）
--from <ref>                      对比起点（tag/commit/ref）
--to <ref>                        对比终点（默认当前 ref 或 tag）
--token <string>                  平台 Token（也可从环境变量读取）
--github <owner/repo>             GitHub 仓库（兼容字段）
--gitlab <group/project>          GitLab 仓库（兼容字段）
--release-github <owner/repo>     发布目标 GitHub 仓库（兼容字段）
--release-gitlab <group/project>  发布目标 GitLab 仓库（兼容字段）
--name <string>                   发布名称
--draft                           标记为草稿（GitHub）
--prerelease                      标记为预发布
--contributors                    显示贡献者
--capitalize                      首字母大写提交说明
--emoji                           标题显示 emoji（可 --no-emoji 关闭）
--group                           按 scope 嵌套分组
--dry                             只生成不发布
--output <path>                   输出到文件
--assets <paths...>               上传发布资产，支持 glob（建议使用引号包裹）
--json                            以 JSON 输出 {md, from, to, ...} 并退出
--print-md                        仅输出生成的 Markdown 并退出
--quiet                           减少日志，便于 CI 捕获输出
```

对比链接说明：

- 文案统一为 `View changes`
- GitHub: `https://{baseUrl}/{repo}/compare/{from}...{to}`
- GitLab: `https://{baseUrl}/{repo}/-/compare/{from}...{to}`

## 环境变量与 Token 读取

- GitHub：`GITHUB_TOKEN`（或通过 `gh auth token` 自动读取）
- GitHub（文件路径）：可使用 `GITHUB_TOKEN_PATH` 指定包含 Token 的文件路径
- GitLab：`GITLAB_TOKEN` 或 `GITLAB_PRIVATE_TOKEN`（或通过 `glab auth token` 自动读取）
- GitLab（文件路径）：可使用 `GITLAB_TOKEN_PATH` 或 `GITLAB_PRIVATE_TOKEN_PATH` 指定包含 Token 的文件路径

未提供 Token 时，将给出网页 URL 以便手动创建 Release。

Tip：`--token` 参数若传入文件路径（如 `/run/secrets/gh_token`），也会自动读取文件内容作为 Token。

## 许可协议

[MIT](./LICENSE)
