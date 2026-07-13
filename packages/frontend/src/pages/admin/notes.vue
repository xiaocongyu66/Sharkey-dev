<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs" v-model:tab="viewTab">
	<div class="_spacer" style="--MI_SPACER-w: 860px;">
		<div class="_gaps">
			<MkFolder :defaultOpen="false">
				<template #icon><i class="ti ti-ban"></i></template>
				<template #label>{{ an.siteWide }}</template>
				<div class="_gaps">
					<MkInfo>{{ an.siteWideCaption }}</MkInfo>
					<MkSwitch :modelValue="disableLocalNoteCreation" @update:modelValue="onToggleDisablePosting">
						<template #label>{{ an.disableLocalNoteCreation }}</template>
						<template #caption>{{ an.disableLocalNoteCreationCaption }}</template>
					</MkSwitch>
					<MkSwitch :modelValue="blockRemoteNotes" @update:modelValue="onToggleBlockRemote">
						<template #label>{{ an.blockRemoteNotes }}</template>
						<template #caption>{{ an.blockRemoteNotesCaption }}</template>
					</MkSwitch>
				</div>
			</MkFolder>

			<!-- Keyword block: multi-format (space=AND, newline=OR, /regex/) -->
			<MkFolder :defaultOpen="false">
				<template #icon><i class="ti ti-message-x"></i></template>
				<template #label>{{ an.keywordBlock }}</template>
				<div class="_gaps">
					<MkInfo>{{ an.keywordBlockCaption }}</MkInfo>
					<MkTextarea v-model="prohibitedWords">
						<template #label>{{ an.prohibitedWords }}</template>
						<template #caption>{{ an.prohibitedWordsCaption }}</template>
					</MkTextarea>
					<SkPatternTest :mutedWords="prohibitedWords"/>
					<MkTextarea v-model="sensitiveWords">
						<template #label>{{ an.sensitiveWords }}</template>
						<template #caption>{{ an.sensitiveWordsCaption }}</template>
					</MkTextarea>
					<SkPatternTest :mutedWords="sensitiveWords"/>
					<MkButton primary @click="saveKeywordBlocks">{{ i18n.ts.save }}</MkButton>
				</div>
			</MkFolder>

			<!-- Filters -->
			<div class="_panel" style="padding: 12px 14px;">
				<div class="_gaps_s">
					<div style="display: flex; flex-wrap: wrap; gap: 10px;">
						<MkInput v-model="username" :debounce="true" type="search" style="margin: 0; flex: 1; min-width: 120px;">
							<template #label>{{ an.filterUsername }}</template>
						</MkInput>
						<MkInput v-if="iAmAdmin" v-model="email" :debounce="true" type="search" style="margin: 0; flex: 1; min-width: 120px;">
							<template #label>{{ an.filterEmail }}</template>
						</MkInput>
						<MkInput v-model="query" :debounce="true" type="search" style="margin: 0; flex: 1; min-width: 120px;">
							<template #label>{{ i18n.ts.search }}</template>
						</MkInput>
					</div>
					<div v-if="iAmAdmin" style="display: flex; flex-wrap: wrap; gap: 10px;">
						<MkInput v-model="clientIp" :debounce="true" type="search" style="margin: 0; flex: 1; min-width: 120px;">
							<template #label>{{ an.postIp }}</template>
						</MkInput>
						<MkInput v-model="clientFingerprint" :debounce="true" type="search" style="margin: 0; flex: 1; min-width: 120px;">
							<template #label>{{ an.postFingerprint }}</template>
						</MkInput>
					</div>
					<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
						<div :class="$style.scopeHint">{{ scopeHint }}</div>
						<MkButton small rounded @click="reload">{{ i18n.ts.search }}</MkButton>
					</div>
				</div>
			</div>

			<!-- Batch bar -->
			<div v-if="selectedIds.size > 0" class="_panel" :class="$style.batchBar">
				<span>{{ an.selected }}: {{ selectedIds.size }}</span>
				<div style="display: flex; flex-wrap: wrap; gap: 8px;">
					<MkButton small @click="selectAll">{{ an.selectAll }}</MkButton>
					<MkButton small @click="clearSelection">{{ an.clearSelection }}</MkButton>
					<MkButton small danger @click="batchHide(true)">{{ an.batchHide }}</MkButton>
					<MkButton v-if="viewTab === 'hidden'" small @click="batchHide(false)">{{ an.batchUnhide }}</MkButton>
					<MkButton small danger @click="batchDelete">{{ an.batchDelete }}</MkButton>
				</div>
			</div>

			<div :class="[$style.root, '_gaps']">
				<div v-for="note in items" :key="note.id" :class="$style.item">
					<label :class="$style.check">
						<input type="checkbox" :checked="selectedIds.has(note.id)" @change="toggleSelect(note.id, $event)"/>
					</label>
					<div :class="$style.noteWrap">
						<div v-if="note.user?.host" :class="$style.remoteBadge">
							<i class="ti ti-planet"></i> {{ note.user.host }}
						</div>
						<!-- withHardMute=false + detail pack so moderators see full note body -->
						<DynamicNote :class="$style.note" :note="note" :withHardMute="false"/>
						<div :class="$style.audit">
							<div v-if="iAmAdmin" :class="$style.auditRow">
								<span :class="$style.auditKey">{{ an.postIp }}</span>
								<button v-if="note.clientIp" type="button" class="_textButton _monospace" @click="copy(note.clientIp)">{{ note.clientIp }}</button>
								<span v-else class="_monospace" style="opacity: 0.5;">—</span>
							</div>
							<div v-if="iAmAdmin" :class="$style.auditRow">
								<span :class="$style.auditKey">{{ an.postFingerprint }}</span>
								<button v-if="note.clientFingerprint" type="button" class="_textButton _monospace" :class="$style.fp" @click="copy(note.clientFingerprint)">{{ note.clientFingerprint }}</button>
								<span v-else class="_monospace" style="opacity: 0.5;">—</span>
							</div>
							<div v-if="note.isHidden" :class="$style.hiddenBadge"><i class="ti ti-eye-off"></i> {{ an.hidden }}</div>
							<div :class="$style.actions">
								<button class="_textButton" @click="openUser(note)"><i class="ti ti-user"></i> {{ an.openUser }}</button>
								<button class="_textButton" @click="toggleHideOne(note)">
									<i :class="note.isHidden ? 'ti ti-eye' : 'ti ti-eye-off'"></i>
									{{ note.isHidden ? an.unhide : an.hide }}
								</button>
								<button class="_textButton" style="color: var(--MI_THEME-error);" @click="deleteNote(note)"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</button>
								<button class="_textButton" style="color: var(--MI_THEME-error);" @click="suspendUser(note)"><i class="ti ti-ban"></i> {{ an.suspendUser }}</button>
							</div>
						</div>
					</div>
				</div>

				<div v-if="loading" style="text-align: center; padding: 24px;"><MkLoading/></div>
				<div v-else-if="items.length === 0" class="_panel" style="padding: 20px; text-align: center; opacity: 0.75;">
					{{ i18n.ts.nothing }}
				</div>
				<div v-if="canLoadMore" style="text-align: center;">
					<MkButton :wait="loadingMore" primary rounded @click="loadMore">{{ i18n.ts.loadMore }}</MkButton>
				</div>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import SkPatternTest from '@/components/SkPatternTest.vue';
import DynamicNote from '@/components/DynamicNote.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { iAmAdmin } from '@/i.js';
import { useRouter } from '@/router.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { useStream, wakeStream } from '@/stream.js';

const router = useRouter();

const anFb = {
	title: '帖子管理',
	siteWide: '全站发帖',
	siteWideCaption: '控制本站用户是否可以发帖。禁用后，版主与管理员仍可发帖。',
	disableLocalNoteCreation: '禁止全站发帖',
	disableLocalNoteCreationCaption: '启用后，非版主的本站用户将无法发帖。',
	disableConfirm: '确定禁止全站用户发帖？版主仍可发帖。',
	blockRemoteNotes: '屏蔽远程帖子',
	blockRemoteNotesCaption: '启用后，除管理员/版主外，所有人（含游客）在时间线、搜索等处看不到远程联合帖子。后台「远程 / 已隐藏」仍可管理。',
	blockRemoteConfirm: '确定对普通用户屏蔽所有远程帖子？仅管理员与版主仍可见。',
	listHint: '本站帖子按时间线样式展示。',
	openUser: '打开用户',
	suspendUser: '封禁用户',
	postIp: '发帖 IP',
	postFingerprint: '指纹',
	filterUsername: '用户名',
	filterEmail: '邮箱',
	includeRemote: '显示联合（远程）帖子',
	tabAll: '本站',
	tabRemote: '远程',
	tabHidden: '已隐藏',
	scopeLocalHint: '本站帖子（未隐藏）',
	scopeRemoteHint: '联合远程帖子（未隐藏）',
	scopeHiddenHint: '管理员隐藏的帖子（本站 + 远程）',
	selected: '已选',
	selectAll: '全选本页',
	clearSelection: '取消选择',
	batchDelete: '批量删除',
	batchHide: '批量隐藏',
	batchUnhide: '批量取消隐藏',
	hide: '隐藏',
	unhide: '取消隐藏',
	hidden: '已隐藏',
	hideConfirm: '确定隐藏所选帖子？隐藏后普通用户不可见，管理员仍可在「已隐藏」中查看。',
	unhideConfirm: '确定取消隐藏所选帖子？',
	hideOneConfirm: '确定隐藏这条帖子？',
	unhideOneConfirm: '确定取消隐藏这条帖子？',
	deleteConfirm: '确定永久删除这条帖子？此操作不可恢复。',
	batchDeleteConfirm: '确定永久删除已选帖子？此操作不可恢复。',
	suspendConfirm: '确定封禁该用户？其帖子将被隐藏，账号将无法正常使用。',
	suspendHideChat: '同时隐藏该用户的聊天记录',
	keywordBlock: '屏蔽关键词',
	keywordBlockCaption: '支持多种格式：每行一条规则；同一行内空格分隔的词需同时匹配（AND）；使用 /正则/flags 可写正则。敏感词命中会强制标为敏感，禁止词命中将拒绝发帖。',
	prohibitedWords: '禁止词（无法发帖）',
	prohibitedWordsCaption: '命中后拒绝创建/编辑帖子。一行一条；空格=AND；/regex/i=正则。',
	sensitiveWords: '敏感词（强制敏感）',
	sensitiveWordsCaption: '命中后帖子标记为敏感/需遮罩。格式同上。',
} as const;

const an = new Proxy(anFb as Record<string, string>, {
	get(target, prop: string) {
		const block = (i18n.ts as any)._adminNotes;
		const v = block?.[prop];
		return typeof v === 'string' && v.length > 0 ? v : target[prop] ?? prop;
	},
});

type AdminNote = Misskey.entities.Note & {
	clientIp?: string | null;
	clientFingerprint?: string | null;
	isHidden?: boolean;
};

/** local = 本站 | remote = 远程 | hidden = 已隐藏 */
const viewTab = ref<'local' | 'remote' | 'hidden'>('local');
const username = ref('');
const email = ref('');
const query = ref('');
const clientIp = ref('');
const clientFingerprint = ref('');
const items = ref<AdminNote[]>([]);
const loading = ref(true);
const loadingMore = ref(false);
const canLoadMore = ref(false);
const disableLocalNoteCreation = ref(false);
const blockRemoteNotes = ref(false);
const selectedIds = ref(new Set<string>());
const prohibitedWords = ref('');
const sensitiveWords = ref('');
/** Cancel stale list fetches when switching tabs quickly */
let fetchSeq = 0;

const PAGE_SIZE = 30;

const scopeHint = computed(() => {
	if (viewTab.value === 'remote') return an.scopeRemoteHint;
	if (viewTab.value === 'hidden') return an.scopeHiddenHint;
	return an.scopeLocalHint;
});

try {
	const meta = await misskeyApi('admin/meta') as unknown as {
		disableLocalNoteCreation?: boolean;
		blockRemoteNotes?: boolean;
		prohibitedWords?: string[];
		sensitiveWords?: string[];
	};
	disableLocalNoteCreation.value = !!meta.disableLocalNoteCreation;
	blockRemoteNotes.value = !!meta.blockRemoteNotes;
	prohibitedWords.value = (meta.prohibitedWords ?? []).join('\n');
	sensitiveWords.value = (meta.sensitiveWords ?? []).join('\n');
} catch { /* ignore */ }

async function saveKeywordBlocks() {
	const toList = (s: string) => s.split('\n').map(x => x.trim()).filter(x => x.length > 0);
	await os.apiWithDialog('admin/update-meta', {
		prohibitedWords: toList(prohibitedWords.value),
		sensitiveWords: toList(sensitiveWords.value),
	} as never);
	fetchInstance(true);
}

async function fetchPage(scope: 'local' | 'remote' | 'hidden', untilId?: string) {
	const res = await misskeyApi('admin/notes' as any, {
		limit: PAGE_SIZE,
		username: username.value || null,
		email: email.value || null,
		query: query.value || null,
		clientIp: clientIp.value || null,
		clientFingerprint: clientFingerprint.value || null,
		scope,
		untilId: untilId ?? undefined,
	} as any) as AdminNote[];
	return res;
}

function currentScope(): 'local' | 'remote' | 'hidden' {
	return viewTab.value === 'remote' ? 'remote'
		: viewTab.value === 'hidden' ? 'hidden'
			: 'local';
}

async function reload() {
	const seq = ++fetchSeq;
	const scope = currentScope();
	loading.value = true;
	// Clear list immediately so empty tabs never briefly show previous tab's notes
	items.value = [];
	selectedIds.value = new Set();
	canLoadMore.value = false;
	try {
		const res = await fetchPage(scope);
		// Stale response (user switched tab/filter mid-flight)
		if (seq !== fetchSeq || currentScope() !== scope) return;
		items.value = res;
		canLoadMore.value = res.length >= PAGE_SIZE;
	} catch (e) {
		if (seq !== fetchSeq) return;
		items.value = [];
		canLoadMore.value = false;
		console.error(e);
	} finally {
		if (seq === fetchSeq) loading.value = false;
	}
}

async function loadMore() {
	if (items.value.length === 0 || loadingMore.value) return;
	const seq = fetchSeq;
	const scope = currentScope();
	loadingMore.value = true;
	try {
		const last = items.value[items.value.length - 1];
		const res = await fetchPage(scope, last.id);
		if (seq !== fetchSeq || currentScope() !== scope) return;
		const seen = new Set(items.value.map(n => n.id));
		for (const n of res) {
			if (!seen.has(n.id)) items.value.push(n);
		}
		canLoadMore.value = res.length >= PAGE_SIZE;
	} finally {
		if (seq === fetchSeq) loadingMore.value = false;
	}
}

watch([username, email, query, clientIp, clientFingerprint, viewTab], () => {
	void reload();
});

// Refresh list when returning to the page / WS reconnect (admin console feels snappier)
const stream = useStream();
const onStreamConnected = () => {
	// Soft refresh current tab without clearing selection mid-action
	if (!loading.value && !loadingMore.value) void reload();
};
const onVis = () => {
	if (window.document.visibilityState === 'visible') {
		wakeStream({ force: false });
	}
};
onMounted(() => {
	stream.on('_connected_', onStreamConnected);
	window.document.addEventListener('visibilitychange', onVis);
});
onBeforeUnmount(() => {
	stream.off('_connected_', onStreamConnected);
	window.document.removeEventListener('visibilitychange', onVis);
});

await reload();

async function onToggleDisablePosting(value: boolean) {
	if (value) {
		const { canceled } = await os.confirm({ type: 'warning', text: an.disableConfirm });
		if (canceled) return;
	}
	disableLocalNoteCreation.value = value;
	await os.apiWithDialog('admin/update-meta', { disableLocalNoteCreation: value } as never);
	fetchInstance(true);
}

async function onToggleBlockRemote(value: boolean) {
	if (value) {
		const { canceled } = await os.confirm({ type: 'warning', text: an.blockRemoteConfirm });
		if (canceled) return;
	}
	blockRemoteNotes.value = value;
	await os.apiWithDialog('admin/update-meta', { blockRemoteNotes: value } as never);
	fetchInstance(true);
}

function openUser(note: AdminNote) {
	router.push(`/admin/user/${note.userId}`);
}

function toggleSelect(id: string, ev: Event) {
	const checked = (ev.target as HTMLInputElement).checked;
	const next = new Set(selectedIds.value);
	if (checked) next.add(id);
	else next.delete(id);
	selectedIds.value = next;
}

function selectAll() {
	selectedIds.value = new Set(items.value.map(n => n.id));
}

function clearSelection() {
	selectedIds.value = new Set();
}

async function batchDelete() {
	const ids = Array.from(selectedIds.value);
	if (ids.length === 0) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		title: an.batchDelete,
		text: `${an.batchDeleteConfirm}（${ids.length}）`,
	});
	if (canceled) return;
	// second confirm for destructive batch delete
	const second = await os.confirm({
		type: 'warning',
		title: an.batchDelete,
		text: `${an.deleteConfirm}（${ids.length}）`,
	});
	if (second.canceled) return;
	await os.apiWithDialog('admin/notes-batch-delete' as any, { noteIds: ids } as any);
	items.value = items.value.filter(n => !selectedIds.value.has(n.id));
	clearSelection();
}

async function batchHide(isHidden: boolean) {
	const ids = Array.from(selectedIds.value);
	if (ids.length === 0) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		title: isHidden ? an.batchHide : an.batchUnhide,
		text: `${isHidden ? an.hideConfirm : an.unhideConfirm}（${ids.length}）`,
	});
	if (canceled) return;
	await os.apiWithDialog('admin/notes-set-hidden' as any, { noteIds: ids, isHidden } as any);
	// local/remote tabs exclude hidden; hidden tab excludes unhidden
	if ((viewTab.value === 'local' || viewTab.value === 'remote') && isHidden) {
		items.value = items.value.filter(n => !selectedIds.value.has(n.id));
	} else if (viewTab.value === 'hidden' && !isHidden) {
		items.value = items.value.filter(n => !selectedIds.value.has(n.id));
	} else {
		for (const n of items.value) {
			if (selectedIds.value.has(n.id)) n.isHidden = isHidden;
		}
	}
	clearSelection();
}

async function toggleHideOne(note: AdminNote) {
	const next = !note.isHidden;
	const { canceled } = await os.confirm({
		type: 'warning',
		title: next ? an.hide : an.unhide,
		text: next ? an.hideOneConfirm : an.unhideOneConfirm,
	});
	if (canceled) return;
	await os.apiWithDialog('admin/notes-set-hidden' as any, {
		noteIds: [note.id],
		isHidden: next,
	} as any);
	if ((viewTab.value === 'local' || viewTab.value === 'remote') && next) {
		items.value = items.value.filter(n => n.id !== note.id);
	} else if (viewTab.value === 'hidden' && !next) {
		items.value = items.value.filter(n => n.id !== note.id);
	} else {
		note.isHidden = next;
	}
}

async function deleteNote(note: AdminNote) {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.delete,
		text: an.deleteConfirm,
	});
	if (canceled) return;
	const second = await os.confirm({
		type: 'warning',
		title: i18n.ts.delete,
		text: i18n.ts.noteDeleteConfirm || an.deleteConfirm,
	});
	if (second.canceled) return;
	await os.apiWithDialog('notes/delete', { noteId: note.id });
	items.value = items.value.filter(x => x.id !== note.id);
}

async function suspendUser(note: AdminNote) {
	// First confirm: intentional ban
	const first = await os.confirm({
		type: 'warning',
		title: an.suspendUser,
		text: `${an.suspendConfirm}\n@${note.user?.username ?? note.userId}`,
	});
	if (first.canceled) return;
	// Second step: choose whether to also hide chat
	const { canceled, result } = await os.actions({
		type: 'warning',
		title: an.suspendUser,
		text: `@${note.user?.username ?? note.userId}`,
		actions: [{
			value: 'ok' as const,
			text: an.suspendUser,
			danger: true,
			primary: true,
		}, {
			value: 'okChat' as const,
			text: an.suspendHideChat,
			danger: true,
		}],
	});
	if (canceled) return;
	await os.apiWithDialog('admin/suspend-user', {
		userId: note.userId,
		hideNotes: true,
		hideChat: result === 'okChat',
	} as any);
}

function copy(v: string | null | undefined) {
	if (!v) return;
	copyToClipboard(v);
}

const headerTabs = computed(() => [
	{ key: 'local', title: an.tabAll, icon: 'ti ti-home' },
	{ key: 'remote', title: an.tabRemote, icon: 'ti ti-planet' },
	{ key: 'hidden', title: an.tabHidden, icon: 'ti ti-eye-off' },
]);

definePage(() => ({
	title: an.title,
	icon: 'ti ti-notes',
}));
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
	background: var(--MI_THEME-bg);
}

.item {
	display: flex;
	gap: 8px;
	align-items: flex-start;
}

.check {
	padding-top: 18px;
	flex-shrink: 0;
}

.noteWrap {
	flex: 1;
	min-width: 0;
}

.note {
	background: color-mix(in srgb, var(--MI_THEME-panel) 65%, transparent);
	border-radius: var(--MI-radius) var(--MI-radius) 0 0;
}

.audit {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 8px 12px 10px;
	margin-top: -2px;
	border-radius: 0 0 var(--MI-radius) var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-panel) 85%, var(--MI_THEME-bg));
	border-top: 1px dashed var(--MI_THEME-divider);
	font-size: 0.85em;
}

.auditRow {
	display: flex;
	gap: 8px;
	align-items: baseline;
	min-width: 0;
}

.auditKey {
	flex-shrink: 0;
	font-weight: 700;
	opacity: 0.65;
	min-width: 4.5em;
}

.fp {
	word-break: break-all;
	text-align: left;
}

.scopeHint {
	flex: 1;
	min-width: 0;
	font-size: 0.88em;
	opacity: 0.75;
}

.remoteBadge {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin: 0 0 6px 4px;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 0.78em;
	font-weight: 600;
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, transparent);
	color: var(--MI_THEME-accent);
}

.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	margin-top: 6px;
	padding-top: 6px;
	border-top: 1px solid var(--MI_THEME-divider);
}

.hiddenBadge {
	color: var(--MI_THEME-warn);
	font-weight: 600;
}

.batchBar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 10px 14px;
	position: sticky;
	top: 0;
	z-index: 10;
	background: var(--MI_THEME-panel);
}
</style>
