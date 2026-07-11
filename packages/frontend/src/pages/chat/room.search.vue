<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInput
		v-model="searchQuery"
		:placeholder="tChat('searchPlaceholder')"
		type="search"
		@enter="search()"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<div class="_gaps_s">
		<div :class="$style.speakerRow">
			<span :class="$style.speakerLabel">{{ tChat('filterBySpeaker') }}</span>
			<div class="_buttons" style="flex-wrap: wrap; gap: 8px;">
				<MkButton rounded @click="pickSpeaker">
					<i class="ti ti-user"></i>
					{{ speaker ? (speaker.name || speaker.username) : tChat('selectSpeaker') }}
				</MkButton>
				<MkButton v-if="speaker" rounded @click="clearSpeaker">
					<i class="ti ti-x"></i>
					{{ tChat('clearSpeaker') }}
				</MkButton>
			</div>
			<div v-if="speaker" :class="$style.speakerChip">
				<MkAvatar :user="speaker" :size="28" :link="false"/>
				<span>@{{ speaker.username }}</span>
			</div>
		</div>
		<div :class="$style.hint">{{ tChat('searchOrSpeakerHint') }}</div>
	</div>

	<MkButton
		primary
		rounded
		:disabled="!canSearch || searching"
		@click="search"
	>
		{{ searching ? '…' : i18n.ts.search }}
	</MkButton>

	<MkFoldableSection v-if="searched" :expanded="true">
		<template #header>
			{{ resultHeader }}
			<span v-if="searchResults.length > 0" :class="$style.count">({{ searchResults.length }})</span>
		</template>

		<div v-if="searchResults.length > 0" class="_gaps_s">
			<button
				v-for="message in searchResults"
				:key="message.id"
				type="button"
				class="_button"
				:class="$style.searchResultItem"
				@click="jumpTo(message)"
			>
				<div :class="$style.resultMeta">
					<span :class="$style.jumpHint"><i class="ti ti-arrow-right"></i> {{ tChat('jumpToMessage') }}</span>
					<MkTime :time="message.createdAt" mode="detail"/>
				</div>
				<div :class="$style.resultBody" @click.stop>
					<XMessage :message="message" :isSearchResult="true"/>
				</div>
			</button>
		</div>
		<MkResult v-else type="notFound"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkInput from '@/components/MkInput.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import * as os from '@/os.js';
import { chatT, chatFb } from './chat-i18n.js';

const tChat = (key: keyof typeof chatFb) => chatT(key, chatFb[key]);

const props = defineProps<{
	userId?: string;
	roomId?: string;
}>();

const emit = defineEmits<{
	(ev: 'jump', messageId: string): void;
}>();

const searchQuery = ref('');
const searched = ref(false);
const searching = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);
const speaker = ref<Misskey.entities.UserLite | null>(null);

const canSearch = computed(() => {
	return searchQuery.value.trim().length > 0 || speaker.value != null;
});

const resultHeader = computed(() => {
	if (speaker.value && !searchQuery.value.trim()) {
		return tChat('recentFromSpeaker');
	}
	return i18n.ts.searchResult;
});

async function pickSpeaker() {
	try {
		const user = await os.selectUser({
			includeSelf: true,
			localOnly: true,
		});
		if (user) {
			speaker.value = user as Misskey.entities.UserLite;
		}
	} catch {
		// canceled
	}
}

function clearSpeaker() {
	speaker.value = null;
}

async function search() {
	if (!canSearch.value || searching.value) return;
	searching.value = true;
	try {
		const res = await misskeyApi('chat/messages/search', {
			query: searchQuery.value.trim(),
			roomId: props.roomId,
			userId: props.userId,
			fromUserId: speaker.value?.id ?? undefined,
			limit: 50,
		} as any);

		searchResults.value = res as Misskey.entities.ChatMessage[];
		searched.value = true;
	} catch (e: any) {
		os.alert({
			type: 'error',
			text: e?.message || e?.error?.message || tChat('loadFailed'),
		});
	} finally {
		searching.value = false;
	}
}

function jumpTo(message: Misskey.entities.ChatMessage) {
	emit('jump', message.id);
}
</script>

<style lang="scss" module>
.speakerRow {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.speakerLabel {
	font-weight: bold;
	font-size: 0.9em;
	opacity: 0.85;
}

.speakerChip {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 6px 10px;
	border-radius: 999px;
	background: var(--MI_THEME-buttonBg);
	width: fit-content;
	font-size: 0.9em;
}

.hint {
	font-size: 0.85em;
	opacity: 0.7;
	line-height: 1.4;
}

.searchResultItem {
	display: block;
	width: 100%;
	text-align: left;
	padding: 10px 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 12px;
	cursor: pointer;
	transition: background 0.15s, border-color 0.15s;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 8%, transparent);
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 40%, var(--MI_THEME-divider));
	}
}

.resultMeta {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 8px;
	margin-bottom: 6px;
	font-size: 0.8em;
	opacity: 0.8;
}

.jumpHint {
	color: var(--MI_THEME-accent);
	font-weight: 600;
}

.resultBody {
	pointer-events: none; /* whole card is clickable for jump */
}

.count {
	opacity: 0.65;
	font-weight: normal;
	margin-left: 4px;
}
</style>
