<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkButton v-if="$i.policies.chatAvailability === 'available'" primary gradate rounded :class="$style.start" @click="start"><i class="ti ti-plus"></i> {{ i18n.ts.startChat }}</MkButton>

	<MkInfo v-else>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>

	<MkAd :preferForms="['horizontal', 'horizontal-big']"/>

	<MkFoldableSection>
		<template #header>{{ i18n.ts._chat.history }}</template>

		<MkChatHistories/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { onMounted } from 'vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ensureSignin } from '@/i.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkChatHistories from '@/components/MkChatHistories.vue';
import { chatT, chatFb } from './chat-i18n.js';

const $i = ensureSignin();
const tChat = (key: keyof typeof chatFb) => chatT(key, chatFb[key]);

const router = useRouter();

function start(ev: MouseEvent) {
	os.popupMenu([{
		text: i18n.ts._chat.individualChat,
		caption: i18n.ts._chat.individualChat_description,
		icon: 'ti ti-user',
		action: () => { startUser(); },
	}, { type: 'divider' }, {
		type: 'parent',
		text: i18n.ts._chat.roomChat,
		caption: i18n.ts._chat.roomChat_description,
		icon: 'ti ti-users-group',
		children: [{
			text: i18n.ts._chat.createRoom,
			icon: 'ti ti-plus',
			action: () => { createRoom(); },
		}, {
			text: tChat('joinByInviteCode'),
			icon: 'ti ti-link',
			action: () => { joinByCode(); },
		}],
	}], ev.currentTarget ?? ev.target);
}

async function startUser() {
	// TODO: localOnly は連合に対応したら消す
	os.selectUser({ localOnly: true }).then(user => {
		router.push(`/chat/user/${user.id}`);
	});
}

async function createRoom() {
	const { canceled, result } = await os.form(i18n.ts._chat.createRoom, {
		name: {
			type: 'string',
			label: i18n.ts.name,
			required: true,
		},
		joinPolicy: {
			type: 'enum',
			label: tChat('joinPolicy'),
			default: 'invite',
			enum: [{
				value: 'public',
				label: tChat('joinPolicyPublic'),
			}, {
				value: 'link',
				label: tChat('joinPolicyLink'),
			}, {
				value: 'invite',
				label: tChat('joinPolicyInvite'),
			}, {
				value: 'closed',
				label: tChat('joinPolicyClosed'),
			}],
		},
		announcement: {
			type: 'string',
			label: i18n.ts.announcement,
			default: '',
		},
	} as any);
	if (canceled || !result) return;

	const room = await misskeyApi('chat/rooms/create', {
		name: result.name,
		joinPolicy: result.joinPolicy,
		announcement: result.announcement,
	} as any);

	router.push(`/chat/room/${room.id}`);
}

async function joinByCode() {
	const { canceled, result } = await os.inputText({
		title: tChat('enterInviteCode'),
		minLength: 1,
	});
	if (canceled || !result) return;

	const room = await os.apiWithDialog('chat/rooms/join-by-code', {
		inviteCode: result,
	} as any);
	router.push(`/chat/room/${(room as any).id}`);
}

onMounted(() => {
	updateCurrentAccountPartial({ hasUnreadChatMessages: false });
});
</script>

<style lang="scss" module>
.start {
	margin: 0 auto;
}
</style>
