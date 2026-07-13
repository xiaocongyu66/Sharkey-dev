<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInfo>{{ tChat('manageHint') }}</MkInfo>

	<MkFolder :defaultOpen="true">
		<template #icon><i class="ti ti-settings"></i></template>
		<template #label>{{ tChat('roomSettings') }}</template>
		<div class="_gaps">
			<MkInput v-model="name_">
				<template #label>{{ i18n.ts.name }}</template>
			</MkInput>
			<MkTextarea v-model="description_">
				<template #label>{{ i18n.ts.description }}</template>
			</MkTextarea>
			<MkSelect v-if="isOwner" v-model="joinPolicy_">
				<template #label>{{ tChat('joinPolicy') }}</template>
				<option value="public">{{ tChat('joinPolicyPublic') }}</option>
				<option value="link">{{ tChat('joinPolicyLink') }}</option>
				<option value="invite">{{ tChat('joinPolicyInvite') }}</option>
				<option value="closed">{{ tChat('joinPolicyClosed') }}</option>
			</MkSelect>
			<div v-if="inviteCode_" class="_gaps_s">
				<MkInput :modelValue="inviteCode_" readonly>
					<template #label>{{ tChat('inviteCode') }}</template>
				</MkInput>
				<div class="_buttons">
					<MkButton @click="copyInvite">{{ tChat('copyInviteCode') }}</MkButton>
					<MkButton @click="regenInvite">{{ tChat('regenerateInviteCode') }}</MkButton>
				</div>
			</div>
			<MkButton primary @click="saveBasic">{{ i18n.ts.save }}</MkButton>
		</div>
	</MkFolder>

	<MkFolder :defaultOpen="true">
		<template #icon><i class="ti ti-speakerphone"></i></template>
		<template #label>{{ announcementLabel }}</template>
		<div class="_gaps">
			<MkTextarea v-model="announcement_">
				<template #label>{{ announcementLabel }}</template>
			</MkTextarea>
			<MkButton primary @click="saveAnnouncement">{{ i18n.ts.save }}</MkButton>
		</div>
	</MkFolder>

	<MkFolder :defaultOpen="true">
		<template #icon><i class="ti ti-message-off"></i></template>
		<template #label>{{ tChat('mutedAll') }}</template>
		<div class="_gaps">
			<MkSwitch v-model="isMutedAll_">
				<template #label>{{ tChat('mutedAll') }}</template>
				<template #caption>{{ tChat('mutedAllHint') }}</template>
			</MkSwitch>
			<MkButton primary @click="saveMutedAll">{{ i18n.ts.save }}</MkButton>
		</div>
	</MkFolder>

	<MkFolder :defaultOpen="true">
		<template #icon><i class="ti ti-clock"></i></template>
		<template #label>{{ tChat('messageRateLimit') }}</template>
		<div class="_gaps">
			<MkInput v-model="messageRateLimitSeconds_" type="number" :min="0" :max="86400">
				<template #label>{{ tChat('messageRateLimit') }}</template>
				<template #caption>{{ tChat('messageRateLimitHint') }}</template>
			</MkInput>
			<MkButton primary @click="saveRateLimit">{{ i18n.ts.save }}</MkButton>
		</div>
	</MkFolder>

	<MkFolder>
		<template #icon><i class="ti ti-trash"></i></template>
		<template #label>{{ tChat('dangerZone') }}</template>
		<div class="_gaps">
			<MkButton danger @click="clearMessages">
				<i class="ti ti-eraser"></i> {{ tChat('clearMessages') }}
			</MkButton>
			<div style="opacity: 0.75; font-size: 90%;">{{ tChat('clearMessagesHint') }}</div>
			<MkButton v-if="isOwner || $i.isAdmin || $i.isModerator" danger @click="del">
				<i class="ti ti-trash"></i> {{ i18n.ts._chat.deleteRoom }}
			</MkButton>
		</div>
	</MkFolder>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import { useRouter } from '@/router.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { chatT, chatFb } from './chat-i18n.js';
import { chatWsKey } from './chat-ws.js';
import { inject } from 'vue';

const router = useRouter();
const $i = ensureSignin();
const tChat = (key: keyof typeof chatFb) => chatT(key, chatFb[key]);
const chatWs = inject(chatWsKey, null);
/** i18n.ts.announcement may be missing in older locale packs — always show 公告/Announcement */
const announcementLabel = computed(() => {
	const v = (i18n.ts as any).announcement;
	if (typeof v === 'string' && v.length > 0 && !v.includes('announcement')) return v;
	return tChat('roomAnnouncement', chatFb.roomAnnouncement);
});

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'updated'): void;
	(ev: 'cleared'): void;
}>();

const roomAny = computed(() => props.room as any);

const isOwner = computed(() => props.room.ownerId === $i.id);

const name_ = ref(props.room.name);
const description_ = ref(props.room.description);
const announcement_ = ref(roomAny.value.announcement ?? '');
const joinPolicy_ = ref(roomAny.value.joinPolicy ?? 'invite');
const isMutedAll_ = ref(!!roomAny.value.isMutedAll);
const messageRateLimitSeconds_ = ref(String(roomAny.value.messageRateLimitSeconds ?? 0));
const inviteCode_ = ref(roomAny.value.inviteCode ?? '');

async function saveBasic() {
	await os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		name: name_.value,
		description: description_.value,
		joinPolicy: isOwner.value ? joinPolicy_.value : undefined,
	} as any);
	emit('updated');
}

async function saveAnnouncement() {
	await os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		announcement: announcement_.value,
	} as any);
	emit('updated');
}

async function saveMutedAll() {
	await os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		isMutedAll: isMutedAll_.value,
	} as any);
	emit('updated');
}

async function saveRateLimit() {
	const n = Math.max(0, Math.min(86400, Math.floor(Number(messageRateLimitSeconds_.value) || 0)));
	messageRateLimitSeconds_.value = String(n);
	await os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		messageRateLimitSeconds: n,
	} as any);
	emit('updated');
}

function copyInvite() {
	if (inviteCode_.value) copyToClipboard(inviteCode_.value);
}

async function regenInvite() {
	const updated = await os.apiWithDialog('chat/rooms/regenerate-invite-code', {
		roomId: props.room.id,
	} as any);
	inviteCode_.value = (updated as any).inviteCode ?? '';
	emit('updated');
}

async function clearMessages() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: tChat('clearMessagesConfirm'),
	});
	if (canceled) return;

	// Prefer WebSocket clear; fall back to REST
	if (chatWs?.ready() && chatWs.send('clearMessages', {})) {
		// cleared event will refresh timeline via parent
		emit('cleared');
		return;
	}

	await os.apiWithDialog('chat/rooms/clear-messages' as any, {
		roomId: props.room.id,
	} as any);
	emit('cleared');
}

async function del() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: name_.value }),
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/delete', {
		roomId: props.room.id,
	});
	router.push('/chat');
}
</script>
