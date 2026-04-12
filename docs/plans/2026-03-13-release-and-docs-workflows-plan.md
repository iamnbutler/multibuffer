# Release & Docs Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

---

### Task 1: Release notes template

**Files:**
- Create: `.github/release-notes-template.md`

Sections for `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}`. Read by the release-deploy workflow; placeholders replaced via shell substitution.

```bash
git add .github/release-notes-template.md
git commit -m "chore: add release notes template"
```

---

### Task 2: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

`workflow_dispatch` workflow. Accepts `bump` input (`major | minor | patch`), increments `package.json` version, creates `release/v{version}` branch, and opens a PR targeting `main`.

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow"
```

---

### Task 3: Release / Deploy workflow

**Files:**
- Create: `.github/workflows/release-deploy.yml`

Triggers on merge of `release/v*` into `main`. Steps: extract version → create+push tag → find previous tag → collect merged PRs (categorized by conventional commit prefix) → run `bun run bench --json` → render release notes from template → create draft GitHub Release → dispatch docs-update.

```bash
git add .github/workflows/release-deploy.yml
git commit -m "ci: add release-deploy workflow"
```

---

### Task 4: Docs / Update agentic workflow

**Files:**
- Create: `.github/workflows/docs-update.md`
- Generated: `.github/workflows/docs-update.lock.yml` (via `gh aw compile`)

Weekly + post-release `gh aw` workflow that reads the codebase to determine truth and updates `README.md`, `CLAUDE.md`, and `docs/*.md`.

```bash
gh aw compile  # generates docs-update.lock.yml
git add .github/workflows/docs-update.md .github/workflows/docs-update.lock.yml
git commit -m "ci: add docs-update agentic workflow"
```

---

### Task 5: Remove `private` from package.json

Delete `"private": true` from `package.json`, then verify:

```bash
bun run typecheck
bun run lint
git add package.json
git commit -m "chore: remove private flag from package.json"
```

---

### Task 6: Verify end-to-end

```bash
git log --oneline main..HEAD  # expect 5 commits
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-deploy.yml'))"
bun run typecheck && bun run lint && bun test
```
