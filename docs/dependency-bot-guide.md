# 自动依赖更新 PR 指南

## 背景

给 GitHub 仓库配上自动依赖更新 bot，让它定期扫描依赖文件、发现新版后自动开 PR。你只需 review 合并即可。

主流方案有两个：**Dependabot**（GitHub 内置）和 **Renovate**（社区方案）。

---

## 1. Dependabot — 最小配置

Dependabot 是 GitHub 原生功能，零运维成本。在仓库根目录放 `.github/dependabot.yml` 即可生效。

```yaml
# .github/dependabot.yml
version: 2

updates:
  # npm — 也覆盖 bun lockfile (bun 兼容 npm 格式)
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"

  # GitHub Actions 自身 action 版本
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"

  # Dockerfile 基础镜像
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
```

### 优点

- 无需额外部署，仓库里有配置文件就自动跑
- PR 自动带 changelog 链接
- 支持 security alert 的自动修复 PR

### 局限

| 维度           | 问题                                                                 |
| -------------- | -------------------------------------------------------------------- |
| **bun 支持**       | 没有 `bun` ecosystem，只能走 `npm` 路径解析 `bun.lock`                       |
| **分组能力**       | 不支持将多个依赖合并到一个 PR，版本冲突时 review 成本高                         |
| **Schedule 粒度** | 只有 daily / weekly / monthly，不能自定义具体时间                              |
| **自建 registry** | 不支持企业内部私仓，或需要额外 auth 配置                                          |
| **Monorepo**     | 一个 repo 依赖多个 `package.json` 需手动为每个 directory 写条目，配置膨胀            |
| **PR 标题/标签**   | 自定义能力弱，不能按业务需求定制                                                   |

如果你的项目就在这些局限范围内，Dependabot 够用。但一旦触及以上任一点，就该看 Renovate。

---

## 2. Renovate — 什么时候更适合

Renovate 是一个更强大的开源依赖更新工具，GitHub Marketplace 有 App，也可以自托管。

### 本项目推荐配置

```json
// .github/renovate.json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended"
  ],
  "labels": ["dependencies"],
  "schedule": ["before 9am on Monday"],
  "packageRules": [
    {
      "matchUpdateTypes": ["patch"],
      "automerge": true
    }
  ]
}
```

### Renovate 优势（对比 Dependabot）

| 维度           | Renovate                                                              |
| -------------- | --------------------------------------------------------------------- |
| **bun 原生支持**  | `matchManagers: ["bun"]`，无需 `npm` 兼容层                                    |
| **依赖分组**       | 支持 `groupName` 将多个依赖合并到一个 PR（例如将所有 ESLint 相关包归为一组）            |
| **Schedule 灵活** | 支持 `before 9am on Monday`、`every weekend`、任意 cron 表达式                   |
| **Monorepo**     | 自动发现所有 `package.json` / `bun.lock`，无需手动列举 directory                       |
| **自建 registry** | 通过 `hostRules` 配置企业内部 registry                                           |
| **自定义 PR**     | 可定制 PR 标题、标签、assignee、reviewers 等                                       |
| **Auto-merge**   | patch 版本可自动合并（配合 CI 通过后），减少人工介入                                       |
| **Preset 复用**   | 支持 extends 预设配置，跨仓库共享规则                                               |

### 什么时候必须用 Renovate

- 项目用 **bun** 且不想在配置里写 `npm`（Renovate 原生支持 bun）
- 仓库是 **monorepo**（多个子包共享一个版本门控）
- 需要 **批量升级一组依赖**（如 Vue 全家桶一起升）
- 公司有 **私有 npm registry** 或 Git 依赖
- 需要 **精细的 schedule**（比如只在非工作时间升级 major）
- 需要跨仓库统一 **preset 规则**

### 什么时候 Dependabot 就够了

- 小型公开项目，依赖简单
- 不想额外装一个 GitHub App
- 几个 weekly 版本更新完全可以接受

---

## 总结

```
项目简单 + 无 bun + 无私仓       → Dependabot，一行配置解决
项目复杂 + 用 bun + monorepo/私仓 → Renovate，灵活性碾压
```

本项目用 bun + TypeScript，且未来可能扩展 monorepo 结构，因此选用 **Renovate** 而非 Dependabot。
