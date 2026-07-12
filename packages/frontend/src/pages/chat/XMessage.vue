<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:id="`chat-msg-${message.id}`"
	:class="[$style.root, { [$style.isMe]: isMe, [$style.highlighted]: highlighted }]"
	:data-message-id="message.id"
>
	<MkAvatar :class="$style.avatar" :user="message.fromUser!" :link="!isMe" :preview="false"/>
	<div :class="$style.body" @contextmenu.stop="onContextmenu">
		<!-- name + time + message action menu (selector under bubble moved here; no reply hook) -->
		<div :class="$style.header">
			<MkUserName v-if="prefer.s['chat.showSenderName'] && message.fromUser != null" :user="message.fromUser"/>
			<MkTime :class="$style.time" :time="message.createdAt"/>
			<div :class="$style.headerActions">
				<button
					class="_textButton"
					:class="$style.headerAction"
					@click.stop="showMenu"
				>
					<i class="ti ti-dots-circle-horizontal"></i>
				</button>
			</div>
		</div>
		<!-- Reply + body in one bubble so they read as a single message -->
		<MkFukidashi :class="$style.fukidashi" :tail="isMe ? 'right' : 'left'" :accented="isMe">
			<div :class="$style.bubbleInner">
				<button
					v-if="replyPreview"
					type="button"
					class="_button"
					:class="$style.reply"
					@click.stop="onReplyClick"
				>
					<div :class="$style.replyAccent" aria-hidden="true"></div>
					<div :class="$style.replyBody">
						<div :class="$style.replyHead">
							<span :class="$style.replyName">{{ replyAuthorLabel }}</span>
						</div>
						<div :class="$style.replyText">{{ replyPreviewLabel }}</div>
					</div>
				</button>
				<div v-if="(message as any).isE2ee" :class="$style.e2eeBody">
					<span v-if="decrypting" :class="$style.e2eeMuted"><i class="ti ti-loader-2"></i></span>
					<template v-else-if="decryptedText">
						<Mfm
							class="_selectable"
							:class="$style.messageText"
							:text="decryptedText"
							:i="$i"
							:nyaize="'respect'"
						/>
					</template>
					<span v-else :class="$style.e2eeMuted"><i class="ti ti-lock"></i> {{ e2eeFailLabel }}</span>
				</div>
				<Mfm
					v-else-if="message.text"
					ref="text"
					class="_selectable"
					:class="$style.messageText"
					:text="message.text"
					:parsedNotes="parsed"
					:i="$i"
					:nyaize="'respect'"
					:enableEmojiMenu="true"
					:enableEmojiMenuReaction="true"
				/>
				<ChatAttachment v-if="message.file" :file="message.file" :class="$style.file"/>
			</div>
		</MkFukidashi>
		<div v-if="hasUrlPreview" class="_gaps_s" style="margin: 8px 0;" @click.stop>
			<SkUrlPreviewGroup :sourceNodes="parsed" :showAsQuote="!message.fromUser.rejectQuotes"/>
		</div>
		<!-- reactions back under the message -->
		<SkTransitionGroup
			:enterActiveClass="$style.transition_reaction_enterActive"
			:leaveActiveClass="$style.transition_reaction_leaveActive"
			:enterFromClass="$style.transition_reaction_enterFrom"
			:leaveToClass="$style.transition_reaction_leaveTo"
			:moveClass="$style.transition_reaction_move"
			tag="div" :class="$style.reactions"
		>
			<div v-for="record in message.reactions" :key="record.reaction + record.user.id" :class="[$style.reaction, record.user.id === $i.id ? $style.reactionMy : null]" @click.stop="onReactionClick(record)">
				<MkAvatar :user="record.user" :link="false" :class="$style.reactionAvatar"/>
				<MkReactionIcon
					:withTooltip="true"
					:reaction="record.reaction.replace(/^:(\w+):$/, ':$1@.:')"
					:noStyle="true"
					:class="$style.reactionIcon"
				/>
			</div>
		</SkTransitionGroup>
		<div v-if="isSearchResult" :class="$style.footer">
			<MkA v-if="'toRoom' in message && message.toRoom != null" :to="`/chat/room/${message.toRoomId}`">{{ message.toRoom.name }}</MkA>
			<MkA v-if="'toUser' in message && message.toUser != null && isMe" :to="`/chat/user/${message.toUserId}`">@{{ message.toUser.username }}</MkA>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, inject, provide, ref, watch } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import type { MenuItem } from '@/types/menu.js';
import type { NormalizedChatMessage } from './room.vue';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import MkFukidashi from '@/components/MkFukidashi.vue';
import { decryptChatText } from './chat-e2ee.js';
import { chatT, chatFb } from './chat-i18n.js';
import { chatWsKey, chatWsOrApi } from './chat-ws.js';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import ChatAttachment from './ChatAttachment.vue';
import { reactionPicker } from '@/utility/reaction-picker.js';
import * as sound from '@/utility/sound.js';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';
import SkTransitionGroup from '@/components/SkTransitionGroup.vue';
import SkUrlPreviewGroup from '@/components/SkUrlPreviewGroup.vue';

const $i = ensureSignin();
const chatWs = inject(chatWsKey, null);

const props = defineProps<{
	message: NormalizedChatMessage | Misskey.entities.ChatMessage;
	isSearchResult?: boolean;
	highlighted?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'reply', message: NormalizedChatMessage | Misskey.entities.ChatMessage): void;
	(ev: 'scrollToReply', id: string): void;
}>();

const isMe = computed(() => props.message.fromUserId === $i.id);
const decryptedText = ref<string | null>(null);
const decrypting = ref(false);
const e2eeFailLabel = chatT('e2eeDecryptFailed', chatFb.e2eeDecryptFailed);

watch(
	() => [(props.message as any).isE2ee, (props.message as any).ciphertext, props.message.fromUserId] as const,
	async ([isE2ee, ciphertext, fromUserId]) => {
		decryptedText.value = null;
		if (!isE2ee || !ciphertext || typeof ciphertext !== 'string') return;
		decrypting.value = true;
		try {
			decryptedText.value = await decryptChatText(String(fromUserId), ciphertext);
		} finally {
			decrypting.value = false;
		}
	},
	{ immediate: true },
);

const parsed = computed(() => {
	const t = (props.message as any).isE2ee ? decryptedText.value : props.message.text;
	return t ? mfm.parse(t) : [];
});
/** Skip URL preview work when message has no links (saves network + DOM) */
const hasUrlPreview = computed(() => {
	if (parsed.value.length === 0) return false;
	const walk = (nodes: any[]): boolean => {
		for (const n of nodes) {
			if (n?.type === 'url' || n?.type === 'link') return true;
			if (Array.isArray(n?.children) && walk(n.children)) return true;
		}
		return false;
	};
	return walk(parsed.value as any[]);
});
const replyPreview = computed(() => {
	const m = props.message as any;
	if (m.reply) {
		return m.reply as {
			id: string;
			text: string | null;
			isE2ee?: boolean;
			fromUserId: string;
			fromUsername?: string | null;
			fromName?: string | null;
			fromUser?: { username?: string; name?: string | null } | null;
			file?: { type?: string; name?: string | null } | null;
			fileId?: string | null;
		};
	}
	return null;
});

/** Media-only replies: show [视频]/[图片] etc. instead of bare ellipsis */
const replyPreviewLabel = computed(() => {
	const r = replyPreview.value;
	if (!r) return '';
	if (r.text && r.text.trim().length > 0) return r.text;
	const type = r.file?.type ?? '';
	if (type.startsWith('video/')) return chatT('replyVideo', chatFb.replyVideo);
	if (type.startsWith('image/')) return chatT('replyImage', chatFb.replyImage);
	if (type.startsWith('audio/')) return chatT('replyAudio', chatFb.replyAudio);
	if (r.file || r.fileId) return chatT('replyFile', chatFb.replyFile);
	if (r.isE2ee) return chatT('replyE2ee', chatFb.replyE2ee);
	return '…';
});

const replyAuthorLabel = computed(() => {
	const r = replyPreview.value;
	if (!r) return '';
	const name = r.fromName || r.fromUser?.name;
	const username = r.fromUsername || r.fromUser?.username;
	if (name && username) return `${name} (@${username})`;
	if (username) return `@${username}`;
	if (name) return name;
	return '…';
});

function onReplyClick() {
	if (!replyPreview.value) return;
	emit('scrollToReply', replyPreview.value.id);
}

async function sendReact(reaction: string) {
	await chatWsOrApi(
		chatWs,
		'react',
		{ messageId: props.message.id, reaction },
		'chat/messages/react',
		{ messageId: props.message.id, reaction },
	);
}

async function sendUnreact(reaction: string) {
	await chatWsOrApi(
		chatWs,
		'unreact',
		{ messageId: props.message.id, reaction },
		'chat/messages/unreact',
		{ messageId: props.message.id, reaction },
	);
}

async function sendDelete() {
	await chatWsOrApi(
		chatWs,
		'delete',
		{ messageId: props.message.id },
		'chat/messages/delete',
		{ messageId: props.message.id },
	);
}

provide(DI.mfmEmojiReactCallback, (reaction) => {
	if ($i.policies.chatAvailability !== 'available') return;

	sound.playMisskeySfx('reaction');
	void sendReact(reaction);
});

function react(ev: MouseEvent) {
	if ($i.policies.chatAvailability !== 'available') return;

	const targetEl = getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (!targetEl) return;

	reactionPicker.show(targetEl, null, async (reaction) => {
		sound.playMisskeySfx('reaction');
		await sendReact(reaction);
	});
}

function onReactionClick(record: Misskey.entities.ChatMessage['reactions'][0]) {
	if ($i.policies.chatAvailability !== 'available') return;

	if (record.user.id === $i.id) {
		void sendUnreact(record.reaction);
	} else {
		if (!props.message.reactions.some(r => r.user.id === $i.id && r.reaction === record.reaction)) {
			sound.playMisskeySfx('reaction');
			void sendReact(record.reaction);
		}
	}
}

function onContextmenu(ev: MouseEvent) {
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	showMenu(ev, true);
}

function showMenu(ev: MouseEvent, contextmenu = false) {
	const menu: MenuItem[] = [];

	if ($i.policies.chatAvailability === 'available') {
		menu.push({
			text: i18n.ts.reply,
			icon: 'ti ti-arrow-back-up',
			action: () => {
				emit('reply', props.message);
			},
		});
	}

	if (!isMe.value && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: i18n.ts.reaction,
			icon: 'ti ti-mood-plus',
			action: (ev) => {
				react(ev);
			},
		});

		menu.push({
			type: 'divider',
		});
	}

	menu.push({
		text: i18n.ts.copyContent,
		icon: 'ti ti-copy',
		action: () => {
			copyToClipboard(props.message.text ?? '');
		},
	});

	menu.push({
		type: 'divider',
	});

	if (isMe.value && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: i18n.ts.delete,
			icon: 'ti ti-trash',
			danger: true,
			action: () => {
				void sendDelete();
			},
		});
	}

	if (!isMe.value && props.message.fromUser != null) {
		menu.push({
			text: i18n.ts.reportAbuse,
			icon: 'ti ti-exclamation-circle',
			action: () => {
				// Structured deep links for admin abuse UI → jump into room/DM at this message
				const roomId = (props.message as any).toRoomId as string | null | undefined;
				const toUserId = (props.message as any).toUserId as string | null | undefined;
				const msgId = props.message.id;
				const lines: string[] = [];
				if (roomId) {
					lines.push(`${url}/chat/room/${roomId}?msg=${encodeURIComponent(msgId)}`);
				} else if (toUserId) {
					// 1:1: open conversation with the peer from reporter's perspective
					const peerId = props.message.fromUserId === $i.id ? toUserId : props.message.fromUserId;
					lines.push(`${url}/chat/user/${peerId}?msg=${encodeURIComponent(msgId)}`);
				}
				// Canonical landing (staff-capable redirect)
				lines.push(`${url}/chat/messages/${msgId}`);
				const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkAbuseReportWindow.vue')), {
					user: props.message.fromUser!,
					initialComment: `${lines.join('\n')}\n-----\n`,
				}, {
					closed: () => dispose(),
				});
			},
		});
	}

	if (contextmenu) {
		os.contextMenu(menu, ev);
	} else {
		os.popupMenu(menu, ev.currentTarget ?? ev.target);
	}
}
</script>

<style lang="scss" module>
.transition_reaction_move,
.transition_reaction_enterActive,
.transition_reaction_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_reaction_enterFrom,
.transition_reaction_leaveTo {
	opacity: 0;
	transform: scale(0.7);
}
.transition_reaction_leaveActive {
	position: absolute;
}

.root {
	position: relative;
	display: flex;
	scroll-margin: 80px;
	border-radius: 12px;
	transition: background-color 0.35s ease, box-shadow 0.35s ease;
	/*
	  Do NOT use content-visibility:auto here.
	  Estimated intrinsic height (e.g. 72px) vs real media rows (~200px)
	  makes the timeline jump while scrolling up OR down.
	*/

	&.isMe {
		flex-direction: row-reverse;
		text-align: right;

		.footer {
			flex-direction: row-reverse;
		}

		.header {
			flex-direction: row-reverse;
		}

		.headerActions {
			margin-left: 0;
			margin-right: 0.15em;
		}

		.reactions {
			justify-content: flex-end;
		}

		.reply {
			// keep quote LTR/start-aligned inside own bubble
			align-self: stretch;
		}
	}

	&.highlighted {
		background: color-mix(in srgb, var(--MI_THEME-accent) 18%, transparent);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--MI_THEME-accent) 45%, transparent);
	}
}

.avatar {
	position: sticky;
	top: calc(16px + var(--MI-stickyTop, 0px));
	display: block;
	width: 50px;
	height: 50px;
}

@container (max-width: 450px) {
	.root {
		&.isMe {
			.avatar {
				display: none;
			}
		}
	}

	.avatar {
		width: 42px;
		height: 42px;
	}

	.fukidashi {
		font-size: 90%;
	}
}

.body {
	margin: 0 12px;

	// https://stackoverflow.com/questions/36230944/prevent-flex-items-from-overflowing-a-container
	min-width: 0;
}

.header {
	min-height: 4px; // fukidashiの位置調整も兼ねるため
	font-size: 80%;
	display: flex;
	align-items: center;
	gap: 0.5em;
	margin-bottom: 2px;
	flex-wrap: wrap;
}

.headerActions {
	display: inline-flex;
	align-items: center;
	gap: 0.15em;
	margin-left: 0.15em;
	opacity: 0.55;
}

.headerAction {
	padding: 0 4px;
	line-height: 1.2;
	font-size: 1.05em;
	color: inherit;

	&:hover {
		opacity: 1;
		color: var(--MI_THEME-accent);
	}
}

.root:hover .headerActions,
.root:focus-within .headerActions {
	opacity: 0.9;
}

.bubbleInner {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
	text-align: left;
}

/* Quote strip inside the same bubble (Telegram-like) */
.reply {
	display: flex;
	align-items: stretch;
	gap: 0;
	font-size: 0.88em;
	margin: 0;
	padding: 0;
	width: 100%;
	max-width: 100%;
	overflow: hidden;
	border: none;
	border-radius: 8px;
	cursor: pointer;
	text-align: left;
	background: color-mix(in srgb, #000 12%, transparent);
	opacity: 0.95;

	&:hover {
		background: color-mix(in srgb, #000 18%, transparent);
	}
}

.root.isMe .reply {
	background: color-mix(in srgb, #fff 14%, transparent);

	&:hover {
		background: color-mix(in srgb, #fff 20%, transparent);
	}
}

.replyAccent {
	width: 3px;
	flex-shrink: 0;
	background: var(--MI_THEME-accent);
	border-radius: 3px 0 0 3px;
	opacity: 0.95;
}

.replyBody {
	flex: 1;
	min-width: 0;
	padding: 6px 10px 6px 8px;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.replyHead {
	display: flex;
	align-items: center;
	gap: 0.35em;
	font-size: 0.92em;
	font-weight: 700;
	color: var(--MI_THEME-accent);
	line-height: 1.2;
}

.replyName {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
}

.replyText {
	overflow: hidden;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	white-space: normal;
	min-width: 0;
	font-size: 0.95em;
	line-height: 1.35;
	opacity: 0.88;
	word-break: break-word;
}

.messageText {
	min-width: 0;
}

.file {
	/* Definite width so shrink-wrap fukidashi expands; video stays readable */
	align-self: stretch;
	width: min(72vw, 320px);
	max-width: 100%;
	min-width: min(100%, 200px);
	margin-top: 2px;
}

.e2eeBody {
	min-width: 0;
	text-align: left;
}

.e2eeMuted {
	opacity: 0.75;
	font-size: 0.92em;
	display: inline-flex;
	align-items: center;
	gap: 0.35em;
}

.fukidashi {
	text-align: left;
	/* Media + text: allow bubble to grow with ChatAttachment */
	max-width: min(85vw, 420px);
}

.content {
	overflow: clip;
	overflow-wrap: break-word;
	word-break: break-word;
}

.footer {
	display: flex;
	flex-direction: row;
	gap: 0.5em;
	margin-top: 4px;
	font-size: 75%;
}

.time {
	opacity: 0.5;
	font-size: 90%;
	flex-shrink: 0;
}

.reactions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-top: 8px;

	&:empty {
		display: none;
	}
}

.reaction {
	display: flex;
	align-items: center;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 999px;
	padding: 8px;
	cursor: pointer;

	&.reactionMy {
		border-color: var(--MI_THEME-accent);
	}
}

.reactionAvatar {
	width: 24px;
	height: 24px;
	margin-right: 8px;
}

.reactionIcon {
	width: 24px;
	height: 24px;
}
</style>
