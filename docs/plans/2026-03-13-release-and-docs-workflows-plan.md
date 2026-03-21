# Release & Docs Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

---

### Task 1: Release notes template → `.github/release-notes-template.md`

**Step 1: Create the template**

```markdown
## What's Changed

{{changes}}

## Benchmarks

{{benchmarks}}

**Full Changelog**: {{compare_url}}
```

This file is read by the release-deploy workflow and populated with real data. The placeholders are replaced via `sed` in the workflow.

Commit: `git add .github/release-notes-template.md && git commit -m "chore: add release notes template"`

---

### Task 2: Release workflow → `.github/workflows/release.yml`

**Step 1: Create the workflow**

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      bump:
        description: "Version bump type"
        required: true
        type: choice
        options:
          - patch
          - minor
          - major

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    name: Create release PR
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Get current version
        id: current
        run: |
          VERSION=$(jq -r '.version' package.json)
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"

      - name: Compute new version
        id: next
        run: |
          IFS='.' read -r major minor patch <<< "${{ steps.current.outputs.version }}"
          case "${{ inputs.bump }}" in
            major) major=$((major + 1)); minor=0; patch=0 ;;
            minor) minor=$((minor + 1)); patch=0 ;;
            patch) patch=$((patch + 1)) ;;
          esac
          echo "version=${major}.${minor}.${patch}" >> "$GITHUB_OUTPUT"

      - name: Create release branch
        run: |
          git checkout -b "release/v${{ steps.next.outputs.version }}"

      - name: Bump version in package.json
        run: |
          jq --arg v "${{ steps.next.outputs.version }}" '.version = $v' package.json > package.json.tmp
          mv package.json.tmp package.json

      - name: Commit and push
        run: |
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git config user.name "github-actions[bot]"
          git add package.json
          git commit -m "release: v${{ steps.next.outputs.version }}"
          git push origin "release/v${{ steps.next.outputs.version }}"

      - name: Create PR
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh pr create \
            --title "release: v${{ steps.next.outputs.version }}" \
            --body "Bumps version from ${{ steps.current.outputs.version }} to ${{ steps.next.outputs.version }}." \
            --base main \
            --head "release/v${{ steps.next.outputs.version }}"
```

Commit: `git add .github/workflows/release.yml && git commit -m "ci: add release workflow"`

---

### Task 3: Release / Deploy workflow → `.github/workflows/release-deploy.yml`

This workflow triggers when a `release/v*` PR merges. It:
1. Creates and pushes a git tag
2. Collects merged PRs since the previous tag
3. Runs benchmarks
4. Renders release notes from template
5. Creates a draft GitHub Release
6. Dispatches the docs-update workflow

**Step 1: Create the workflow**

```yaml
name: Release / Deploy

on:
  pull_request:
    types: [closed]
    branches: [main]

permissions:
  contents: write
  actions: write

jobs:
  release:
    name: Tag and create release
    if: github.event.pull_request.merged == true && startsWith(github.event.pull_request.head.ref, 'release/v')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Extract version
        id: version
        run: |
          VERSION=$(jq -r '.version' package.json)
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "tag=v$VERSION" >> "$GITHUB_OUTPUT"

      - name: Create and push tag
        run: |
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git config user.name "github-actions[bot]"
          git tag "${{ steps.version.outputs.tag }}"
          git push origin "${{ steps.version.outputs.tag }}"

      - name: Find previous tag
        id: prev
        run: |
          PREV=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
          echo "tag=$PREV" >> "$GITHUB_OUTPUT"
          if [ -n "$PREV" ]; then
            PREV_DATE=$(git log -1 --format=%aI "$PREV")
            echo "date=$PREV_DATE" >> "$GITHUB_OUTPUT"
          fi

      - name: Collect merged PRs
        id: changes
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          REPO="${{ github.repository }}"

          if [ -n "${{ steps.prev.outputs.date }}" ]; then
            SEARCH="repo:${REPO} is:pr is:merged merged:>${{ steps.prev.outputs.date }}"
          else
            SEARCH="repo:${REPO} is:pr is:merged"
          fi

          # Fetch PRs as JSON, excluding the release PR itself
          PRS=$(gh pr list --search "$SEARCH" --json number,title,author --limit 100 \
            | jq -c '[.[] | select(.title | startswith("release:") | not)]')

          # Categorize
          FEATURES=$(echo "$PRS" | jq -r '.[] | select(.title | test("^feat")) | "- \(.title) (#\(.number)) @\(.author.login)"')
          FIXES=$(echo "$PRS" | jq -r '.[] | select(.title | test("^fix")) | "- \(.title) (#\(.number)) @\(.author.login)"')
          PERF=$(echo "$PRS" | jq -r '.[] | select(.title | test("^perf")) | "- \(.title) (#\(.number)) @\(.author.login)"')
          OTHER=$(echo "$PRS" | jq -r '.[] | select(.title | test("^(feat|fix|perf)") | not) | "- \(.title) (#\(.number)) @\(.author.login)"')

          # Build changes section
          CHANGES=""
          if [ -n "$FEATURES" ]; then
            CHANGES="${CHANGES}### Features\n\n${FEATURES}\n\n"
          fi
          if [ -n "$FIXES" ]; then
            CHANGES="${CHANGES}### Fixes\n\n${FIXES}\n\n"
          fi
          if [ -n "$PERF" ]; then
            CHANGES="${CHANGES}### Performance\n\n${PERF}\n\n"
          fi
          if [ -n "$OTHER" ]; then
            CHANGES="${CHANGES}### Other\n\n${OTHER}\n\n"
          fi

          if [ -z "$CHANGES" ]; then
            CHANGES="No categorized changes."
          fi

          # Write to file to avoid shell escaping issues
          echo -e "$CHANGES" > /tmp/changes.md

      - name: Run benchmarks
        run: |
          bun run bench --json > /tmp/bench-results.json

      - name: Format benchmark table
        run: |
          jq -r '
            ["| Suite | Benchmark | avg | ops/sec | target | status |",
             "|-------|-----------|-----|---------|--------|--------|"] +
            [.[] | .suite as $s | .results[] |
              "| \($s) | \(.name) | \(
                if .avgMs < 0.01 then "\(.avgMs * 1000 | round)µs"
                else "\(.avgMs | . * 1000 | round / 1000)ms" end
              ) | \(.opsPerSec | round | tostring |
                # Add thousands separators
                split("") | reverse | [foreach .[] as $c (
                  {i: 0, out: []};
                  .i += 1 | if .i > 3 and (.i % 3 == 1) then .out += [",", $c] else .out += [$c] end;
                  .out
                )] | last | reverse | join("")
              ) | \(if .targetMs then "<\(.targetMs)ms" else "-" end) | \(if .passed then "pass" else "FAIL" end) |"
            ] | .[]
          ' /tmp/bench-results.json > /tmp/benchmarks.md

      - name: Render release notes
        run: |
          COMPARE_URL="https://github.com/${{ github.repository }}/compare/${{ steps.prev.outputs.tag }}...${{ steps.version.outputs.tag }}"
          if [ -z "${{ steps.prev.outputs.tag }}" ]; then
            COMPARE_URL="https://github.com/${{ github.repository }}/commits/${{ steps.version.outputs.tag }}"
          fi

          TEMPLATE=$(cat .github/release-notes-template.md)
          CHANGES=$(cat /tmp/changes.md)
          BENCHMARKS=$(cat /tmp/benchmarks.md)

          NOTES="${TEMPLATE}"
          NOTES="${NOTES//\{\{changes\}\}/$CHANGES}"
          NOTES="${NOTES//\{\{benchmarks\}\}/$BENCHMARKS}"
          NOTES="${NOTES//\{\{compare_url\}\}/$COMPARE_URL}"

          echo "$NOTES" > /tmp/release-notes.md

      - name: Create draft release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "${{ steps.version.outputs.tag }}" \
            --draft \
            --title "${{ steps.version.outputs.tag }}" \
            --notes-file /tmp/release-notes.md

      - name: Dispatch docs-update
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh workflow run docs-update.lock.yml || true
```

Commit: `git add .github/workflows/release-deploy.yml && git commit -m "ci: add release-deploy workflow"`

---

### Task 4: Docs / Update agentic workflow → `.github/workflows/docs-update.md`

**Step 1: Create the `gh aw` workflow definition**

See `.github/workflows/docs-update.md` for the complete workflow definition.

**Step 2: Compile the workflow**

Run: `gh aw compile`

This generates `.github/workflows/docs-update.lock.yml`. If `gh aw` is not available in your environment, note this step for the user to run manually.

**Step 3: Commit**

Commit: `git add .github/workflows/docs-update.md .github/workflows/docs-update.lock.yml && git commit -m "ci: add docs-update agentic workflow"`

---

### Task 5: Remove `private` from package.json

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

**Step 3: Commit:** `git add package.json && git commit -m "chore: remove private flag from package.json"`

---

### Task 6: Verify end-to-end

**Step 1: Review all new files**

```bash
git log --oneline main..HEAD
```

Expected: 5 commits (template, release, release-deploy, docs-update, package.json).

**Step 2: Validate workflow YAML syntax** (requires PyYAML)

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-deploy.yml'))"
```

**Step 3: Verify CI still passes**

```bash
bun run typecheck
bun run lint
bun test
```

