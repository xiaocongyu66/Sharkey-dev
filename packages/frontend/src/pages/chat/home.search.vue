<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!--
  Global search across existing chats only (API scopes to user's history).
  Used as a tab on /chat so the home list stays uncluttered.
-->
<template>
<div class="_gaps">
	<MkInput
		v-model="searchQuery"
		:placeholder="tChat('searchPlaceholder')"
		type="search"
		autofocus
		@enter="search()"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<div :class="$style.hint">{{ tChat('globalSearchHint') }}</div>

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
			{{ i18n.ts.searchResult }}
			<span v-if="searchResults.length > 0" :class="$style.count">({{ searchResults.length }})</span>
		</template>

		<div v-if="searchResults.length > 0" class="_gaps_s">
			<button
				v-for="message in searchResults"
				:key="message.id"
				type="button"
				class="_button"
				:class="$style.searchResultItem"
				@click="openMessage(message)"
			>
				<div :class="$style.resultMeta">
					<span :class="$style.contextLabel">
						<template v-if="message.toRoomId && message.toRoom">
							<i class="ti ti-users"></i> {{ message.toRoom.name }}
						</template>
						<template v-else-if="peerOf(message)">
							<i class="ti ti-user"></i>
							{{ peerOf(message)!.name || peerOf(message)!.username }}
						</template>
						<template v-else>
							{{ tChat('jumpToMessage') }}
						</template>
					</span>
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
import { useRouter } from '@/router.js';
import { ensureSignin } from '@/i.js';
import { chatT, chatFb } from './chat-i18n.js';

const tChat = (key: keyof typeof chatFb) => chatT(key, chatFb[key]);
const $i = ensureSignin();
const router = useRouter();

const searchQuery = ref('');
const searched = ref(false);
const searching = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);

const canSearch = computed(() => searchQuery.value.trim().length > 0);

function peerOf(message: Misskey.entities.ChatMessage) {
	if (message.toRoomId) return null;
	if (message.fromUserId === $i.id) return message.toUser ?? null;
	return message.fromUser ?? null;
}

async function search() {
	if (!canSearch.value || searching.value) return;
	searching.value = true;
	try {
		// No roomId/userId → only messages in chats the user already has
		const res = await misskeyApi('chat/messages/search', {
			query: searchQuery.value.trim(),
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

function openMessage(message: Misskey.entities.ChatMessage) {
	const q = `?msg=${encodeURIComponent(message.id)}`;
	if (message.toRoomId) {
		router.push(`/chat/room/${message.toRoomId}${q}`);
		return;
	}
	const peerId =
		message.fromUserId === $i.id
			? (message.toUserId ?? message.toUser?.id)
			: message.fromUserId;
	if (peerId) {
		router.push(`/chat/user/${peerId}${q}`);
		return;
	}
	router.push(`/chat/messages/${message.id}`);
}
</script>

<style lang="scss" module>
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
	opacity: 0.85;
}

.contextLabel {
	color: var(--MI_THEME-accent);
	font-weight: 600;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.resultBody {
	pointer-events: none;
}

.count {
	opacity: 0.65;
	font-weight: normal;
	margin-left: 4px;
}
</style>
