<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon>
		<i v-if="report.resolved && report.resolvedAs === 'accept'" class="ti ti-check" style="color: var(--MI_THEME-success)"></i>
		<i v-else-if="report.resolved && report.resolvedAs === 'reject'" class="ti ti-x" style="color: var(--MI_THEME-error)"></i>
		<i v-else-if="report.resolved" class="ti ti-slash"></i>
		<i v-else class="ti ti-exclamation-circle" style="color: var(--MI_THEME-warn)"></i>
	</template>
	<template #label><MkAcct :user="report.targetUser"/> (by <MkAcct :user="report.reporter"/>)</template>
	<template #caption>{{ report.comment }}</template>
	<template #suffix><MkTime :time="report.createdAt"/></template>
	<template #footer>
		<div class="_buttons">
			<template v-if="!report.resolved">
				<MkButton @click="resolve('accept')"><i class="ti ti-check" style="color: var(--MI_THEME-success)"></i> {{ i18n.ts._abuseUserReport.resolve }} ({{ i18n.ts._abuseUserReport.accept }})</MkButton>
				<MkButton @click="resolve('reject')"><i class="ti ti-x" style="color: var(--MI_THEME-error)"></i> {{ i18n.ts._abuseUserReport.resolve }} ({{ i18n.ts._abuseUserReport.reject }})</MkButton>
				<MkButton @click="resolve(null)"><i class="ti ti-slash"></i> {{ i18n.ts._abuseUserReport.resolve }} ({{ i18n.ts.other }})</MkButton>
			</template>
			<template v-if="report.targetUser.host != null">
				<MkButton :disabled="report.forwarded" primary @click="forward"><i class="ti ti-corner-up-right"></i> {{ i18n.ts._abuseUserReport.forward }}</MkButton>
				<div v-tooltip:dialog="i18n.ts._abuseUserReport.forwardDescription" class="_button _help"><i class="ti ti-help-circle"></i></div>
			</template>
			<button class="_button" style="margin-left: auto; width: 34px;" @click="showMenu"><i class="ti ti-dots"></i></button>
		</div>
	</template>

	<div class="_gaps_s">
		<MkFolder :withSpacer="false">
			<template #icon><MkAvatar :user="report.targetUser" style="width: 18px; height: 18px;"/></template>
			<template #label>{{ i18n.ts.target }}: <MkAcct :user="report.targetUser"/></template>
			<template #suffix>{{ i18n.ts.id }}# {{ report.targetUserId }}</template>

			<div style="--MI-stickyTop: 0; --MI-stickyBottom: 0;">
				<admin-user :userId="report.targetUserId" :userHint="report.targetUser"></admin-user>
			</div>
		</MkFolder>

		<MkFolder v-if="report.targetInstance" :withSpacer="false">
			<template #icon>
				<img
					v-if="targetInstanceIcon"
					:src="targetInstanceIcon"
					:alt="i18n.tsx.instanceIconAlt({ name: report.targetInstance.name || report.targetInstance.host })"
					:class="$style.instanceIcon"
					class="icon"
				/>
			</template>
			<template #label>{{ i18n.ts.instance }}: {{ report.targetInstance.name || report.targetInstance.host }}</template>
			<template #suffix>{{ i18n.ts.id }}# {{ report.targetInstance.id }}</template>

			<div style="--MI-stickyTop: 0; --MI-stickyBottom: 0;">
				<instance-info :host="report.targetInstance.host" :instanceHint="report.targetInstance" :metaHint="metaHint"></instance-info>
			</div>
		</MkFolder>

		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-message-2"></i></template>
			<template #label>{{ i18n.ts.details }}</template>
			<div class="_gaps_s">
				<!-- Chat / group message deep link from report comment -->
				<div v-if="chatTarget" class="_panel" style="padding: 12px;">
					<div style="font-weight: bold; margin-bottom: 6px;">
						<i class="ti ti-messages"></i>
						{{ chatTarget.kind === 'room' ? '群聊消息举报' : chatTarget.kind === 'user' ? '私聊消息举报' : '聊天消息举报' }}
					</div>
					<div style="opacity: 0.85; font-size: 0.9em; margin-bottom: 10px; word-break: break-all;">
						{{ chatTarget.url }}
					</div>
					<div v-if="chatPreviewLoading" style="opacity: 0.7; margin-bottom: 8px; font-size: 0.9em;">
						<i class="ti ti-loader-2"></i> 加载消息预览…
					</div>
					<div v-else-if="chatPreview" class="_panel" style="padding: 10px; margin-bottom: 10px; background: color-mix(in srgb, var(--MI_THEME-fg) 6%, transparent);">
						<div style="font-size: 0.85em; opacity: 0.75; margin-bottom: 4px;">
							@{{ chatPreview.fromUser?.username ?? chatPreview.fromUserId }}
							· <MkTime :time="chatPreview.createdAt"/>
						</div>
						<div style="white-space: pre-wrap; word-break: break-word;">
							{{ chatPreviewText }}
						</div>
						<div v-if="chatPreview.file" style="margin-top: 6px; opacity: 0.8; font-size: 0.9em;">
							<i class="ti ti-paperclip"></i> {{ chatPreview.file.name || chatPreview.file.type }}
						</div>
					</div>
					<div class="_buttons">
						<MkButton primary @click="openChatTarget">
							<i class="ti ti-arrow-right"></i>
							{{ chatTarget.kind === 'room' ? '跳转到群聊消息' : '跳转到聊天消息' }}
						</MkButton>
						<MkButton @click="copyChatUrl">
							<i class="ti ti-copy"></i>
							{{ i18n.ts.copyLink }}
						</MkButton>
					</div>
				</div>
				<Mfm :text="report.comment" :parsedNodes="parsedComment" :isBlock="true" :linkNavigationBehavior="'window'" :author="report.reporter" :nyaize="false" :isAnim="false"/>
				<div class="_gaps_s" @click.stop>
					<SkUrlPreviewGroup :sourceNodes="parsedComment" :compact="false" :detail="false" :showAsQuote="true"/>
				</div>
			</div>
		</MkFolder>

		<MkFolder :withSpacer="false">
			<template #icon><MkAvatar :user="report.reporter" style="width: 18px; height: 18px;"/></template>
			<template #label>{{ i18n.ts.reporter }}: <MkAcct :user="report.reporter"/></template>
			<template #suffix>{{ i18n.ts.id }}# {{ report.reporterId }}</template>

			<div style="--MI-stickyTop: 0; --MI-stickyBottom: 0;">
				<admin-user :userId="report.reporterId" :userHint="report.reporter"></admin-user>
			</div>
		</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-message-2"></i></template>
			<template #label>{{ i18n.ts.staffNotes }}</template>
			<template #suffix>{{ moderationNote.length > 0 ? '...' : i18n.ts.none }}</template>
			<div class="_gaps_s">
				<MkTextarea v-model="moderationNote" manualSave>
					<template #caption>{{ i18n.ts.moderationNoteDescription }}</template>
				</MkTextarea>
			</div>
		</MkFolder>

		<div v-if="report.assignee">
			{{ i18n.ts.moderator }}:
			<MkAcct :user="report.assignee"/>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed, provide, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import * as mfm from 'mfm-js';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { dateString } from '@/filters/date.js';
import MkFolder from '@/components/MkFolder.vue';
import RouterView from '@/components/global/RouterView.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { createRouter } from '@/router.js';
import { getProxiedImageUrlNullable } from '@/utility/media-proxy';
import InstanceInfo from '@/pages/instance-info.vue';
import { iAmAdmin } from '@/i';
import { misskeyApi } from '@/utility/misskey-api';
import AdminUser from '@/pages/admin-user.vue';
import SkUrlPreviewGroup from '@/components/SkUrlPreviewGroup.vue';
import { useRouter } from '@/router.js';

const props = withDefaults(defineProps<{
	report: Misskey.entities.AdminAbuseUserReportsResponse[number];
	metaHint?: Misskey.entities.AdminMetaResponse | undefined;
}>(), {
	metaHint: undefined,
});

const emit = defineEmits<{
	(ev: 'resolved', reportId: string): void;
}>();

/*
const targetRouter = createRouter(`/admin/user/${props.report.targetUserId}`);
targetRouter.init();
const reporterRouter = createRouter(`/admin/user/${props.report.reporterId}`);
reporterRouter.init();
*/

const router = useRouter();
const parsedComment = computed(() => mfm.parse(props.report.comment));

type ChatTarget = {
	kind: 'message' | 'room' | 'user';
	messageId?: string | null;
	roomId?: string | null;
	userId?: string | null;
	path: string;
	url: string;
};

/**
 * Parse chat deep links embedded in report comments by XMessage:
 *   {origin}/chat/messages/{messageId}
 *   {origin}/chat/room/{roomId}?msg={messageId}
 *   {origin}/chat/user/{userId}?msg={messageId}
 * Also tolerates bare paths and multiline comments.
 */
function parseChatTarget(comment: string): ChatTarget | null {
	if (!comment) return null;
	// Prefer room deep-link with msg= (opens group context for staff)
	const roomMsg = comment.match(/(?:https?:\/\/[^\s<>"']+)?\/chat\/room\/([a-zA-Z0-9]+)[^\s<>"']*\bmsg=([a-zA-Z0-9]+)/i)
		?? comment.match(/(?:https?:\/\/[^\s<>"']+)?\/chat\/room\/([a-zA-Z0-9]+)/i);
	if (roomMsg) {
		const roomId = roomMsg[1];
		const messageId = roomMsg[2] ?? null;
		const path = messageId
			? `/chat/room/${roomId}?msg=${encodeURIComponent(messageId)}`
			: `/chat/room/${roomId}`;
		const full = comment.match(/https?:\/\/[^\s<>"']*\/chat\/room\/[a-zA-Z0-9]+[^\s<>"']*/i);
		return {
			kind: 'room',
			roomId,
			messageId,
			path,
			url: full?.[0] ?? path,
		};
	}
	const userMsg = comment.match(/(?:https?:\/\/[^\s<>"']+)?\/chat\/user\/([a-zA-Z0-9]+)[^\s<>"']*\bmsg=([a-zA-Z0-9]+)/i)
		?? comment.match(/(?:https?:\/\/[^\s<>"']+)?\/chat\/user\/([a-zA-Z0-9]+)/i);
	if (userMsg) {
		const userId = userMsg[1];
		const messageId = userMsg[2] ?? null;
		const path = messageId
			? `/chat/user/${userId}?msg=${encodeURIComponent(messageId)}`
			: `/chat/user/${userId}`;
		const full = comment.match(/https?:\/\/[^\s<>"']*\/chat\/user\/[a-zA-Z0-9]+[^\s<>"']*/i);
		return {
			kind: 'user',
			userId,
			messageId,
			path,
			url: full?.[0] ?? path,
		};
	}
	// Canonical message landing (redirects into room/user)
	const msgPath = comment.match(/(?:https?:\/\/[^\s<>"']+)?\/chat\/messages\/([a-zA-Z0-9]+)/i);
	if (msgPath) {
		const messageId = msgPath[1];
		const full = comment.match(/https?:\/\/[^\s<>"']*\/chat\/messages\/[a-zA-Z0-9]+/i);
		return {
			kind: 'message',
			messageId,
			path: `/chat/messages/${messageId}`,
			url: full?.[0] ?? `/chat/messages/${messageId}`,
		};
	}
	return null;
}

const chatTarget = computed(() => parseChatTarget(props.report.comment ?? ''));

const chatPreview = ref<Misskey.entities.ChatMessage | null>(null);
const chatPreviewLoading = ref(false);
const chatPreviewText = computed(() => {
	const m = chatPreview.value;
	if (!m) return '';
	if (m.text && m.text.trim()) return m.text;
	if ((m as any).isE2ee) return '[加密消息]';
	if (m.file?.type?.startsWith('video/')) return '[视频]';
	if (m.file?.type?.startsWith('image/')) return '[图片]';
	if (m.file) return `[文件] ${m.file.name || ''}`;
	return '…';
});

async function loadChatPreview() {
	chatPreview.value = null;
	const t = chatTarget.value;
	const messageId = t?.messageId;
	if (!messageId) return;
	chatPreviewLoading.value = true;
	try {
		const message = await misskeyApi('chat/messages/show', { messageId });
		chatPreview.value = message;
		// Upgrade bare /chat/messages/:id to room path when possible (staff)
		if (t && t.kind === 'message' && message.toRoomId) {
			// rewrite path for open button (computed is readonly — store upgrade separately via preview)
			(t as ChatTarget).kind = 'room';
			(t as ChatTarget).roomId = message.toRoomId;
			(t as ChatTarget).path = `/chat/room/${message.toRoomId}?msg=${encodeURIComponent(message.id)}`;
		}
	} catch {
		chatPreview.value = null;
	} finally {
		chatPreviewLoading.value = false;
	}
}

watch(chatTarget, () => {
	void loadChatPreview();
}, { immediate: true });

const targetInstanceIcon = computed(() => props.report.targetInstance?.faviconUrl
	? getProxiedImageUrlNullable(props.report.targetInstance.faviconUrl, 'preview')
	: props.report.targetInstance?.iconUrl
		? getProxiedImageUrlNullable(props.report.targetInstance.iconUrl, 'preview')
		: null);

const moderationNote = ref(props.report.moderationNote ?? '');

watch(moderationNote, async () => {
	os.apiWithDialog('admin/update-abuse-user-report', {
		reportId: props.report.id,
		moderationNote: moderationNote.value,
	}).then(() => {
	});
});

function resolve(resolvedAs) {
	os.apiWithDialog('admin/resolve-abuse-user-report', {
		reportId: props.report.id,
		resolvedAs,
	}).then(() => {
		emit('resolved', props.report.id);
	});
}

function forward() {
	os.apiWithDialog('admin/forward-abuse-user-report', {
		reportId: props.report.id,
	}).then(() => {

	});
}

function resolveOpenPath(): string {
	const t = chatTarget.value;
	if (!t) return '/chat';
	// Prefer resolved room path from preview when comment only had /chat/messages/:id
	const preview = chatPreview.value;
	if (preview?.toRoomId && (t.kind === 'message' || t.messageId === preview.id)) {
		return `/chat/room/${preview.toRoomId}?msg=${encodeURIComponent(preview.id)}`;
	}
	if (preview && !preview.toRoomId && preview.toUserId && t.kind === 'message') {
		const peer = preview.fromUserId === props.report.reporterId
			? preview.toUserId
			: (preview.fromUserId === props.report.targetUserId ? preview.fromUserId : preview.fromUserId);
		return `/chat/user/${peer}?msg=${encodeURIComponent(preview.id)}`;
	}
	return t.path;
}

function openChatTarget() {
	const path = resolveOpenPath();
	// New window so admin keeps the report list open
	try {
		os.pageWindow(path);
	} catch {
		router.push(path);
	}
}

function copyChatUrl() {
	if (!chatTarget.value) return;
	copyToClipboard(chatTarget.value.url);
}

function showMenu(ev: MouseEvent) {
	const items: any[] = [{
		icon: 'ti ti-hash',
		text: 'Copy ID',
		action: () => {
			copyToClipboard(props.report.id);
		},
	}, {
		icon: 'ti ti-json',
		text: 'Copy JSON',
		action: () => {
			copyToClipboard(JSON.stringify(props.report, null, '\t'));
		},
	}];
	if (chatTarget.value) {
		items.unshift({
			icon: 'ti ti-messages',
			text: chatTarget.value.kind === 'room' ? '跳转到群聊消息' : '跳转到聊天消息',
			action: () => openChatTarget(),
		});
	}
	os.popupMenu(items, ev.currentTarget ?? ev.target);
}
</script>

<style lang="scss" module>
.instanceIcon {
	width: 18px;
	height: 18px;
}
</style>
