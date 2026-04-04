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

**Step 1: Create the template**

```markdown
## What's Changed

{{changes}}

## Benchmarks

{{benchmarks}}

**Full Changelog**: {{compare_url}}
```

This file is read by the release-deploy workflow and populated with real data. The placeholders are replaced via `sed` in the workflow.

**Step 2: Commit**

```bash
git add .github/release-notes-template.md
git commit -m "chore: add release notes template"
```

---

### Task 2: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Create the workflow**

See `.github/workflows/release.yml`.

**Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow"
```

---

### Task 3: Release / Deploy workflow

**Files:**
- Create: `.github/workflows/release-deploy.yml`

This workflow triggers when a `release/v*` PR merges. It:
1. Creates and pushes a git tag
2. Collects merged PRs since the previous tag
3. Runs benchmarks
4. Renders release notes from template
5. Creates a draft GitHub Release
6. Dispatches the docs-update workflow

**Step 1: Create the workflow**

See `.github/workflows/release-deploy.yml`.

**Step 2: Commit**

```bash
git add .github/workflows/release-deploy.yml
git commit -m "ci: add release-deploy workflow"
```

---

### Task 4: Docs / Update agentic workflow

**Files:**
- Create: `.github/workflows/docs-update.md`

**Step 1: Create the `gh aw` workflow definition**

See `.github/workflows/docs-update.md`.

**Step 2: Compile the workflow**

Run: `gh aw compile`

This generates `.github/workflows/docs-update.lock.yml`. If `gh aw` is not available in your environment, note this step for the user to run manually.

**Step 3: Commit**

```bash
git add .github/workflows/docs-update.md .github/workflows/docs-update.lock.yml
git commit -m "ci: add docs-update agentic workflow"
```

---

### Task 5: Remove `private` from package.json

**Files:**
- Modify: `package.json:36` (the `"private": true` line)

**Step 1: Remove the private field**

In `package.json`, delete the line:
```json
"private": true,
```

**Step 2: Run checks**

```bash
bun run typecheck
bun run lint
```

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: remove private flag from package.json"
```

---

### Task 6: Verify end-to-end

**Step 1: Review all new files**

```bash
git log --oneline main..HEAD
```

Expected: 5 commits (template, release, release-deploy, docs-update, package.json).

**Step 2: Validate workflow YAML syntax**

```bash
# Quick syntax check — these should parse without error
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" 2>/dev/null || echo "Install PyYAML or skip"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-deploy.yml'))" 2>/dev/null || echo "Install PyYAML or skip"
```

**Step 3: Verify CI still passes**

```bash
bun run typecheck
bun run lint
bun test
```

**Step 4: Final commit (if any fixes needed)**

Only if previous steps revealed issues.
