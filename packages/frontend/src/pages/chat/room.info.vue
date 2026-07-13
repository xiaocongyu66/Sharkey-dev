<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div class="_panel" style="padding: 16px;">
		<div style="font-size: 1.15em; font-weight: bold; margin-bottom: 8px;">{{ room.name }}</div>
		<div v-if="room.description" style="opacity: 0.85; white-space: pre-wrap; margin-bottom: 8px;">{{ room.description }}</div>
		<div v-if="roomAny.announcement" style="margin-top: 8px; padding: 10px; border-radius: 10px; background: color-mix(in srgb, var(--MI_THEME-accent) 10%, var(--MI_THEME-panel));">
			<div style="font-weight: bold; margin-bottom: 4px;"><i class="ti ti-speakerphone"></i> {{ announcementTitle }}</div>
			<div style="white-space: pre-wrap;">{{ roomAny.announcement }}</div>
		</div>
		<div v-if="roomAny.isMutedAll" style="margin-top: 8px; color: var(--MI_THEME-warn);">
			<i class="ti ti-message-off"></i> {{ tChat('mutedAll') }}
		</div>
	</div>

	<MkSwitch v-if="!isOwner" v-model="isMuted">
		<template #label>{{ i18n.ts._chat.muteThisRoom }}</template>
	</MkSwitch>

	<hr>

	<!-- Leave room lives in About (not header menu) -->
	<MkButton v-if="!isOwner" danger @click="leaveRoom">
		<i class="ti ti-logout"></i> {{ i18n.ts._chat.leave }}
	</MkButton>

	<div v-if="canModerate" style="opacity: 0.8; font-size: 90%;">
		{{ tChat('manageInManageTab') }}
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import MkSwitch from '@/components/MkSwitch.vue';
import { useRouter } from '@/router.js';
import { chatT, chatFb } from './chat-i18n.js';

const router = useRouter();
const $i = ensureSignin();
const tChat = (key: keyof typeof chatFb) => chatT(key, chatFb[key]);
const announcementTitle = computed(() => {
	const v = (i18n.ts as any).announcement;
	if (typeof v === 'string' && v.length > 0 && !String(v).includes('announcement')) return v;
	return tChat('roomAnnouncement');
});

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const roomAny = computed(() => props.room as any);

const isOwner = computed(() => props.room.ownerId === $i.id);

const canModerate = computed(() => {
	const role = roomAny.value.myRole;
	return role === 'owner' || role === 'admin' || $i.isAdmin || $i.isModerator;
});

const isMuted = ref(props.room.isMuted ?? false);

watch(isMuted, async () => {
	await os.apiWithDialog('chat/rooms/mute', {
		roomId: props.room.id,
		mute: isMuted.value,
	});
});

async function leaveRoom() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	await misskeyLeave();
	router.push('/chat');
}

async function misskeyLeave() {
	await os.apiWithDialog('chat/rooms/leave', {
		roomId: props.room.id,
	});
}
</script>
