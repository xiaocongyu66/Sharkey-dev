<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!--
  Telegram / NagramX-inspired sticker panel:
  - pack tabs with thumbnails
  - "Recent" virtual pack
  - dense square grid
-->
<template>
<div :class="$style.root">
	<div :class="$style.header">
		<div style="font-weight: bold;">{{ tChat('stickers') }}</div>
		<button class="_button" :class="$style.close" @click="$emit('close')"><i class="ti ti-x"></i></button>
	</div>

	<div :class="$style.importRow">
		<MkInput v-model="importName" placeholder="HotCherry" style="flex: 1;">
			<template #prefix><i class="ti ti-brand-telegram"></i></template>
		</MkInput>
		<MkButton :disabled="!importName || importing" primary @click="importTelegram">{{ tChat('importTelegram') }}</MkButton>
	</div>

	<div v-if="loading" style="padding: 16px; text-align: center;"><MkLoading/></div>
	<div v-else-if="packs.length === 0 && recent.length === 0" style="padding: 16px; opacity: 0.7; text-align: center;">
		{{ tChat('noStickersYet') }}
	</div>
	<div v-else :class="$style.body">
		<div :class="$style.tabs">
			<button
				v-if="recent.length > 0"
				class="_button"
				:class="[$style.tab, activePackId === '__recent' ? $style.tabActive : null]"
				:title="tChat('recentStickers')"
				@click="activePackId = '__recent'"
			>
				<i class="ti ti-clock"></i>
			</button>
			<button
				v-for="pack in packs"
				:key="pack.id"
				class="_button"
				:class="[$style.tab, pack.id === activePackId ? $style.tabActive : null]"
				:title="pack.title || pack.name"
				@click="activePackId = pack.id"
			>
				<img
					v-if="packThumb(pack)"
					:src="packThumb(pack)!"
					:alt="pack.title || pack.name"
					:class="$style.tabThumb"
				/>
				<span v-else :class="$style.tabText">{{ (pack.title || pack.name).slice(0, 2) }}</span>
			</button>
		</div>
		<div v-if="activeStickers.length" :class="$style.grid">
			<button
				v-for="sticker in activeStickers"
				:key="sticker.id"
				class="_button"
				:class="$style.sticker"
				:title="sticker.emoji || ''"
				@click="pick(sticker)"
			>
				<img v-if="sticker.file?.url" :src="sticker.file.url" :alt="sticker.emoji || 'sticker'" loading="lazy"/>
			</button>
		</div>
		<div v-else style="padding: 16px; opacity: 0.7; text-align: center;">—</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';
import { miLocalStorage } from '@/local-storage.js';
import { chatT, chatFb } from './chat-i18n.js';

const tChat = (key: keyof typeof chatFb) => chatT(key, chatFb[key]);

type Sticker = {
	id: string;
	emoji: string;
	fileId: string;
	file: { id: string; url?: string } | null;
};

type Pack = {
	id: string;
	name: string;
	title: string;
	telegramName: string | null;
	stickers: Sticker[];
};

const RECENT_KEY = 'chat-sticker-recent-v1';
const RECENT_MAX = 32;

const emit = defineEmits<{
	(ev: 'pick', sticker: Sticker): void;
	(ev: 'close'): void;
}>();

const packs = ref<Pack[]>([]);
const loading = ref(true);
const importing = ref(false);
const importName = ref('');
const activePackId = ref<string | null>(null);
const recent = ref<Sticker[]>([]);

function loadRecent() {
	try {
		const raw = miLocalStorage.getItem(RECENT_KEY);
		if (!raw) {
			recent.value = [];
			return;
		}
		recent.value = JSON.parse(raw) as Sticker[];
	} catch {
		recent.value = [];
	}
}

function saveRecent(list: Sticker[]) {
	recent.value = list;
	miLocalStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function packThumb(pack: Pack): string | null {
	const first = pack.stickers[0]?.file?.url;
	return first ?? null;
}

const activeStickers = computed(() => {
	if (activePackId.value === '__recent') return recent.value;
	const pack = packs.value.find(p => p.id === activePackId.value) ?? packs.value[0];
	return pack?.stickers ?? [];
});

async function load() {
	loading.value = true;
	try {
		loadRecent();
		packs.value = await misskeyApi('chat/stickers/packs', {} as any) as any;
		if (!activePackId.value) {
			activePackId.value = recent.value.length > 0 ? '__recent' : (packs.value[0]?.id ?? null);
		}
	} finally {
		loading.value = false;
	}
}

function pick(sticker: Sticker) {
	// push to recent (TG-style)
	const next = [sticker, ...recent.value.filter(s => s.id !== sticker.id)].slice(0, RECENT_MAX);
	saveRecent(next);
	emit('pick', sticker);
}

async function importTelegram() {
	if (!importName.value || importing.value) return;
	importing.value = true;
	try {
		await os.apiWithDialog('chat/stickers/import-telegram' as any, {
			name: importName.value.trim(),
		} as any);
		importName.value = '';
		await load();
	} finally {
		importing.value = false;
	}
}

onMounted(load);
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	max-height: 320px;
	background: var(--MI_THEME-panel);
	border-radius: 12px;
	overflow: hidden;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 12px;
	border-bottom: 1px solid var(--MI_THEME-divider);
}

.close {
	padding: 4px 8px;
	opacity: 0.7;
}

.importRow {
	display: flex;
	gap: 8px;
	padding: 8px 12px;
	border-bottom: 1px solid var(--MI_THEME-divider);
	align-items: center;
}

.body {
	display: flex;
	flex-direction: column;
	min-height: 0;
	flex: 1;
}

.tabs {
	display: flex;
	gap: 4px;
	padding: 6px 8px;
	overflow-x: auto;
	border-bottom: 1px solid var(--MI_THEME-divider);
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

.tab {
	flex-shrink: 0;
	width: 40px;
	height: 40px;
	border-radius: 10px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	opacity: 0.75;
	background: transparent;

	&:hover {
		opacity: 1;
		background: color-mix(in srgb, var(--MI_THEME-fg) 6%, transparent);
	}
}

.tabActive {
	opacity: 1;
	background: color-mix(in srgb, var(--MI_THEME-accent) 16%, transparent);
	box-shadow: inset 0 -2px 0 var(--MI_THEME-accent);
}

.tabThumb {
	width: 28px;
	height: 28px;
	object-fit: contain;
}

.tabText {
	font-size: 11px;
	font-weight: 700;
}

.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
	gap: 4px;
	padding: 8px;
	overflow-y: auto;
	max-height: 220px;
}

.sticker {
	aspect-ratio: 1;
	border-radius: 8px;
	padding: 4px;
	display: flex;
	align-items: center;
	justify-content: center;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	}

	img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		pointer-events: none;
	}
}
</style>
