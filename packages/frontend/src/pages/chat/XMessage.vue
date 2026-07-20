<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="[$style.root, { [$style.isMe]: isMe, [$style.highlighted]: highlighted }]"
	:data-message-id="message.id"
>
	<MkAvatar v-if="message.fromUser" :class="$style.avatar" :user="message.fromUser" :link="!isMe" :preview="false"/>
	<div :class="$style.body" @contextmenu.stop="onContextmenu">
		<!-- name + time + compact action control (inline after time) -->
		<div :class="$style.header">
			<MkUserName v-if="prefer.s['chat.showSenderName'] && message.fromUser != null" :user="message.fromUser"/>
			<MkTime :class="$style.time" :time="message.createdAt"/>
			<div :class="$style.headerActions">
				<button
					ref="menuBtn"
					type="button"
					class="_textButton"
					:class="$style.headerAction"
					:aria-label="i18n.ts.menu"
					@click.stop="onMenuClick"
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
				<!-- Escrow chat: server reveals plaintext over TLS for authorized users (encryptedAtRest).
				     Legacy client E2EE (v1.): text null + ciphertext → local decrypt. Notes/posts never use this. -->
				<div v-if="showE2eeShell" :class="$style.e2eeBody">
					<span v-if="decrypting" :class="$style.e2eeMuted"><i class="ti ti-loader-2"></i></span>
					<template v-else-if="displayText">
						<Mfm
							class="_selectable"
							:class="$style.messageText"
							:text="displayText"
							:i="$i"
							:nyaize="'respect'"
						/>
					</template>
					<span v-else :class="$style.e2eeMuted"><i class="ti ti-lock"></i> {{ e2eeFailLabel }}</span>
				</div>
				<Mfm
					v-else-if="displayText"
					ref="text"
					class="_selectable"
					:class="$style.messageText"
					:text="displayText"
					:parsedNotes="parsed"
					:i="$i"
					:nyaize="'respect'"
					:enableEmojiMenu="true"
					:enableEmojiMenuReaction="true"
				/>
				<div v-if="translation" :class="$style.translation">
					<div :class="$style.translationLabel"><i class="ti ti-language"></i> {{ chatT('translated') }}</div>
					<div class="_selectable">{{ translation }}</div>
				</div>
				<ChatAttachment v-if="message.file" :file="message.file" :class="$style.file"/>
			</div>
		</MkFukidashi>
		<div v-if="hasUrlPreview" class="_gaps_s" style="margin: 8px 0;" @click.stop>
			<SkUrlPreviewGroup :sourceNodes="parsed" :showAsQuote="!message.fromUser?.rejectQuotes"/>
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
import { computed, defineAsyncComponent, inject, provide, ref, useTemplateRef, watch } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import type { MenuItem } from '@/types/menu.js';
import type { NormalizedChatMessage } from './chat-types.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import MkFukidashi from '@/components/MkFukidashi.vue';
import { decryptChatText } from './chat-e2ee.js';
import { chatT } from './chat-i18n.js';
import { chatWsKey, chatWsOrApi, chatRoomCanModerateKey } from './chat-ws.js';
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
import { instance } from '@/instance.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { miLocalStorage } from '@/local-storage.js';

const $i = ensureSignin();
const chatWs = inject(chatWsKey, null);
const roomCanMod = inject(chatRoomCanModerateKey, null);
const menuBtn = useTemplateRef<HTMLButtonElement>('menuBtn');

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
const e2eeFailLabel = chatT('e2eeDecryptFailed');
const translation = ref<string | null>(null);
const translating = ref(false);
const canTranslateChat = computed(() => {
	const enabled = (instance as any).aiTranslationPublic?.enableChat === true;
	if (!enabled) return false;
	const inst = (instance as any).chatTranslatorAvailable === true;
	// Local credentials live only in browser storage (never on server profile)
	let localOk = false;
	if ((instance as any).aiTranslationPublic?.allowUserApiKey === true) {
		try {
			const raw = miLocalStorage.getItem('aiTranslationClient');
			if (raw) {
				const o = JSON.parse(raw);
				localOk = !!(o?.baseUrl?.trim() && o?.apiKey?.trim());
			}
		} catch { /* ignore */ }
	}
	return inst || localOk;
});

/** Server-revealed plaintext (escrow) or plain message */
const serverText = computed(() => {
	const t = props.message.text;
	return t && String(t).length > 0 ? String(t) : null;
});

/** Need client-side decrypt only for legacy v1. when server left text empty */
const needsClientDecrypt = computed(() => {
	const m = props.message as any;
	if (!m.isE2ee) return false;
	if (serverText.value) return false;
	const ct = m.ciphertext;
	return typeof ct === 'string' && ct.startsWith('v1.');
});

const showE2eeShell = computed(() => {
	const m = props.message as any;
	// Lock shell only when still waiting on client decrypt / failed legacy decrypt
	return needsClientDecrypt.value || (m.isE2ee && !serverText.value && !decryptedText.value && m.ciphertext);
});

const displayText = computed(() => {
	return serverText.value ?? decryptedText.value;
});

watch(
	() => [
		(props.message as any).isE2ee,
		(props.message as any).ciphertext,
		props.message.fromUserId,
		props.message.text,
	] as const,
	async ([isE2ee, ciphertext, fromUserId, text]) => {
		decryptedText.value = null;
		// Escrow: server already put plaintext in text — no local decrypt
		if (text && String(text).length > 0) return;
		if (!isE2ee || !ciphertext || typeof ciphertext !== 'string') return;
		// Only legacy peer E2EE (v1.) is decrypted in the browser
		if (!String(ciphertext).startsWith('v1.')) return;
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
	const t = displayText.value;
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
	if (type.startsWith('video/')) return chatT('replyVideo');
	if (type.startsWith('image/')) return chatT('replyImage');
	if (type.startsWith('audio/')) return chatT('replyAudio');
	if (r.file || r.fileId) return chatT('replyFile');
	if (r.isE2ee) return chatT('replyE2ee');
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

function onMenuClick(ev: MouseEvent) {
	// Keep the event target (button) for popup anchor; do not preventDefault
	// (that can break focus/anchor for MkPopupMenu on some mobile browsers).
	showMenu(ev, false);
}

async function translateMessage() {
	if (translation.value) {
		translation.value = null;
		return;
	}
	if (translating.value || !displayText.value) return;
	translating.value = true;
	try {
		const userLang = ($i as any)?.aiTranslationConfig?.targetLang;
		const targetLang = (userLang && String(userLang).trim())
			|| miLocalStorage.getItem('lang')
			|| navigator.language;
		const selective = ($i as any)?.aiTranslationConfig?.selective;
		const allowLocal = (instance as any).aiTranslationPublic?.allowUserApiKey === true;

		if (allowLocal && displayText.value) {
			const { loadAiTranslationLocal, hasLocalAiCredentials, translateTextLocal } = await import('@/utility/ai-translation-local.js');
			const local = loadAiTranslationLocal();
			if (local.preferLocal && hasLocalAiCredentials(local)) {
				try {
					const localRes = await translateTextLocal(displayText.value, targetLang, {
						selective: typeof selective === 'boolean' ? selective : undefined,
					});
					if (localRes?.text) {
						translation.value = localRes.text;
						return;
					}
				} catch (e: any) {
					if (
						e?.code === 'AI_AUTH_FAILED'
						|| e?.code === 'AI_FORBIDDEN'
						|| e?.code === 'AI_PAYMENT_REQUIRED'
						|| e?.code === 'AI_BAD_REQUEST'
						|| e?.code === 'AI_RATE_LIMITED'
						|| e?.code === 'AI_BAD_GATEWAY'
						|| e?.code === 'AI_ORIGIN_UNREACHABLE'
					) {
						throw e;
					}
					console.warn('Local AI chat translate failed, falling back:', e);
				}
			}
		}

		const res = await misskeyApi('chat/messages/translate', {
			messageId: props.message.id,
			targetLang,
			...(typeof selective === 'boolean' ? { selective } : {}),
		}) as { text?: string };
		translation.value = res?.text ?? null;
	} catch (err) {
		console.error('Chat translation failed', err);
		try {
			const { formatApiError } = await import('@/utility/format-api-error.js');
			const formatted = formatApiError(err);
			os.alert({
				type: 'error',
				title: formatted.title,
				text: formatted.text,
			});
		} catch {
			os.alert({
				type: 'error',
				text: chatT('translateFailed'),
			});
		}
	} finally {
		translating.value = false;
	}
}

function buildMenu(): MenuItem[] {
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
			copyToClipboard(displayText.value ?? '');
		},
	});

	if (canTranslateChat.value && displayText.value && !translating.value) {
		menu.push({
			text: translation.value
				? chatT('hideTranslation')
				: (i18n.ts.translate as string),
			icon: 'ti ti-language',
			action: () => {
				void translateMessage();
			},
		});
	}

	menu.push({
		type: 'divider',
	});

	const roomId = (props.message as any).toRoomId as string | null | undefined;
	// Room owner / room admin / site staff (provided by room.vue) can delete others' room messages
	const allowModDelete = !isMe.value && !!roomId && (
		$i.isAdmin || $i.isModerator || roomCanMod?.value === true
	);
	const canDeleteOwn = isMe.value && $i.policies.chatAvailability === 'available';

	if ((canDeleteOwn || allowModDelete) && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: allowModDelete ? chatT('modDeleteMessage') : i18n.ts.delete,
			icon: 'ti ti-trash',
			danger: true,
			action: async () => {
				if (allowModDelete) {
					const { canceled } = await os.confirm({
						type: 'warning',
						text: chatT('modDeleteMessageConfirm'),
					});
					if (canceled) return;
				}
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

	// Drop trailing divider if last item is a divider
	while (menu.length && (menu[menu.length - 1] as any).type === 'divider') {
		menu.pop();
	}
	return menu;
}

function showMenu(ev: MouseEvent, contextmenu = false) {
	const menu = buildMenu();
	if (menu.length === 0) return;

	if (contextmenu) {
		void os.contextMenu(menu, ev);
	} else {
		const src = menuBtn.value
			?? getHTMLElementOrNull(ev.currentTarget)
			?? getHTMLElementOrNull(ev.target);
		void os.popupMenu(menu, src);
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
	/*
	  No sticky: sticky avatars cover the next message's ⋯ (others only).
	*/
	position: relative;
	z-index: 0;
	display: block;
	flex-shrink: 0;
	width: 50px;
	height: 50px;
	align-self: flex-start;
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
	flex: 1;
	position: relative;
	z-index: 2;
}

.header {
	min-height: 4px; // also positions fukidashi
	font-size: 80%;
	display: flex;
	align-items: center;
	gap: 0.5em;
	margin-bottom: 2px;
	flex-wrap: wrap;
	position: relative;
	z-index: 3;
}

.headerActions {
	display: inline-flex;
	align-items: center;
	gap: 0.15em;
	margin-left: 0.15em;
	opacity: 0.55;
	flex-shrink: 0;
	position: relative;
	z-index: 4;
	pointer-events: auto;
}

.headerAction {
	/* Compact control next to time (not a fat pill) */
	padding: 2px 4px;
	line-height: 1.2;
	font-size: 1.05em;
	color: inherit;
	/* Expand hit box without changing visual size */
	position: relative;

	&::before {
		content: '';
		position: absolute;
		inset: -8px -6px;
	}

	&:hover,
	&:active {
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

.translation {
	margin-top: 8px;
	padding-top: 8px;
	border-top: solid 1px var(--MI_THEME-divider);
	font-size: 0.95em;
	opacity: 0.92;
	white-space: pre-wrap;
	word-break: break-word;
}

.translationLabel {
	font-size: 0.85em;
	opacity: 0.7;
	margin-bottom: 4px;
	display: flex;
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
