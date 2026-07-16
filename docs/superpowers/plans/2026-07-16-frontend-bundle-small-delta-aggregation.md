# Frontend Bundle Small-Delta Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group stable frontend chunks with an absolute size delta of at most `5 B` into a bottom-of-table `(other)` row while preserving complete change counts.

**Architecture:** Keep comparison and summary calculation unchanged, then partition render candidates into significant and small-delta rows. Render individual rows first and append generated/small-delta aggregates after one empty separator row in both full and startup tables.

**Tech Stack:** TypeScript, Node.js test runner, Markdown report generation.

## Global Constraints

- The threshold is inclusive: `Math.abs(afterSize - beforeSize) <= 5` is grouped.
- Summary updated/added/removed counts use all stable changed rows before grouping.
- Full-report candidates are changed stable rows; startup candidates include every stable startup row, including unchanged rows.
- Aggregate order is `(other generated chunks)` followed by `(other)`.
- A single empty Markdown table row separates individual rows from aggregates.
- The existing individual-row limit is applied after small-delta rows are removed.
- Do not run code review or repository-wide lint, per the user's request.

---

### Task 1: Aggregate and move small-delta rows

**Files:**
- Modify: `.github/scripts/frontend-js-size.test.mts`
- Modify: `.github/scripts/frontend-js-size.mts:350-520`
- Verify: `docs/superpowers/specs/2026-07-15-frontend-bundle-generated-chunks-design.md`

**Interfaces:**
- Consumes: stable comparison rows from `getChunkComparisonRows`, physical generated aggregates, and the existing `chunkMarkdownTable` renderer.
- Produces: a `ChunkAggregate` for small-delta rows and Markdown ordered as total, significant rows, separator, generated aggregate, small-delta aggregate.

- [ ] **Step 1: Write the failing end-to-end test**

Add a test based on the existing `fixture` helper. Use an entry delta of `+6 B`, a Vue delta of `+5 B`, unchanged i18n, a `5 B` removed source chunk in the before startup imports, and a `5 B` added source chunk in the after startup imports.

Assert all of the following:

```ts
assert.match(report, /<summary>Chunk size diff \(2 updated, 1 added, 1 removed\)<\/summary>/);
assert.match(report, /<summary>Startup chunk size \(2 updated, 1 added, 1 removed\)<\/summary>/);
assert.match(report, /<summary>`src\/_boot_\.ts`<\/summary>/);
assert.doesNotMatch(report, /<summary>`(?:vue|i18n|src\/added-small\.ts|src\/removed-small\.ts)`<\/summary>/);
assert.match(report, /\| \| \| \| \| \|\n\| \(other generated chunks\) \| 30 B \| 70 B \|[^\n]*\n\| \(other\) \| 45 B \| 50 B \|/);
assert.match(report, /\| \| \| \| \| \|\n\| \(other generated chunks\) \| 30 B \| 70 B \|[^\n]*\n\| \(other\) \| 95 B \| 100 B \|/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test .github/scripts/frontend-js-size.test.mts
```

Expected: the new test fails because `(other)` is absent and `(other generated chunks)` is still directly below `(total)`.

- [ ] **Step 3: Add the small-delta partition and aggregate**

Add a constant and helpers near `ChunkAggregate`:

```ts
const smallDeltaThreshold = 5;

type ChunkComparisonRow = ReturnType<typeof getChunkComparisonRows>[number];

function hasSmallDelta(row: ChunkComparisonRow) {
	return Math.abs(row.afterSize - row.beforeSize) <= smallDeltaThreshold;
}

function comparisonRowsAggregate(rows: ChunkComparisonRow[]): ChunkAggregate {
	return {
		beforeSize: rows.reduce((sum, row) => sum + row.beforeSize, 0),
		afterSize: rows.reduce((sum, row) => sum + row.afterSize, 0),
		beforeCount: rows.filter(row => row.beforeFile != null).length,
		afterCount: rows.filter(row => row.afterFile != null).length,
	};
}
```

Calculate summaries before filtering. Partition `changedRows` and `startupComparisonRows`, aggregate small rows, and apply sorting/30-row limiting only to rows for which `hasSmallDelta` is false.

- [ ] **Step 4: Render aggregate rows at the table bottom**

Extend `chunkMarkdownTable` with an optional `other?: ChunkAggregate`. Render `(total)`, then individual rows. If either aggregate contains chunks, append one `| | | | | |` separator, followed by `(other generated chunks)` and `(other)` when present.

Use the existing numeric formatting for both aggregates:

```ts
`| (other) | ${util.formatBytes(other.beforeSize)} | ${util.formatBytes(other.afterSize)} | ${util.calcAndFormatDeltaBytes(other.beforeSize, other.afterSize, 1000)} | ${util.calcAndFormatDeltaPercent(other.beforeSize, other.afterSize, 0.1).replaceAll('\\%', '\\\\%')} |`
```

Pass the full and startup small-delta aggregates to their corresponding table calls.

- [ ] **Step 5: Run the focused suite and verify GREEN**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test .github/scripts/frontend-js-size.test.mts
```

Expected: all existing tests plus the new test pass with zero failures and clean output.

- [ ] **Step 6: Remove this transient implementation plan and commit**

Delete `docs/superpowers/plans/2026-07-16-frontend-bundle-small-delta-aggregation.md`, then run:

```powershell
git diff --check
git add .github/scripts/frontend-js-size.mts .github/scripts/frontend-js-size.test.mts
git commit -m "fix(dev): group small frontend chunk deltas"
```
