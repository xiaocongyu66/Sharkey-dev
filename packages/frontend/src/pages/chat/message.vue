<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!--
  Deep-link landing for /chat/messages/:messageId (used in abuse reports).
  Resolves the message and redirects into the room/DM timeline with ?msg=
  so moderators land on the exact group message in context.
-->
<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<div v-if="error" class="_panel" style="padding: 20px; text-align: center;">
			<div style="margin-bottom: 12px;">{{ error }}</div>
			<div class="_buttonsCenter">
				<MkButton primary rounded @click="initialize">{{ i18n.ts.reload }}</MkButton>
				<MkButton rounded @click="router.push('/chat')">{{ i18n.ts.chat }}</MkButton>
			</div>
		</div>
		<div v-else>
			<MkLoading/>
			<div v-if="preview" style="margin-top: 16px; opacity: 0.85;">
				<XMessage :message="preview" :isSearchResult="true"/>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { formatApiError } from '@/utility/format-api-error.js';
import { $i } from '@/i.js';

const props = defineProps<{
	messageId?: string;
}>();

const router = useRouter();
const error = ref('');
const preview = ref<Misskey.entities.ChatMessage | null>(null);

async function initialize() {
	error.value = '';
	preview.value = null;
	if (!props.messageId) {
		error.value = i18n.ts.notFound;
		return;
	}

	try {
		const message = await misskeyApi('chat/messages/show', {
			messageId: props.messageId,
		});
		preview.value = message;

		// Prefer in-context jump (room / 1:1) so staff can moderate the thread
		if (message.toRoomId) {
			router.replace(`/chat/room/${message.toRoomId}?msg=${encodeURIComponent(message.id)}`);
			return;
		}

		// 1:1: open conversation with the peer, pin this message
		const meId = $i?.id;
		const peerId = message.toUserId
			? (message.fromUserId === meId ? message.toUserId : message.fromUserId)
			: message.fromUserId;
		if (peerId) {
			router.replace(`/chat/user/${peerId}?msg=${encodeURIComponent(message.id)}`);
			return;
		}
		error.value = i18n.ts.notFound;
	} catch (e: any) {
		const formatted = formatApiError(e);
		error.value = formatted.text || e?.message || i18n.ts.notFound;
	}
}

onMounted(() => {
	void initialize();
});

definePage({
	title: i18n.ts.chat,
});
</script>
