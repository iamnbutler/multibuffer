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

A markdown template with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders, replaced by the release-deploy workflow via `sed`. See `.github/release-notes-template.md` for the implemented version.

```bash
git add .github/release-notes-template.md
git commit -m "chore: add release notes template"
```

---

### Task 2: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

A `workflow_dispatch` workflow with a `bump` input (`patch`/`minor`/`major`). Reads the current version from `package.json`, computes the next version, creates a `release/vX.Y.Z` branch, bumps `package.json`, and opens a PR. See `.github/workflows/release.yml` for the implemented version.

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow"
```

---

### Task 3: Release / Deploy workflow

**Files:**
- Create: `.github/workflows/release-deploy.yml`

Triggers when a `release/v*` PR merges into `main`. Steps:
1. Creates and pushes a git tag.
2. Collects merged PRs since the previous tag, categorized by conventional-commit prefix.
3. Runs `bun run bench --json` and formats a markdown table.
4. Renders release notes from the template with real data.
5. Creates a draft GitHub Release.
6. Dispatches the docs-update workflow.

See `.github/workflows/release-deploy.yml` for the implemented version.

```bash
git add .github/workflows/release-deploy.yml
git commit -m "ci: add release-deploy workflow"
```

---

### Task 4: Docs / Update agentic workflow

**Files:**
- Create: `.github/workflows/docs-update.md`

A `gh aw` workflow that keeps `README.md`, `CLAUDE.md`, and `docs/*.md` accurate and terse. Runs weekly, after releases, or on manual dispatch. Reads the codebase to determine truth, identifies stale content, and creates a PR with minimal targeted updates. See `.github/workflows/docs-update.md` for the implemented version.

```bash
gh aw compile   # generates docs-update.lock.yml; run manually if gh aw unavailable
git add .github/workflows/docs-update.md .github/workflows/docs-update.lock.yml
git commit -m "ci: add docs-update agentic workflow"
```

---

### Task 5: Remove `private` from package.json

**Files:**
- Modify: `package.json` (the `"private": true` line)

Delete:
```json
"private": true,
```

Then verify:

```bash
bun run typecheck
bun run lint
git add package.json
git commit -m "chore: remove private flag from package.json"
```

---

### Task 6: Verify end-to-end

```bash
git log --oneline main..HEAD
# Expected: 5 commits (template, release, release-deploy, docs-update, package.json)

python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" 2>/dev/null || echo "skip"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-deploy.yml'))" 2>/dev/null || echo "skip"

bun run typecheck && bun run lint && bun test
```

Only create a follow-up commit if the above steps reveal issues.
