<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :reversed="tab === 'chat'" :tabs="headerTabs" :actions="headerActions" :thin="true" :class="$style.chatPage">
	<div v-if="tab === 'chat'" class="_spacer" :class="$style.chatSpacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 4px; --MI_SPACER-max: 8px; --MI_SPACER-h: 4px;">
		<div class="_gaps" :class="$style.chatGaps">
			<!-- Not signed in: login gate for room invite links -->
			<div v-if="!signedIn" class="_panel" style="padding: 20px; text-align: center;">
				<div style="font-size: 1.2em; font-weight: bold; margin-bottom: 8px;">
					<i class="ti ti-lock"></i> {{ tChat('signinToJoinRoom') }}
				</div>
				<div v-if="roomPreviewName" style="margin-bottom: 12px; opacity: 0.85;">
					{{ roomPreviewName }}
				</div>
				<div style="margin-bottom: 16px; opacity: 0.75;">
					{{ tChat('signinToJoinRoomHint') }}
				</div>
				<div class="_buttonsCenter">
					<MkButton primary rounded @click="doLogin">{{ i18n.ts.login }}</MkButton>
					<MkButton rounded @click="router.push('/')">{{ i18n.ts.home }}</MkButton>
				</div>
			</div>

			<template v-else>
				<!-- NagramX/Telegram pinned-message style announcement (sticky under header) -->
				<ChatAnnouncementBar
					v-if="room && (room as any).announcement && isMember"
					:text="(room as any).announcement"
					:title="i18n.ts.announcement"
					:editLabel="i18n.ts.edit"
					:canEdit="canEditAnnouncement"
					@edit="openAnnouncementEdit"
				/>
				<div v-if="room && (room as any).isMutedAll && isMember" class="_panel" style="padding: 10px 12px;">
					<MkInfo warn>
						<div style="font-weight: bold;">{{ tChat('mutedAll') }}</div>
						<div style="margin-top: 4px; opacity: 0.9;">{{ tChat('mutedAllHint') }}</div>
					</MkInfo>
				</div>

				<div v-if="initializing">
					<MkLoading/>
				</div>

				<!-- Not a member: join gate -->
				<div v-else-if="needJoin" class="_panel" style="padding: 20px;">
					<div style="font-size: 1.2em; font-weight: bold; margin-bottom: 8px;">
						{{ room?.name || '群聊' }}
					</div>
					<div v-if="room?.description" style="margin-bottom: 12px; opacity: 0.85; white-space: pre-wrap;">{{ room.description }}</div>
					<ChatAnnouncementBar
						v-if="(room as any)?.announcement"
						:text="(room as any).announcement"
						:title="i18n.ts.announcement"
						:editLabel="i18n.ts.edit"
						:canEdit="false"
						style="margin-bottom: 12px;"
					/>
					<div style="margin-bottom: 12px; opacity: 0.8;">
						{{ tChat('notAMember') }}
						<template v-if="joinPolicy === 'public'"> {{ tChat('canJoinDirectly') }}</template>
						<template v-else-if="joinPolicy === 'link'"> {{ tChat('needInviteCodeToJoin') }}</template>
						<template v-else-if="joinPolicy === 'invite'"> {{ tChat('needInvitationToJoin') }}</template>
						<template v-else> {{ tChat('joiningClosed') }}</template>
					</div>
					<div v-if="joinPolicy === 'link'" style="margin-bottom: 12px;">
						<MkInput v-model="joinCode" :placeholder="tChat('inviteCode')">
							<template #prefix><i class="ti ti-key"></i></template>
						</MkInput>
					</div>
					<div v-if="joinError" style="color: var(--MI_THEME-error); margin-bottom: 12px;">{{ joinError }}</div>
					<div class="_buttons">
						<MkButton
							v-if="joinPolicy === 'public' || joinPolicy === 'link'"
							primary
							rounded
							:disabled="joining || (joinPolicy === 'link' && !joinCode)"
							@click="doJoin"
						>
							{{ joining ? tChat('joining') : tChat('joinRoom') }}
						</MkButton>
						<MkButton rounded @click="router.push('/chat')">{{ i18n.ts.chat }}</MkButton>
					</div>
				</div>

				<div v-else-if="loadError" class="_panel" style="padding: 20px; text-align: center;">
					<div style="margin-bottom: 12px;">{{ loadError }}</div>
					<MkButton primary rounded @click="initialize">{{ i18n.ts.reload }}</MkButton>
				</div>

				<template v-else>
				<div v-if="messages.length === 0">
					<div class="_gaps" style="text-align: center;">
						<div>{{ i18n.ts._chat.noMessagesYet }}</div>
						<template v-if="user">
							<div v-if="user.chatScope === 'followers'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowers }}</div>
							<div v-else-if="user.chatScope === 'following'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowing }}</div>
							<div v-else-if="user.chatScope === 'mutual'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromMutualFollowing }}</div>
							<div v-else-if="user.chatScope === 'none'">{{ i18n.ts._chat.thisUserNotAllowedChatAnyone }}</div>
						</template>
						<template v-else-if="room">
							<div>{{ i18n.ts._chat.inviteUserToChat }}</div>
						</template>
					</div>
				</div>

				<div v-else ref="timelineEl" class="_gaps" :class="$style.timeline">
					<!-- TG-style: auto-load older messages when sentinel enters viewport (no layout thrash) -->
					<div
						v-if="canFetchMore"
						ref="loadMoreSentinel"
						:class="$style.loadMoreSentinel"
						aria-hidden="true"
					>
						<div v-if="moreFetching" :class="$style.loadingOlder">
							<MkLoading :inline="true" :colored="false"/>
						</div>
						<button
							v-else
							type="button"
							class="_textButton"
							:class="$style.loadMoreManual"
							@click="fetchMore"
						>
							{{ i18n.ts.loadMore }}
						</button>
					</div>

					<!-- No TransitionGroup: move/enter animations cause history jump (乱窜) -->
					<div class="_gaps" :class="$style.msgList">
						<div
							v-for="item in timeline.toReversed()"
							:key="item.id"
							:class="$style.msgRow"
						>
							<XMessage
								v-if="item.type === 'item'"
								:message="item.data"
								:highlighted="highlightId === item.data.id"
								@reply="onReply"
								@scrollToReply="scrollToMessage"
							/>
							<div v-else-if="item.type === 'date'" :class="$style.dateDivider">
								<span><i class="ti ti-chevron-up"></i> {{ item.nextText }}</span>
								<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
								<span>{{ item.prevText }} <i class="ti ti-chevron-down"></i></span>
							</div>
						</div>
					</div>
				</div>

				<div v-if="user && (!user.canChat || user.host !== null)">
					<MkInfo warn>{{ i18n.ts._chat.chatNotAvailableInOtherAccount }}</MkInfo>
				</div>

				<MkInfo v-if="$i && $i.policies.chatAvailability !== 'available'" warn>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
				</template>
			</template>
		</div>
	</div>

	<div v-else-if="tab === 'search' && isMember" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XSearch :userId="userId" :roomId="roomId" @jump="onSearchJump"/>
	</div>

	<div v-else-if="tab === 'members' && isMember" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XMembers v-if="room != null" :room="room" @inviteUser="inviteUser"/>
	</div>

	<div v-else-if="tab === 'info' && isMember" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XInfo v-if="room != null" :room="room"/>
	</div>

	<div v-else-if="tab === 'manage' && isMember && canModerate" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XManage v-if="room != null" :room="room" @updated="refreshRoom" @cleared="onRoomCleared"/>
	</div>

	<template #footer>
		<div v-if="tab === 'chat' && signedIn && isMember" :class="$style.footer">
			<div class="_gaps">
				<Transition name="fade">
					<div v-show="showIndicator" :class="$style.new">
						<button class="_buttonPrimary" :class="$style.newButton" @click="onIndicatorClick">
							<i class="fas ti-fw fa-arrow-circle-down" :class="$style.newIcon"></i>{{ i18n.ts._chat.newMessage }}
						</button>
					</div>
				</Transition>
				<XForm
					v-if="!initializing"
					:user="user"
					:room="room"
					:replyTo="replyTo"
					:wsSend="wsSendMessage"
					:class="$style.form"
					@clearReply="replyTo = null"
				/>
			</div>
		</div>
	</template>
</PageWithHeader>

<!-- NagramX/Telegram: floating @ mentions button (bottom-right), not a top bar -->
<button
	v-if="tab === 'chat' && mentions.length > 0 && isMember && !mentionsDismissed"
	type="button"
	class="_button"
	:class="$style.mentionFab"
	:disabled="mentionJumping"
	:title="mentionBarLabel"
	@click="onMentionFabClick"
>
	<i class="ti ti-at"></i>
	<span v-if="mentions.length > 0" :class="$style.mentionBadge">{{ mentions.length > 99 ? '99+' : mentions.length }}</span>
</button>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, onMounted, onBeforeUnmount, onDeactivated, onActivated, nextTick, provide, watch } from 'vue';
// note: $i may be null for invite-link visitors
import * as Misskey from 'misskey-js';
import { getScrollContainer } from '@@/js/scroll.js';
import XMessage from './XMessage.vue';
import XForm from './room.form.vue';
import XSearch from './room.search.vue';
import XMembers from './room.members.vue';
import XInfo from './room.info.vue';
import XManage from './room.manage.vue';
import ChatAnnouncementBar from './ChatAnnouncementBar.vue';
import type { PageHeaderItem } from '@/types/page-header.js';
import * as os from '@/os.js';
import { useStream } from '@/stream.js';
import * as sound from '@/utility/sound.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import { useRouter } from '@/router.js';
import { useMutationObserver } from '@/use/use-mutation-observer.js';
import MkInfo from '@/components/MkInfo.vue';
import { makeDateSeparatedTimelineComputedRef } from '@/utility/timeline-date-separate.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { chatT, chatFb, ensureChatLocaleFresh } from './chat-i18n.js';
import { chatWsKey, createChatWsFromConnection } from './chat-ws.js';

const router = useRouter();
const signedIn = computed(() => $i != null);
ensureChatLocaleFresh();
function tChat(key: keyof typeof chatFb) {
	return chatT(key, chatFb[key]);
}

const props = defineProps<{
	userId?: string;
	roomId?: string;
}>();

export type NormalizedChatMessage = Omit<Misskey.entities.ChatMessageLite, 'fromUser' | 'reactions'> & {
	fromUser: Misskey.entities.UserLite;
	reactions: (Misskey.entities.ChatMessageLite['reactions'][number] & {
		user: Misskey.entities.UserLite;
	})[];
};

const initializing = ref(true);
const moreFetching = ref(false);
/** True while loading older history — blocks stick-to-bottom / move jank */
const historyLoading = ref(false);
const messages = ref<NormalizedChatMessage[]>([]);
const canFetchMore = ref(false);
/** Soft cap at live edge: drop oldest when new msgs arrive (content-visibility handles offscreen). */
const MAX_MESSAGES = 320;
const PAGE_LIMIT = 30;
const user = ref<Misskey.entities.UserDetailed | null>(null);
const room = ref<Misskey.entities.ChatRoom | null>(null);
const replyTo = ref<NormalizedChatMessage | null>(null);
const highlightId = ref<string | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | null = null;
const needJoin = ref(false);
const joining = ref(false);
const joinCode = ref('');
const joinError = ref('');
const loadError = ref('');
const roomPreviewName = ref('');
const isMember = ref(false);
const joinPolicy = ref<'public' | 'link' | 'invite' | 'closed'>('invite');

/** Messages that @mention the current user (Telegram-style jump list) */
const mentions = ref<Array<{ id: string; fromUserId: string; text: string | null }>>([]);
const mentionCursor = ref(0);
const mentionJumping = ref(false);
const mentionsDismissed = ref(false);

const mentionBarLabel = computed(() => {
	const n = mentions.value.length;
	if (n === 0) return '';
	const i = Math.min(mentionCursor.value, n - 1) + 1;
	return `${tChat('mentionsOfYou')} ${i}/${n}`;
});

function onReply(message: NormalizedChatMessage | Misskey.entities.ChatMessage) {
	replyTo.value = message as NormalizedChatMessage;
}

function dismissMentions() {
	mentionsDismissed.value = true;
	mentions.value = [];
}

function isMentionOfMe(text: string | null | undefined): boolean {
	if (!text || !$i) return false;
	const username = $i.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// @username boundary (not part of longer handle)
	const re = new RegExp(`(^|[^\\w])@${username}(?![\\w-])`, 'i');
	return re.test(text);
}

async function loadMentionsForRoom() {
	if (!props.roomId || !$i || mentionsDismissed.value) {
		mentions.value = [];
		return;
	}
	try {
		const q = `@${$i.username}`;
		const found = await misskeyApi('chat/messages/search', {
			query: q,
			roomId: props.roomId,
			limit: 50,
		} as never) as Array<{ id: string; fromUserId: string; text: string | null }>;

		// newest first
		const filtered = found
			.filter(m => m.fromUserId !== $i!.id && isMentionOfMe(m.text))
			.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

		mentions.value = filtered;
		mentionCursor.value = 0;
	} catch {
		// search may fail; fall back to scanning loaded messages
		const fromTimeline = messages.value
			.filter(m => m.fromUserId !== $i!.id && isMentionOfMe(m.text))
			.map(m => ({ id: m.id, fromUserId: m.fromUserId, text: m.text }));
		mentions.value = fromTimeline;
		mentionCursor.value = 0;
	}
}

async function ensureMessageLoaded(id: string): Promise<boolean> {
	if (messages.value.some(m => m.id === id) || window.document.getElementById(`chat-msg-${id}`)) {
		return true;
	}
	if (!props.roomId && !props.userId) return false;

	// Load older pages until the message appears or we exhaust history
	// (IDs are time-ordered snowflakes: smaller id = older)
	let safety = 0;
	while (canFetchMore.value && safety < 40) {
		safety++;
		const oldestBefore = messages.value[messages.value.length - 1]?.id;
		await fetchMore();
		await nextTick();
		if (messages.value.some(m => m.id === id) || window.document.getElementById(`chat-msg-${id}`)) {
			return true;
		}
		const oldestAfter = messages.value[messages.value.length - 1]?.id;
		// No progress
		if (oldestBefore && oldestAfter && oldestBefore === oldestAfter) break;
		// Already loaded messages older than target without finding it → gone/deleted
		if (oldestAfter && oldestAfter < id) break;
	}
	return messages.value.some(m => m.id === id) || !!window.document.getElementById(`chat-msg-${id}`);
}

async function goMention(delta: number) {
	if (mentions.value.length === 0 || mentionJumping.value) return;
	if (delta !== 0) {
		const n = mentions.value.length;
		mentionCursor.value = (mentionCursor.value + delta + n) % n;
	}
	const target = mentions.value[mentionCursor.value];
	if (!target) return;

	mentionJumping.value = true;
	try {
		await ensureMessageLoaded(target.id);
		await nextTick();
		scrollToMessage(target.id);
	} finally {
		mentionJumping.value = false;
	}
}

/**
 * Each tap: jump to one @ mention, then drop it (viewed once).
 * When the list is empty the FAB disappears — no endless cycling.
 */
async function onMentionFabClick() {
	if (mentions.value.length === 0 || mentionJumping.value) return;
	// Always take the head (newest remaining)
	mentionCursor.value = 0;
	const target = mentions.value[0];
	if (!target) return;

	mentionJumping.value = true;
	try {
		await ensureMessageLoaded(target.id);
		await nextTick();
		scrollToMessage(target.id);
		// Mark as viewed: remove from queue
		mentions.value = mentions.value.filter(m => m.id !== target.id);
		if (mentions.value.length === 0) {
			mentionsDismissed.value = true;
		}
	} finally {
		mentionJumping.value = false;
	}
}

const canModerate = computed(() => {
	if (!room.value || !$i) return false;
	const role = (room.value as any).myRole;
	return role === 'owner' || role === 'admin' || $i.isAdmin || $i.isModerator;
});

const canEditAnnouncement = canModerate;

function openAnnouncementEdit() {
	tab.value = canModerate.value ? 'manage' : 'info';
}

async function refreshRoom() {
	if (!props.roomId) return;
	try {
		const r = await misskeyApi('chat/rooms/show', { roomId: props.roomId }) as any;
		room.value = r as Misskey.entities.ChatRoom;
	} catch { /* ignore */ }
}

function onRoomCleared() {
	messages.value = [];
	canFetchMore.value = false;
}

/** Prefer WebSocket for room + 1:1 messages; returns true if handed to WS */
function wsSendMessage(payload: {
	text?: string;
	fileId?: string;
	replyId?: string;
	isE2ee?: boolean;
	ciphertext?: string;
}): boolean {
	if (!connection.value) return false;
	if (!props.roomId && !props.userId) return false;
	try {
		(connection.value as any).send('msg', {
			text: payload.text ?? null,
			fileId: payload.fileId ?? null,
			replyId: payload.replyId ?? null,
			isE2ee: payload.isE2ee === true,
			ciphertext: payload.ciphertext ?? null,
		});
		return true;
	} catch {
		return false;
	}
}

function scrollToMessage(id: string) {
	const el = window.document.getElementById(`chat-msg-${id}`);
	if (el == null) {
		os.alert({
			type: 'info',
			text: i18n.ts.notFound,
		});
		return;
	}
	el.scrollIntoView({ behavior: 'smooth', block: 'center' });
	highlightId.value = id;
	if (highlightTimer) clearTimeout(highlightTimer);
	highlightTimer = setTimeout(() => {
		if (highlightId.value === id) highlightId.value = null;
	}, 1800);
}

/** From search tab: switch to chat and scroll to the message (load history if needed) */
async function onSearchJump(messageId: string) {
	tab.value = 'chat';
	await nextTick();
	// Wait a frame for chat DOM to mount
	await new Promise<void>(r => requestAnimationFrame(() => r()));
	const ok = await ensureMessageLoaded(messageId);
	await nextTick();
	if (ok) {
		scrollToMessage(messageId);
	} else {
		// Message may be outside loaded pages; try one more full fetch pass then show not found
		os.alert({
			type: 'info',
			text: i18n.ts.notFound,
		});
	}
}
const connection = ref<Misskey.IChannelConnection<Misskey.Channels['chatUser']> | Misskey.IChannelConnection<Misskey.Channels['chatRoom']> | null>(null);
/** Prefer WebSocket for chat actions (msg / react / delete / clear) */
const chatWs = createChatWsFromConnection(() => connection.value);
provide(chatWsKey, chatWs);
const showIndicator = ref(false);
const stream = useStream();
const streamState = ref(stream.state);
function onStreamState() {
	streamState.value = stream.state;
	// Re-subscribe chat channel after reconnect so WS stays live
	if (stream.state === 'connected' && isMember.value) {
		if (props.roomId && room.value) {
			void enterRoomChannel();
		} else if (props.userId && user.value) {
			connection.value?.dispose();
			connection.value = stream.useChannel('chatUser', { otherId: user.value.id });
			connection.value.on('message', onMessage);
			connection.value.on('deleted', onDeleted);
			connection.value.on('react', onReact);
			connection.value.on('unreact', onUnreact);
			(connection.value as any).on('msgError', onMsgError);
		}
	}
}
function onMsgError(err: { message?: string; code?: string; remainingSeconds?: number }) {
	const code = err?.code ?? '';
	const map: Record<string, string> = {
		ROOM_MUTED_ALL: tChat('mutedAllComposerDisabled'),
		NOT_A_MEMBER: tChat('notAMember'),
		ROOM_RATE_LIMITED: tChat('roomRateLimited'),
		SEND_FAILED: tChat('wsSendFailed'),
		REACT_FAILED: tChat('wsSendFailed'),
		DELETE_FAILED: tChat('wsSendFailed'),
		CLEAR_FAILED: tChat('wsSendFailed'),
	};
	let text = map[code] || err?.message || err?.code || tChat('wsSendFailed');
	if (code === 'ROOM_RATE_LIMITED' && err?.remainingSeconds) {
		text = `${text} (${err.remainingSeconds}s)`;
	}
	os.alert({ type: 'error', text: String(text) });
}
const timelineEl = useTemplateRef('timelineEl');
const timeline = makeDateSeparatedTimelineComputedRef(messages);

// read invite code from ?code= or ?inviteCode=
try {
	const q = new URLSearchParams(window.location.search);
	const code = q.get('code') || q.get('inviteCode') || '';
	if (code) joinCode.value = code;
} catch { /* ignore */ }

function doLogin() {
	try {
		pleaseLogin({
			path: props.roomId ? `/chat/room/${props.roomId}${joinCode.value ? `?code=${encodeURIComponent(joinCode.value)}` : ''}` : '/chat',
			message: tChat('signinToJoinRoomHint'),
		});
	} catch {
		// pleaseLogin throws after opening the sign-in dialog
	}
}

/** Only stick when truly near live edge — avoid yanking while reading history / loading */
const SCROLL_HEAD_THRESHOLD = 48;

function isNearLiveEdge(container: HTMLElement | null): boolean {
	if (!container) return true;
	// column-reverse: scrollTop is typically ≤ 0; near 0 = viewing newest
	return Math.abs(container.scrollTop) < SCROLL_HEAD_THRESHOLD;
}

// column-reverse: stick-to-bottom is usually free, but some browsers drift.
// Only re-stick on childList when already at live edge and not loading history.
useMutationObserver(timelineEl, {
	subtree: false,
	childList: true,
	attributes: false,
}, () => {
	if (historyLoading.value || moreFetching.value) return;
	const el = timelineEl.value;
	if (!el) return;
	const scrollContainer = getScrollContainer(el);
	if (!scrollContainer || !isNearLiveEdge(scrollContainer)) return;
	scrollContainer.scrollTo({
		top: 0,
		behavior: 'instant',
	});
});

const loadMoreSentinel = useTemplateRef<HTMLElement>('loadMoreSentinel');
let loadMoreIo: IntersectionObserver | null = null;

function teardownLoadMoreIo() {
	loadMoreIo?.disconnect();
	loadMoreIo = null;
}

function setupLoadMoreIo() {
	teardownLoadMoreIo();
	const sentinel = loadMoreSentinel.value;
	if (!sentinel || typeof IntersectionObserver === 'undefined') return;
	const root = getScrollContainer(sentinel);
	loadMoreIo = new IntersectionObserver((entries) => {
		for (const e of entries) {
			if (!e.isIntersecting) continue;
			if (!canFetchMore.value || moreFetching.value || historyLoading.value) continue;
			void fetchMore();
		}
	}, {
		root: root ?? null,
		// Prefetch a bit before the user hits the absolute top
		rootMargin: '240px 0px',
		threshold: 0,
	});
	loadMoreIo.observe(sentinel);
}

watch([loadMoreSentinel, canFetchMore, () => messages.value.length], () => {
	nextTick(() => {
		if (canFetchMore.value && loadMoreSentinel.value) {
			setupLoadMoreIo();
		} else {
			teardownLoadMoreIo();
		}
	});
});

function normalizeMessage(message: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage): NormalizedChatMessage {
	const me = $i!;
	return {
		...message,
		fromUser: message.fromUser ?? (message.fromUserId === me.id ? me : user.value!),
		reactions: message.reactions.map(record => ({
			...record,
			user: record.user ?? (message.fromUserId === me.id ? user.value! : me),
		})),
	};
}

async function enterRoomChannel() {
	if (!room.value || !isMember.value) return;
	connection.value?.dispose();
	connection.value = useStream().useChannel('chatRoom', {
		roomId: room.value.id,
	});
	connection.value.on('message', onMessage);
	connection.value.on('deleted', onDeleted);
	connection.value.on('react', onReact);
	connection.value.on('unreact', onUnreact);
	// WS admin / clear broadcast
	(connection.value as any).on('cleared', onRoomCleared);
	(connection.value as any).on('msgError', onMsgError);
}

async function loadRoomTimeline() {
	const LIMIT = PAGE_LIMIT;
	const m = await misskeyApi('chat/messages/room-timeline', { roomId: props.roomId, limit: LIMIT });
	messages.value = (m as Misskey.entities.ChatMessagesRoomTimelineResponse).map(x => normalizeMessage(x));
	canFetchMore.value = messages.value.length === LIMIT;
	await enterRoomChannel();
	// non-blocking: find who @mentioned you
	void loadMentionsForRoom();
}

async function doJoin() {
	if (!props.roomId || !$i) return;
	joining.value = true;
	joinError.value = '';
	try {
		if (joinPolicy.value === 'public') {
			await misskeyApi('chat/rooms/join', {
				roomId: props.roomId,
			} as any);
		} else if (joinPolicy.value === 'link') {
			if (!joinCode.value) {
				throw new Error(tChat('needInviteCodeToJoin'));
			}
			await misskeyApi('chat/rooms/join', {
				roomId: props.roomId,
				inviteCode: joinCode.value,
			} as any);
		} else {
			throw new Error(tChat('needInvitationToJoin'));
		}
		// refresh membership + timeline
		needJoin.value = false;
		isMember.value = true;
		await initialize();
	} catch (e: any) {
		joinError.value = e?.message || e?.error?.message || e?.id || tChat('joinFailed');
	} finally {
		joining.value = false;
	}
}

async function initialize() {
	const LIMIT = PAGE_LIMIT;

	initializing.value = true;
	loadError.value = '';
	needJoin.value = false;
	messages.value = [];
	canFetchMore.value = false;
	historyLoading.value = false;
	mentions.value = [];
	mentionCursor.value = 0;
	mentionsDismissed.value = false;

	try {
		if (!$i) {
			// unauthenticated: stop spinner and show login UI
			roomPreviewName.value = props.roomId ? `ID ${props.roomId}` : '';
			initializing.value = false;
			return;
		}

		if (props.userId) {
			const [u, m] = await Promise.all([
				misskeyApi('users/show', { userId: props.userId }),
				misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit: LIMIT }),
			]);

			user.value = u;
			isMember.value = true;
			messages.value = m.map(x => normalizeMessage(x));

			if (messages.value.length === LIMIT) {
				canFetchMore.value = true;
			}

			connection.value?.dispose();
			connection.value = useStream().useChannel('chatUser', {
				otherId: user.value.id,
			});
			connection.value.on('message', onMessage);
			connection.value.on('deleted', onDeleted);
			connection.value.on('react', onReact);
			connection.value.on('unreact', onUnreact);
		} else if (props.roomId) {
			const r = await misskeyApi('chat/rooms/show', { roomId: props.roomId }) as any;
			room.value = r as Misskey.entities.ChatRoom;
			roomPreviewName.value = r.name ?? '';
			joinPolicy.value = r.joinPolicy ?? 'invite';
			const member = r.isMember === true || r.myRole != null || r.ownerId === $i.id;
			isMember.value = member;

			if (!member) {
				needJoin.value = true;
				// auto-join public rooms when opened via link
				if (r.joinPolicy === 'public') {
					// keep join button, don't auto-join without consent
				} else if ((r.joinPolicy === 'link') && joinCode.value) {
					// prefilled code ready
				}
				initializing.value = false;
				return;
			}

			await loadRoomTimeline();
		}
	} catch (e: any) {
		const code = e?.code || e?.error?.code || '';
		const msg = e?.message || e?.error?.message || String(e);
		if (code === 'NO_SUCH_ROOM' || /no such room/i.test(msg)) {
			// might be non-member timeline denial
			if (room.value && !isMember.value) {
				needJoin.value = true;
			} else {
				loadError.value = tChat('roomOpenFailed');
			}
		} else if (code === 'CREDENTIAL_REQUIRED' || /signin|credential/i.test(msg)) {
			loadError.value = tChat('signinToJoinRoom');
		} else {
			loadError.value = msg || tChat('loadFailed');
		}
	}

	window.document.addEventListener('visibilitychange', onVisibilitychange);
	initializing.value = false;
}

let isActivated = true;

onActivated(() => {
	isActivated = true;
});

onDeactivated(() => {
	isActivated = false;
});

async function fetchMore() {
	if (moreFetching.value || !canFetchMore.value) return;
	if (messages.value.length === 0) return;

	const LIMIT = PAGE_LIMIT;
	moreFetching.value = true;
	historyLoading.value = true;

	const scrollContainer = timelineEl.value ? getScrollContainer(timelineEl.value) : null;
	// Anchor to current oldest message so viewport doesn't jump after prepend
	const anchorId = messages.value[messages.value.length - 1].id;
	const anchorElBefore = window.document.getElementById(`chat-msg-${anchorId}`);
	const anchorTopBefore = anchorElBefore?.getBoundingClientRect().top ?? null;

	try {
		const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
			userId: user.value!.id,
			limit: LIMIT,
			untilId: anchorId,
		}) : await misskeyApi('chat/messages/room-timeline', {
			roomId: room.value!.id,
			limit: LIMIT,
			untilId: anchorId,
		});

		if (newMessages.length === 0) {
			canFetchMore.value = false;
			return;
		}

		// Append older messages (array is newest-first)
		messages.value.push(...newMessages.map(x => normalizeMessage(x)));
		canFetchMore.value = newMessages.length === LIMIT;

		await nextTick();
		// Pin the anchor message to the same screen Y (works with column-reverse)
		if (scrollContainer && anchorTopBefore != null) {
			const anchorElAfter = window.document.getElementById(`chat-msg-${anchorId}`);
			if (anchorElAfter) {
				const anchorTopAfter = anchorElAfter.getBoundingClientRect().top;
				const drift = anchorTopAfter - anchorTopBefore;
				if (drift !== 0) {
					scrollContainer.scrollTop += drift;
				}
			}
		}
	} catch {
		// keep canFetchMore; user can retry via sentinel / button
	} finally {
		moreFetching.value = false;
		// Two frames so layout + paint settle before stick-to-bottom is allowed again
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				historyLoading.value = false;
			});
		});
	}
}

function onMessage(message: Misskey.entities.ChatMessageLite) {
	if (!$i) return;
	sound.playMisskeySfx('chatMessage');

	messages.value.unshift(normalizeMessage(message));

	// Cap while live: drop oldest beyond window (can re-fetch via scroll-up)
	if (messages.value.length > MAX_MESSAGES) {
		const overflow = messages.value.length - MAX_MESSAGES;
		messages.value.splice(messages.value.length - overflow, overflow);
		canFetchMore.value = true;
	}

	// Live-update @mentions of me
	if (
		!mentionsDismissed.value &&
		props.roomId &&
		message.fromUserId !== $i.id &&
		isMentionOfMe(message.text)
	) {
		if (!mentions.value.some(m => m.id === message.id)) {
			mentions.value = [
				{ id: message.id, fromUserId: message.fromUserId, text: message.text },
				...mentions.value,
			];
		}
	}

	// TODO: DOM的にバックグラウンドになっていないかどうかも考慮する
	if (message.fromUserId !== $i.id && !window.document.hidden && isActivated) {
		connection.value?.send('read', {
			id: message.id,
		});
	}

	if (message.fromUserId !== $i.id) {
		//notifyNewMessage();
	}
}

function onDeleted(id: string) {
	const index = messages.value.findIndex(m => m.id === id);
	if (index !== -1) {
		messages.value.splice(index, 1);
	}
}

function onReact(ctx: Parameters<Misskey.Channels['chatUser']['events']['react']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['react']>[0]) {
	if (!$i) return;
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (message) {
		if (room.value == null) { // 1on1の時はuserは省略される
			message.reactions.push({
				reaction: ctx.reaction,
				user: message.fromUserId === $i.id ? user.value! : $i,
			});
		} else {
			message.reactions.push({
				reaction: ctx.reaction,
				user: ctx.user!,
			});
		}
	}
}

function onUnreact(ctx: Parameters<Misskey.Channels['chatUser']['events']['unreact']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['unreact']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (message) {
		const index = message.reactions.findIndex(r => r.reaction === ctx.reaction && r.user.id === ctx.user!.id);
		if (index !== -1) {
			message.reactions.splice(index, 1);
		}
	}
}

function onIndicatorClick() {
	showIndicator.value = false;
}

function notifyNewMessage() {
	showIndicator.value = true;
}

function onVisibilitychange() {
	if (window.document.hidden) return;
	// TODO
}

onMounted(() => {
	stream.on('_connected_', onStreamState);
	stream.on('_disconnected_', onStreamState);
	initialize();
});

onBeforeUnmount(() => {
	teardownLoadMoreIo();
	stream.off('_connected_', onStreamState);
	stream.off('_disconnected_', onStreamState);
	connection.value?.dispose();
	window.document.removeEventListener('visibilitychange', onVisibilitychange);
});

async function inviteUser() {
	if (room.value == null) return;

	const invitee = await os.selectUser({ includeSelf: false, localOnly: true });
	os.apiWithDialog('chat/rooms/invitations/create', {
		roomId: room.value.id,
		userId: invitee.id,
	});
}

const tab = ref('chat');

const headerTabs = computed(() => {
	// On narrow screens icon-only tabs shrink the second header row ("chin")
	const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 500px)').matches;

	if (room.value && isMember.value) {
		const tabs: Array<{ key: string; title: string; icon: string; iconOnly?: boolean }> = [{
			key: 'chat',
			title: i18n.ts.chat,
			icon: 'ti ti-messages',
			iconOnly: narrow,
		}, {
			key: 'members',
			title: i18n.ts._chat.members,
			icon: 'ti ti-users',
			iconOnly: narrow,
		}, {
			key: 'info',
			title: tChat('about'),
			icon: 'ti ti-info-circle',
			iconOnly: narrow,
		}];
		if (canModerate.value) {
			tabs.push({
				key: 'manage',
				title: tChat('manage'),
				icon: 'ti ti-settings',
				iconOnly: narrow,
			});
		}
		return tabs as any;
	}
	// 1:1 chat
	return [{
		key: 'chat',
		title: i18n.ts.chat,
		icon: 'ti ti-messages',
	}];
});

// Top-right: search (mobile + desktop) — replaces the old ⋯ invite/leave menu
const headerActions = computed<PageHeaderItem[]>(() => {
	if (!isMember.value || !$i) return [];
	return [{
		icon: 'ti ti-search',
		text: i18n.ts.search,
		handler: () => {
			tab.value = 'search';
		},
	}];
});

definePage(computed(() => {
	if (!initializing.value) {
		if (user.value) {
			return {
				userName: user.value,
				title: user.value.name ?? user.value.username,
				avatar: user.value,
			};
		} else if (room.value) {
			return {
				title: room.value.name,
				icon: 'ti ti-users',
			};
		} else {
			return {
				title: i18n.ts.chat,
			};
		}
	} else {
		return {
			title: i18n.ts.chat,
		};
	}
}));
</script>

<style lang="scss" module>
.timeline {
	/* Isolate paint; rows use content-visibility on XMessage */
	contain: layout style;
}

.msgList {
	/* Avoid FLIP/move thrash when prepending history */
	overflow-anchor: none;
}

.msgRow {
	/* Hint for content-visibility intrinsic size on children */
	overflow-anchor: none;
}

.loadMoreSentinel {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 36px;
	padding: 6px 0 10px;
}

.loadingOlder {
	opacity: 0.75;
	transform: scale(0.85);
}

.loadMoreManual {
	font-size: 0.85em;
	opacity: 0.75;
	padding: 6px 12px;
}

.root {
}

.more {
	margin: 0 auto;
}

.footer {
	width: 100%;
	padding-top: 4px;
}

.new {
	width: 100%;
	padding-bottom: 8px;
	text-align: center;
}

.newButton {
	display: inline-block;
	margin: 0;
	padding: 0 12px;
	line-height: 32px;
	font-size: 12px;
	border-radius: 16px;
}

.newIcon {
	display: inline-block;
	margin-right: 8px;
}

.footer {

}

.form {
	margin: 0 auto;
	width: 100%;
	max-width: 700px;
}

.fade-enter-active, .fade-leave-active {
	transition: opacity 0.1s;
}

.fade-enter-from, .fade-leave-to {
	transition: opacity 0.5s;
	opacity: 0;
}

.dateDivider {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	opacity: 0.75;
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: 999px;
	width: fit-content;
	padding: 0.5em 1em;
	margin: 0 auto;
}

/* Tighter top padding on mobile chat (reduce gap under header) */
.chatSpacer {
	--MI_SPACER-h: 4px;
	--MI_SPACER-min: 2px;
	--MI_SPACER-max: 8px;
	padding-top: 2px !important;
}

.chatGaps {
	gap: 6px !important;
}

/* Compact sticky header: less padding under room name on mobile */
.chatPage {
	:global([class*='lower']) {
		--height: 34px !important;
	}
	:global([class*='upper']) {
		--height: 42px !important;
	}
	:global([class*='titleContainer']) {
		margin-left: 8px !important;
	}
	:global([class*='titleAvatarContainer']) {
		padding: 4px !important;
	}
}

/* Floating @ button — sit above the compact composer, don't cover it */
.mentionFab {
	position: fixed;
	right: max(12px, env(safe-area-inset-right, 0px));
	/* Higher than composer (~52–64px) so it doesn't sit on the input */
	bottom: calc(72px + env(safe-area-inset-bottom, 0px) + var(--MI-stickyBottom, 0px));
	z-index: 40;
	width: 40px;
	height: 40px;
	border-radius: 999px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-size: 1.15em;
	color: var(--MI_THEME-fgOnAccent, #fff);
	background: var(--MI_THEME-accent);
	box-shadow: 0 3px 12px color-mix(in srgb, var(--MI_THEME-accent) 40%, #000 20%);
	pointer-events: auto;

	&:hover:not(:disabled) {
		filter: brightness(1.06);
	}

	&:disabled {
		opacity: 0.55;
	}
}

.mentionBadge {
	position: absolute;
	top: -3px;
	right: -3px;
	min-width: 16px;
	height: 16px;
	padding: 0 4px;
	border-radius: 999px;
	font-size: 10px;
	font-weight: 700;
	line-height: 16px;
	text-align: center;
	color: var(--MI_THEME-accent);
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-accent);
	box-sizing: border-box;
}
</style>
