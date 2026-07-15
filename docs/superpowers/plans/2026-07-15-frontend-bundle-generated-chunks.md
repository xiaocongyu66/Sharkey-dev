# Frontend Bundle Generated Chunks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent generated `esm`/`dist`-style chunks from being compared individually while retaining every JavaScript output file in full and startup totals.

**Architecture:** Keep physical chunk accounting separate from stable before/after identities. Source-backed chunks and the explicit `vue`/`i18n` code-splitting groups remain individually comparable; all other generated chunks are grouped into one aggregate row. Exercise the report generator through filesystem fixtures so tests cover manifest parsing, localized file resolution, startup traversal, and Markdown rendering together.

**Tech Stack:** Node.js 26.4, TypeScript `.mts` scripts with native type stripping, Node test runner, Vite manifest JSON, GitHub Actions.

## Global Constraints

- Never compare unrelated generated chunks as the same chunk.
- Keep generated chunks out of the individual chunk-diff rows.
- Preserve the contribution of every physical JavaScript chunk in totals.
- Show the aggregate size change of generated chunks so unexplained bundle growth remains visible.
- Apply the same rules to the full chunk report and the startup chunk report.
- Continue comparing source-backed chunks and intentionally named chunks.
- The only stable generated-name allowlist entries are `vue` and `i18n`.
- Do not infer chunk identity from module-set similarity.
- Do not change the frontend code-splitting strategy or output filenames.
- Do not suppress generated chunks with a name denylist.
- Do not manually edit locale files other than `locales/ja-JP.yml`; this change does not require any locale edit.
- New `.mts` files must include the repository SPDX header.
- This developer-facing report change does not require a `CHANGELOG.md` entry.

## File Structure

- Create `.github/scripts/frontend-js-size.test.mts`: end-to-end fixtures for manifest collection and Markdown output.
- Modify `.github/scripts/frontend-js-size.mts`: physical chunk collection, stable identity classification, generated aggregation, startup accounting, duplicate-key validation, and filename rendering.
- Modify `.github/workflows/lint.yml`: run the focused Node test whenever the report script or its utility changes.
- Reference `docs/superpowers/specs/2026-07-15-frontend-bundle-generated-chunks-design.md`: approved behavior and non-goals; no implementation edit is required.

---

### Task 1: Preserve all physical chunks and aggregate generated chunks

**Files:**
- Create: `.github/scripts/frontend-js-size.test.mts`
- Modify: `.github/scripts/frontend-js-size.mts:39-134`
- Modify: `.github/scripts/frontend-js-size.mts:315-426`

**Interfaces:**
- Consumes: Vite `manifest.json`, localized JavaScript files under `built/_frontend_vite_/ja-JP`, and the existing five CLI arguments of `frontend-js-size.mts`.
- Produces: `CollectedReport` with `chunks: FileEntry[]`, `comparableChunks: Record<string, FileEntry>`, `chunksByManifestKey: Record<string, FileEntry>`, and `startupFiles: string[]`; Markdown with `(total)` and `(other generated chunks)` rows.

- [ ] **Step 1: Write the failing end-to-end test**

Create `.github/scripts/frontend-js-size.test.mts` with this initial content:

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import * as util from './utility.mts';

type Manifest = Record<string, {
	file: string;
	src?: string;
	name?: string;
	isEntry?: boolean;
	imports?: string[];
}>;

const repoDir = path.resolve(import.meta.dirname, '../..');
const reportScript = path.join(repoDir, '.github/scripts/frontend-js-size.mts');

async function writeBuild(repo: string, manifest: Manifest, sizes: Record<string, number>) {
	const outDir = path.join(repo, 'built/_frontend_vite_');
	await fs.mkdir(path.join(outDir, 'ja-JP'), { recursive: true });
	await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));
	for (const [file, size] of Object.entries(sizes)) {
		const localizedFile = file.replace(/^scripts\//, '');
		const outputFile = path.join(outDir, 'ja-JP', localizedFile);
		await fs.mkdir(path.dirname(outputFile), { recursive: true });
		await fs.writeFile(outputFile, Buffer.alloc(size));
	}
}

async function runReport(t: TestContext, before: { manifest: Manifest; sizes: Record<string, number> }, after: { manifest: Manifest; sizes: Record<string, number> }) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frontend-js-size-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const beforeDir = path.join(root, 'before');
	const afterDir = path.join(root, 'after');
	const beforeStats = path.join(root, 'before-stats.json');
	const afterStats = path.join(root, 'after-stats.json');
	const reportFile = path.join(root, 'report.md');
	await writeBuild(beforeDir, before.manifest, before.sizes);
	await writeBuild(afterDir, after.manifest, after.sizes);
	await fs.writeFile(beforeStats, '{}');
	await fs.writeFile(afterStats, '{}');
	await util.run(process.execPath, [reportScript, beforeDir, afterDir, beforeStats, afterStats, reportFile]);
	return fs.readFile(reportFile, 'utf8');
}

function fixture(suffix: string, generatedName: string, sizes: { entry: number; generatedA: number; generatedB: number; vue: number; i18n: number }) {
	const files = {
		entry: `scripts/entry-${suffix}.js`,
		generatedA: `scripts/generated-a-${suffix}.js`,
		generatedB: `scripts/generated-b-${suffix}.js`,
		vue: `scripts/vue-${suffix}.js`,
		i18n: `scripts/i18n-${suffix}.js`,
	};
	return {
		manifest: {
			'src/_boot_.ts': { file: files.entry, src: 'src/_boot_.ts', name: 'entry', isEntry: true, imports: ['_generatedA', '_generatedB', '_vue', '_i18n'] },
			_generatedA: { file: files.generatedA, name: generatedName },
			_generatedB: { file: files.generatedB, name: generatedName },
			_vue: { file: files.vue, name: 'vue' },
			_i18n: { file: files.i18n, name: 'i18n' },
		},
		sizes: Object.fromEntries(Object.entries(files).map(([key, file]) => [file, sizes[key as keyof typeof sizes]])),
	};
}

test('groups generated chunks while preserving full and startup totals', async t => {
	const report = await runReport(
		t,
		fixture('before', 'dist', { entry: 100, generatedA: 10, generatedB: 20, vue: 40, i18n: 50 }),
		fixture('after', 'esm', { entry: 110, generatedA: 30, generatedB: 40, vue: 45, i18n: 50 }),
	);

	assert.match(report, /\| \(total\) \| 220 B \| 275 B \|/);
	assert.equal(report.match(/\| \(other generated chunks\) \| 30 B \| 70 B \|/g)?.length, 2);
	assert.equal(report.match(/_2 before \/ 2 after generated chunks are grouped\._/g)?.length, 2);
	assert.doesNotMatch(report, /<summary>`(?:dist|esm)`<\/summary>/);
	assert.match(report, /<summary>`src\/_boot_\.ts`<\/summary>/);
	assert.match(report, /<summary>`vue`<\/summary>/);
});
```

- [ ] **Step 2: Run the test and verify the current implementation fails**

Run:

```bash
node --test .github/scripts/frontend-js-size.test.mts
```

Expected: FAIL because `(total)` omits one of the duplicate generated-name chunks, no `(other generated chunks)` row exists, and an individual `dist` or `esm` row is rendered.

- [ ] **Step 3: Replace name-based identity with physical accounting and stable classification**

In `.github/scripts/frontend-js-size.mts`, replace `FileEntry`, `stableChunkKey`, `collectStartupKeys`, and `collectReport` with these structures and functions while retaining the existing `resolveBuiltFile` function:

```ts
const stableNamedChunks = new Set(['vue', 'i18n']);

type FileEntry = {
	comparisonKey: string | null;
	displayName: string;
	file: string;
	manifestKeys: string[];
	size: number;
};

type CollectedReport = {
	manifest: Manifest;
	chunks: FileEntry[];
	comparableChunks: Record<string, FileEntry>;
	chunksByManifestKey: Record<string, FileEntry>;
	startupFiles: string[];
};

function stableChunkKey(chunk: Manifest[string]) {
	if (chunk.src != null) return `src:${util.normalizePath(chunk.src)}`;
	if (chunk.name != null && stableNamedChunks.has(chunk.name)) return `named:${chunk.name}`;
	return null;
}

function collectStartupManifestKeys(manifest: Manifest) {
	const entryKey = findEntryKey(manifest);
	const keys = new Set<string>();
	if (entryKey == null) return keys;

	function visit(key: string) {
		if (keys.has(key)) return;
		const chunk = manifest[key];
		if (!chunk || !chunk.file?.endsWith('.js')) return;
		keys.add(key);
		for (const importKey of chunk.imports ?? []) visit(importKey);
	}

	visit(entryKey);
	return keys;
}

async function collectReport(repoDir: string): Promise<CollectedReport> {
	const outDir = path.join(repoDir, 'built/_frontend_vite_');
	const manifestPath = path.join(outDir, 'manifest.json');
	const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Manifest;
	const chunksByFile = new Map<string, FileEntry>();
	const comparableChunks = new Map<string, FileEntry>();
	const chunksByManifestKey = new Map<string, FileEntry>();

	for (const [manifestKey, chunk] of Object.entries(manifest)) {
		if (!chunk.file?.endsWith('.js')) continue;
		const builtFile = await resolveBuiltFile(outDir, chunk.file);
		const comparisonKey = stableChunkKey(chunk);
		let entry = chunksByFile.get(builtFile.relativePath);
		if (entry == null) {
			entry = {
				comparisonKey,
				displayName: chunk.src ?? chunk.name ?? manifestKey,
				file: builtFile.relativePath,
				manifestKeys: [manifestKey],
				size: await util.fileSize(builtFile.absolutePath),
			};
			chunksByFile.set(entry.file, entry);
		} else if (entry.comparisonKey !== comparisonKey) {
			throw new Error(`Conflicting identities for ${entry.file}`);
		} else {
			entry.manifestKeys.push(manifestKey);
		}
		chunksByManifestKey.set(manifestKey, entry);
		if (comparisonKey != null) {
			const existing = comparableChunks.get(comparisonKey);
			if (existing != null && existing.file !== entry.file) {
				throw new Error(`Duplicate stable chunk key "${comparisonKey}": ${existing.file}, ${entry.file}`);
			}
			comparableChunks.set(comparisonKey, entry);
		}
	}

	const localeDir = path.join(outDir, locale);
	if (await util.fileExists(localeDir)) {
		for await (const fullPath of util.traverseDirectory(localeDir)) {
			if (!fullPath.endsWith('.js')) continue;
			const relativePath = util.normalizePath(path.relative(outDir, fullPath));
			if (chunksByFile.has(relativePath)) continue;
			chunksByFile.set(relativePath, {
				comparisonKey: null,
				displayName: relativePath,
				file: relativePath,
				manifestKeys: [],
				size: await util.fileSize(fullPath),
			});
		}
	}

	const startupFiles = new Set<string>();
	for (const manifestKey of collectStartupManifestKeys(manifest)) {
		const entry = chunksByManifestKey.get(manifestKey);
		if (entry != null) startupFiles.add(entry.file);
	}

	return {
		manifest,
		chunks: [...chunksByFile.values()],
		comparableChunks: Object.fromEntries(comparableChunks),
		chunksByManifestKey: Object.fromEntries(chunksByManifestKey),
		startupFiles: [...startupFiles],
	};
}
```

- [ ] **Step 4: Update comparison rows and table rendering**

Change `getChunkComparisonRows` to consume comparable maps and retain both filenames:

```ts
function getChunkComparisonRows(keys: string[], before: Record<string, FileEntry>, after: Record<string, FileEntry>) {
	return keys.map(key => {
		const beforeEntry = before[key];
		const afterEntry = after[key];
		const beforeSize = beforeEntry?.size ?? 0;
		const afterSize = afterEntry?.size ?? 0;
		return {
			key,
			name: entryDisplayName(beforeEntry ?? afterEntry),
			beforeFile: beforeEntry?.file,
			afterFile: afterEntry?.file,
			beforeSize,
			afterSize,
			changeType: beforeEntry == null ? 'added' : afterEntry == null ? 'removed' : beforeSize !== afterSize ? 'updated' : 'unchanged',
			sortSize: Math.max(beforeSize, afterSize),
		};
	});
}

type ChunkAggregate = {
	beforeSize: number;
	afterSize: number;
	beforeCount: number;
	afterCount: number;
};

function sumChunkSizes(chunks: FileEntry[]) {
	return chunks.reduce((sum, chunk) => sum + chunk.size, 0);
}

function generatedAggregate(before: FileEntry[], after: FileEntry[]): ChunkAggregate {
	const beforeGenerated = before.filter(chunk => chunk.comparisonKey == null);
	const afterGenerated = after.filter(chunk => chunk.comparisonKey == null);
	return {
		beforeSize: sumChunkSizes(beforeGenerated),
		afterSize: sumChunkSizes(afterGenerated),
		beforeCount: beforeGenerated.length,
		afterCount: afterGenerated.length,
	};
}

function comparableMap(chunks: FileEntry[]) {
	const entries: [string, FileEntry][] = [];
	for (const chunk of chunks) {
		if (chunk.comparisonKey != null) entries.push([chunk.comparisonKey, chunk]);
	}
	return Object.fromEntries(entries);
}
```

Replace `chunkMarkdownTable` with this version, which adds a third `generated` argument:

```ts
function chunkMarkdownTable(
	rows: ReturnType<typeof getChunkComparisonRows>,
	total?: { beforeSize: number; afterSize: number },
	generated?: ChunkAggregate,
) {
	if (rows.length === 0 && total == null && generated == null) return '_No data_';

	const lines = [
		'| Chunk | Before | After | Δ | Δ (%) |',
		'| --- | ---: | ---: | ---: | ---: |',
	];
	let hasSummaryRow = false;
	if (total != null) {
		lines.push(`| (total) | ${util.formatBytes(total.beforeSize)} | ${util.formatBytes(total.afterSize)} | ${util.calcAndFormatDeltaBytes(total.beforeSize, total.afterSize, 1000)} | ${util.calcAndFormatDeltaPercent(total.beforeSize, total.afterSize, 0.1).replaceAll('\\%', '\\\\%')} |`);
		hasSummaryRow = true;
	}
	if (generated != null && (generated.beforeCount > 0 || generated.afterCount > 0)) {
		lines.push(`| (other generated chunks) | ${util.formatBytes(generated.beforeSize)} | ${util.formatBytes(generated.afterSize)} | ${util.calcAndFormatDeltaBytes(generated.beforeSize, generated.afterSize, 1000)} | ${util.calcAndFormatDeltaPercent(generated.beforeSize, generated.afterSize, 0.1).replaceAll('\\%', '\\\\%')} |`);
		hasSummaryRow = true;
	}
	if (hasSummaryRow && rows.length > 0) lines.push('| | | | | |');

	for (const row of rows) {
		const chunkFile = row.beforeFile ?? row.afterFile ?? '';
		if (row.changeType === 'added') {
			lines.push(`| <details><summary>\`${escapeCell(row.name)}\`</summary> \`${escapeCell(chunkFile)}\` </details> | ${util.formatBytes(row.beforeSize)} | ${util.formatBytes(row.afterSize)} | ${util.calcAndFormatDeltaBytes(row.beforeSize, row.afterSize, 1000)} | $\\color{orange}{\\text{( + )}}$ |`);
		} else if (row.changeType === 'removed') {
			lines.push(`| <details><summary>\`${escapeCell(row.name)}\`</summary> \`${escapeCell(chunkFile)}\` </details> | ${util.formatBytes(row.beforeSize)} | ${util.formatBytes(row.afterSize)} | ${util.calcAndFormatDeltaBytes(row.beforeSize, row.afterSize, 1000)} | $\\color{green}{\\text{( - )}}$ |`);
		} else {
			lines.push(`| <details><summary>\`${escapeCell(row.name)}\`</summary> \`${escapeCell(chunkFile)}\` </details> | ${util.formatBytes(row.beforeSize)} | ${util.formatBytes(row.afterSize)} | ${util.calcAndFormatDeltaBytes(row.beforeSize, row.afterSize, 1000)} | ${util.calcAndFormatDeltaPercent(row.beforeSize, row.afterSize, 0.1).replaceAll('\\%', '\\\\%')} |`);
		}
	}
	if (generated != null && (generated.beforeCount > 0 || generated.afterCount > 0)) {
		lines.push('');
		lines.push(`_${generated.beforeCount} before / ${generated.afterCount} after generated chunks are grouped._`);
	}
	return lines.join('\n');
}
```

Update `renderFrontendChunkReport` so the full report uses all physical chunks for totals, stable maps for rows, and unidentifiable chunks for the aggregate:

```ts
const beforeComparable = before.comparableChunks;
const afterComparable = after.comparableChunks;
const allChunkKeys = [...new Set([...Object.keys(beforeComparable), ...Object.keys(afterComparable)])];
const allComparisonRows = getChunkComparisonRows(allChunkKeys, beforeComparable, afterComparable);
const diffTotal = {
	beforeSize: sumChunkSizes(before.chunks),
	afterSize: sumChunkSizes(after.chunks),
};
const diffGenerated = generatedAggregate(before.chunks, after.chunks);
```

For startup accounting, filter physical chunks by `startupFiles`, rebuild comparable maps from those filtered arrays, and calculate totals and aggregate from the filtered arrays:

```ts
const beforeStartupFiles = new Set(before.startupFiles);
const afterStartupFiles = new Set(after.startupFiles);
const beforeStartupChunks = before.chunks.filter(chunk => beforeStartupFiles.has(chunk.file));
const afterStartupChunks = after.chunks.filter(chunk => afterStartupFiles.has(chunk.file));
const beforeStartupComparable = comparableMap(beforeStartupChunks);
const afterStartupComparable = comparableMap(afterStartupChunks);
const startupKeys = [...new Set([...Object.keys(beforeStartupComparable), ...Object.keys(afterStartupComparable)])];
const startupComparisonRows = getChunkComparisonRows(startupKeys, beforeStartupComparable, afterStartupComparable);
const startupTotal = {
	beforeSize: sumChunkSizes(beforeStartupChunks),
	afterSize: sumChunkSizes(afterStartupChunks),
};
const startupGenerated = generatedAggregate(beforeStartupChunks, afterStartupChunks);
```

Pass the aggregates with these exact calls:

```ts
chunkMarkdownTable(diffRows, diffTotal, diffGenerated)
chunkMarkdownTable(startupRows, startupTotal, startupGenerated)
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
node --test .github/scripts/frontend-js-size.test.mts
```

Expected: PASS with `1` test and `0` failures. The Markdown contains two aggregate rows because the fixture makes all chunks startup chunks as well as full-report chunks.

- [ ] **Step 6: Commit the physical-accounting change**

```bash
git add .github/scripts/frontend-js-size.mts .github/scripts/frontend-js-size.test.mts
git commit -m "fix(dev): aggregate generated frontend chunks"
```

---

### Task 2: Reject duplicate stable identities and render honest filenames

**Files:**
- Modify: `.github/scripts/frontend-js-size.test.mts`
- Modify: `.github/scripts/frontend-js-size.mts:315-372`

**Interfaces:**
- Consumes: the `Duplicate stable chunk key` validation and comparison rows produced in Task 1.
- Produces: a fatal diagnostic for duplicate `src`/allowlisted identities and a file label that renders `before → after` when hashes differ.

- [ ] **Step 1: Add failing coverage for duplicate stable names and filename changes**

Append these tests to `.github/scripts/frontend-js-size.test.mts`:

```ts
test('fails instead of overwriting duplicate stable chunk keys', async t => {
	const duplicateVue = fixture('before', 'dist', { entry: 100, generatedA: 10, generatedB: 20, vue: 40, i18n: 50 });
	duplicateVue.manifest._vueDuplicate = { file: 'scripts/vue-duplicate-before.js', name: 'vue' };
	duplicateVue.sizes['scripts/vue-duplicate-before.js'] = 60;

	await assert.rejects(
		runReport(t, duplicateVue, fixture('after', 'esm', { entry: 110, generatedA: 30, generatedB: 40, vue: 45, i18n: 50 })),
		/Duplicate stable chunk key "named:vue".*vue-before\.js.*vue-duplicate-before\.js/,
	);
});

test('shows both filenames for an updated stable chunk', async t => {
	const report = await runReport(
		t,
		fixture('before', 'dist', { entry: 100, generatedA: 10, generatedB: 20, vue: 40, i18n: 50 }),
		fixture('after', 'esm', { entry: 110, generatedA: 30, generatedB: 40, vue: 45, i18n: 50 }),
	);

	assert.match(report, /`ja-JP\/entry-before\.js → ja-JP\/entry-after\.js`/);
	assert.match(report, /`ja-JP\/vue-before\.js → ja-JP\/vue-after\.js`/);
});
```

- [ ] **Step 2: Run the tests and confirm the filename test fails**

Run:

```bash
node --test .github/scripts/frontend-js-size.test.mts
```

Expected: the duplicate-key test passes using Task 1 validation, while `shows both filenames for an updated stable chunk` fails because the table still shows only one file.

- [ ] **Step 3: Render both filenames without changing identity logic**

Add this helper near `chunkMarkdownTable`:

```ts
function chunkFileDisplay(row: ReturnType<typeof getChunkComparisonRows>[number]) {
	if (row.beforeFile == null) return row.afterFile ?? '';
	if (row.afterFile == null || row.beforeFile === row.afterFile) return row.beforeFile;
	return `${row.beforeFile} → ${row.afterFile}`;
}
```

At the start of each `for (const row of rows)` iteration, compute:

```ts
const chunkFile = chunkFileDisplay(row);
```

Replace every `${escapeCell(row.chunkFile)}` interpolation in the three row variants with `${escapeCell(chunkFile)}`. Do not display any representative filename on the aggregate row.

- [ ] **Step 4: Run all focused tests**

Run:

```bash
node --test .github/scripts/frontend-js-size.test.mts
```

Expected: PASS with `3` tests and `0` failures.

- [ ] **Step 5: Commit the validation and display behavior**

```bash
git add .github/scripts/frontend-js-size.mts .github/scripts/frontend-js-size.test.mts
git commit -m "fix(dev): clarify frontend chunk comparisons"
```

---

### Task 3: Run the report regression test in CI

**Files:**
- Modify: `.github/workflows/lint.yml:3-33`
- Modify: `.github/workflows/lint.yml:139`

**Interfaces:**
- Consumes: `.github/scripts/frontend-js-size.test.mts` from Tasks 1 and 2.
- Produces: a `frontend-bundle-report-test` GitHub Actions job using the repository's `.node-version`.

- [ ] **Step 1: Verify the focused test is not currently referenced by CI**

Run:

```bash
rg -n "frontend-js-size.test|frontend-bundle-report-test" .github/workflows
```

Expected: no matches.

- [ ] **Step 2: Add report-script paths to both lint workflow filters**

Under both `on.push.paths` and `on.pull_request.paths` in `.github/workflows/lint.yml`, add:

```yaml
      - .github/scripts/frontend-js-size*.mts
      - .github/scripts/utility.mts
```

Keep `.github/workflows/lint.yml` itself in both filters.

- [ ] **Step 3: Add a focused CI job**

Append this job under `jobs` at the same level as `check-dts`:

```yaml
  frontend-bundle-report-test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v6.0.3
    - uses: actions/setup-node@v6.4.0
      with:
        node-version-file: '.node-version'
    - run: node --test .github/scripts/frontend-js-size.test.mts
```

This job intentionally does not depend on `pnpm_install` because the test and report generator use only Node built-ins and the local `utility.mts` module.

- [ ] **Step 4: Run the exact CI test command locally**

Run:

```bash
node --test .github/scripts/frontend-js-size.test.mts
```

Expected: PASS with `3` tests and `0` failures.

- [ ] **Step 5: Confirm CI now references the test exactly once**

Run:

```bash
rg -n "node --test \.github/scripts/frontend-js-size\.test\.mts" .github/workflows/lint.yml
```

Expected: one match in the `frontend-bundle-report-test` job.

- [ ] **Step 6: Commit the CI coverage**

```bash
git add .github/workflows/lint.yml
git commit -m "test(dev): check frontend bundle report"
```

---

### Task 4: Complete Misskey pre-ship validation

**Files:**
- Verify: `.github/scripts/frontend-js-size.mts`
- Verify: `.github/scripts/frontend-js-size.test.mts`
- Verify: `.github/workflows/lint.yml`
- Verify: `docs/superpowers/specs/2026-07-15-frontend-bundle-generated-chunks-design.md`

**Interfaces:**
- Consumes: all implementation and CI changes from Tasks 1-3.
- Produces: fresh evidence that focused behavior, repository lint, SPDX, locale safety, and final diff checks pass.

- [ ] **Step 1: Run the focused regression tests**

Run:

```bash
node --test .github/scripts/frontend-js-size.test.mts
```

Expected: PASS with `3` tests and `0` failures.

- [ ] **Step 2: Run repository lint**

Run:

```bash
pnpm lint
```

Expected: exit code `0`. If an unrelated pre-existing failure occurs, record its exact command and output rather than claiming lint passed.

- [ ] **Step 3: Check the new file's SPDX header**

Run:

```bash
rg -n "SPDX-FileCopyrightText: syuilo and misskey-project|SPDX-License-Identifier: AGPL-3.0-only" .github/scripts/frontend-js-size.test.mts
```

Expected: two matches, one for each required SPDX line.

- [ ] **Step 4: Verify locale safety and unchanged migration/API surfaces**

Run:

```bash
git diff --name-only develop -- locales
git diff --name-only develop -- packages/backend/migration packages/backend/src packages/misskey-js/src/autogen
```

Expected: both commands produce no output. Therefore locale generation, migration checking, backend API review, and misskey-js regeneration are not applicable.

- [ ] **Step 5: Verify the final diff and worktree**

Run:

```bash
git diff --check develop...HEAD
git status --short
git log --oneline develop..HEAD
```

Expected: `git diff --check` exits `0`, `git status --short` is empty, and the log contains the approved design commit plus the three implementation commits from this plan.

- [ ] **Step 6: Review the final report behavior against the approved design**

Confirm all of these from the focused test output and diff:

```text
[x] Physical chunks are counted once by output path.
[x] Only src-backed, vue, and i18n chunks are individually compared.
[x] Generated chunks are aggregated in full and startup reports.
[x] Duplicate stable keys fail instead of overwriting.
[x] Updated stable rows show before and after filenames.
[x] No locale, migration, backend API, frontend Vue, or user-facing behavior changed.
[x] No CHANGELOG entry is needed.
```
