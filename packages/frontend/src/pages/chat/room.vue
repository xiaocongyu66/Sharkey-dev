<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<!-- Chat uses normal (non-reversed) page scroll: oldest→newest DOM, stick to bottom.
     column-reverse caused scrollTop sign flips and history jump (乱窜). -->
<PageWithHeader v-model:tab="tab" :reversed="false" :tabs="headerTabs" :actions="headerActions" :thin="true" :class="$style.chatPage">
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
					v-if="room && (room as any).announcement && canViewTimeline"
					:text="(room as any).announcement"
					:title="i18n.ts.announcement"
					:editLabel="i18n.ts.edit"
					:canEdit="canEditAnnouncement"
					@edit="openAnnouncementEdit"
				/>
				<div v-if="room && isStaffViewer && !isMember && canViewTimeline" class="_panel" style="padding: 10px 12px;">
					<MkInfo>
						<div style="font-weight: bold;">{{ tChat('staffReadonlyView') }}</div>
						<div style="margin-top: 4px; opacity: 0.9;">{{ tChat('staffReadonlyViewHint') }}</div>
					</MkInfo>
				</div>
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
					<!-- History status: async background prefetch (not scroll-chained dynamic load) -->
					<div v-if="canFetchMore || historyPrefetching || moreFetching" :class="$style.loadMoreSentinel">
						<div v-if="historyPrefetching || moreFetching" :class="$style.loadingOlder">
							<MkLoading :inline="true" :colored="false"/>
							<span v-if="historyPrefetchLabel" :class="$style.prefetchLabel">{{ historyPrefetchLabel }}</span>
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

					<!-- Chronological list + viewport lazy mount. No TransitionGroup. -->
					<div class="_gaps" :class="$style.msgList">
						<div
							v-for="item in displayTimeline"
							:key="item.id"
							:class="[$style.msgRow, { [$style.msgRowLive]: item.type === 'item' && item.data.id === messages[0]?.id }]"
						>
							<ChatMessageLazy
								v-if="item.type === 'item'"
								:message="item.data"
								:highlighted="highlightId === item.data.id"
								:forceMount="item.data.id === pinnedViewMessageId || item.data.id === highlightId || item.data.id === messages[0]?.id"
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

	<div v-else-if="tab === 'search' && canViewTimeline" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XSearch :userId="userId" :roomId="roomId" @jump="onSearchJump"/>
	</div>

	<div v-else-if="tab === 'members' && canViewTimeline" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XMembers v-if="room != null" :room="room" @inviteUser="inviteUser"/>
	</div>

	<div v-else-if="tab === 'info' && canViewTimeline" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XInfo v-if="room != null" :room="room"/>
	</div>

	<div v-else-if="tab === 'manage' && canModerate" class="_spacer" style="--MI_SPACER-w: 700px;">
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
	v-if="tab === 'chat' && mentions.length > 0 && canViewTimeline && !mentionsDismissed"
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
import ChatMessageLazy from './ChatMessageLazy.vue';
import XForm from './room.form.vue';
import XSearch from './room.search.vue';
import XMembers from './room.members.vue';
import XInfo from './room.info.vue';
import XManage from './room.manage.vue';
import ChatAnnouncementBar from './ChatAnnouncementBar.vue';
import { ChatHistoryPrefetcher, loadUntilMessageFound } from './chat-history-loader.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import * as os from '@/os.js';
import { useStream, wakeStream } from '@/stream.js';
import * as sound from '@/utility/sound.js';
import { i18n } from '@/i18n.js';
import { $i, iAmModerator } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import { useRouter } from '@/router.js';
import MkInfo from '@/components/MkInfo.vue';
import { makeDateSeparatedTimelineComputedRef } from '@/utility/timeline-date-separate.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { chatT, chatFb, ensureChatLocaleFresh } from './chat-i18n.js';
import { chatWsKey, chatRoomCanModerateKey, createChatWsFromConnection } from './chat-ws.js';
import { formatApiError } from '@/utility/format-api-error.js';

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
/** Background async prefetch running (multi-page pipeline) */
const historyPrefetching = ref(false);
const historyPrefetchLabel = ref('');
const messages = ref<NormalizedChatMessage[]>([]);
const canFetchMore = ref(false);
/** Soft cap at live edge: drop oldest when new msgs arrive (only when viewing newest). */
const MAX_MESSAGES = 400;
const PAGE_LIMIT = 40;
/** Soft trim when tab is backgrounded (keep-alive / hidden) */
const BACKGROUND_MESSAGE_CAP = 80;
/** Background history memory ceiling */
const HISTORY_MEMORY_CAP = 900;
/** Concurrent normalize workers when merging a page */
const NORMALIZE_POOL = 6;

let historyPrefetcher: ChatHistoryPrefetcher<NormalizedChatMessage> | null = null;
const knownMessageIds = new Set<string>();
const user = ref<Misskey.entities.UserDetailed | null>(null);
const room = ref<Misskey.entities.ChatRoom | null>(null);
const replyTo = ref<NormalizedChatMessage | null>(null);
const highlightId = ref<string | null>(null);
/**
 * After search/mention jump: keep this message in the loaded window and
 * do not stick-to-live when new WS messages arrive (avoids "being pushed away").
 */
const pinnedViewMessageId = ref<string | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | null = null;
let scrollListenCleanup: (() => void) | null = null;
const needJoin = ref(false);
const joining = ref(false);
const joinCode = ref('');
const joinError = ref('');
const loadError = ref('');
const roomPreviewName = ref('');
const isMember = ref(false);
const joinPolicy = ref<'public' | 'link' | 'invite' | 'closed'>('invite');
/** Staff may open any room timeline without joining (abuse-report deep links). */
const isStaffViewer = computed(() => iAmModerator);
/** Can read timeline: member or staff */
const canViewTimeline = computed(() => isMember.value || isStaffViewer.value);

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

function rebuildKnownIds() {
	knownMessageIds.clear();
	for (const m of messages.value) knownMessageIds.add(m.id);
}

function mergeOlderPage(page: NormalizedChatMessage[]) {
	if (!page.length) {
		canFetchMore.value = false;
		return;
	}
	const fresh = page.filter(m => !knownMessageIds.has(m.id));
	if (!fresh.length) {
		// All duplicates — still advance exhausted if short page handled by caller
		return;
	}
	for (const m of fresh) knownMessageIds.add(m.id);
	// Array is newest-first: older pages append at end
	messages.value.push(...fresh);
	if (messages.value.length > HISTORY_MEMORY_CAP && !pinnedViewMessageId.value) {
		// Soft trim from oldest end when not pinned
		const overflow = messages.value.length - HISTORY_MEMORY_CAP;
		const dropped = messages.value.splice(messages.value.length - overflow, overflow);
		for (const d of dropped) knownMessageIds.delete(d.id);
		canFetchMore.value = true;
	}
}

/** Prefer WS history when channel is open; REST fallback. */
async function fetchTimelinePage(args: {
	limit: number;
	untilId?: string | null;
	sinceId?: string | null;
}) {
	const untilId = args.untilId ?? null;
	const sinceId = args.sinceId ?? null;
	const conn = connection.value;
	if (conn && chatWs.ready()) {
		try {
			const res = await chatWs.request<{
				messages?: any[];
				hasMore?: boolean;
			}>(
				'history',
				{ limit: args.limit, untilId, sinceId },
				'history',
				'historyError',
				props.userId
					? 'chat/messages/user-timeline'
					: 'chat/messages/room-timeline',
				props.userId
					? {
						userId: user.value!.id,
						limit: args.limit,
						...(untilId ? { untilId } : {}),
						...(sinceId ? { sinceId } : {}),
					}
					: {
						roomId: room.value?.id ?? props.roomId,
						limit: args.limit,
						...(untilId ? { untilId } : {}),
						...(sinceId ? { sinceId } : {}),
					},
			);
			const list = (res as any)?.messages ?? (Array.isArray(res) ? res : []);
			return (list as any[]).map(x => normalizeMessage(x));
		} catch {
			// fall through to REST
		}
	}
	if (props.userId && user.value) {
		const raw = await misskeyApi('chat/messages/user-timeline', {
			userId: user.value.id,
			limit: args.limit,
			...(untilId ? { untilId } : {}),
			...(sinceId ? { sinceId } : {}),
		});
		return raw.map(x => normalizeMessage(x));
	}
	if (props.roomId && (room.value || props.roomId)) {
		const raw = await misskeyApi('chat/messages/room-timeline', {
			roomId: room.value?.id ?? props.roomId,
			limit: args.limit,
			...(untilId ? { untilId } : {}),
			...(sinceId ? { sinceId } : {}),
		});
		return (raw as Misskey.entities.ChatMessagesRoomTimelineResponse).map(x => normalizeMessage(x));
	}
	return [];
}

function makeTimelineFetcher() {
	return (args: { limit: number; untilId: string | null }) => fetchTimelinePage({
		limit: args.limit,
		untilId: args.untilId,
	});
}

/**
 * Start / restart background async history pipeline (not tied to scroll chain).
 * Uses cooperative multi-async page loading with UI idle yields.
 */
function startHistoryPrefetch() {
	stopHistoryPrefetch();
	if (!canFetchMore.value || messages.value.length === 0) return;
	if (!props.roomId && !props.userId) return;

	const oldestId = messages.value[messages.value.length - 1]?.id ?? null;
	historyPrefetcher = new ChatHistoryPrefetcher<NormalizedChatMessage>({
		pageSize: PAGE_LIMIT,
		maxPages: 30,
		maxMessages: HISTORY_MEMORY_CAP,
		fetchPage: makeTimelineFetcher(),
		shouldPause: () => !isActivated || window.document.hidden,
		onPage: (page, meta) => {
			if (!page.length) {
				canFetchMore.value = false;
				historyPrefetching.value = false;
				historyPrefetchLabel.value = '';
				return;
			}
			// Preserve scroll when user is reading history and DOM grows above
			const sc = getChatScrollContainer();
			const reading = isReadingHistory(sc);
			const anchorId = reading ? (messages.value[0]?.id ?? oldestId) : null;
			const anchorEl = anchorId ? window.document.getElementById(`chat-msg-${anchorId}`) : null;
			const anchorTop = anchorEl?.getBoundingClientRect().top ?? null;
			const prevH = sc?.scrollHeight ?? 0;
			const prevTop = sc?.scrollTop ?? 0;

			mergeOlderPage(page);
			canFetchMore.value = page.length >= PAGE_LIMIT && !historyPrefetcher?.isExhausted;
			historyPrefetchLabel.value = canFetchMore.value
				? `${messages.value.length}`
				: '';

			void nextTick().then(() => {
				requestAnimationFrame(() => {
					if (!sc?.isConnected) return;
					if (reading && prevH > 0) {
						// Keep viewport while reading older messages
						preserveScrollAfterPrepend(sc, prevH, prevTop, anchorId, anchorTop);
					} else if (!reading && isNearLiveEdge(sc) && Date.now() >= userScrollUntil) {
						// Stay at live edge when background prefetch grows the top
						scrollToLiveEdge('instant');
					}
				});
			});

			if (historyPrefetcher?.isExhausted) {
				canFetchMore.value = false;
				historyPrefetching.value = false;
				historyPrefetchLabel.value = '';
			}
		},
	});
	historyPrefetching.value = true;
	historyPrefetchLabel.value = '…';
	historyPrefetcher.start(oldestId);
}

function stopHistoryPrefetch() {
	historyPrefetcher?.stop();
	historyPrefetcher = null;
	historyPrefetching.value = false;
	historyPrefetchLabel.value = '';
}

async function ensureMessageLoaded(id: string): Promise<boolean> {
	if (knownMessageIds.has(id) || messages.value.some(m => m.id === id) || window.document.getElementById(`chat-msg-${id}`)) {
		return true;
	}
	if (!props.roomId && !props.userId) return false;

	// Async multi-page walk until target appears (not scroll-driven)
	historyLoading.value = true;
	moreFetching.value = true;
	try {
		const oldestId = messages.value[messages.value.length - 1]?.id ?? null;
		const { pages, found, exhausted } = await loadUntilMessageFound<NormalizedChatMessage>({
			targetId: id,
			oldestId,
			pageSize: PAGE_LIMIT,
			maxPages: 40,
			fetchPage: makeTimelineFetcher(),
			mapConcurrency: NORMALIZE_POOL,
		});
		for (const page of pages) {
			mergeOlderPage(page);
		}
		if (exhausted) canFetchMore.value = false;
		else if (pages.length) canFetchMore.value = true;
		await nextTick();
		return found || messages.value.some(m => m.id === id) || !!window.document.getElementById(`chat-msg-${id}`);
	} finally {
		moreFetching.value = false;
		historyLoading.value = false;
	}
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
		pinnedViewMessageId.value = target.id;
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
		pinnedViewMessageId.value = target.id;
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

// For XMessage mod-delete menu (owner/admin/site staff)
provide(chatRoomCanModerateKey, canModerate);

const canEditAnnouncement = canModerate;

function openAnnouncementEdit() {
	tab.value = canModerate.value ? 'manage' : 'info';
}

async function refreshRoom() {
	if (!props.roomId) return;
	try {
		// Prefer WS roomShow when chat channel is open
		if (chatWs.ready()) {
			const res = await chatWs.request<{ room?: any }>(
				'roomShow',
				{},
				'room',
				'roomError',
				'chat/rooms/show',
				{ roomId: props.roomId },
			);
			const r = (res as any)?.room ?? res;
			if (r?.id) {
				room.value = r as Misskey.entities.ChatRoom;
				return;
			}
		}
		const r = await misskeyApi('chat/rooms/show', { roomId: props.roomId }) as any;
		room.value = r as Misskey.entities.ChatRoom;
	} catch { /* ignore */ }
}

function onRoomCleared() {
	messages.value = [];
	canFetchMore.value = false;
}

/**
 * Send via WebSocket and wait until:
 * 1) server acks (msgAck), and
 * 2) our own message appears in the local timeline (or short timeout).
 * Spinner stays aligned with when the bubble actually shows.
 */
function wsSendMessage(payload: {
	text?: string;
	fileId?: string;
	replyId?: string;
	isE2ee?: boolean;
	ciphertext?: string;
}): Promise<boolean> | false {
	if (!connection.value) return false;
	if (!props.roomId && !props.userId) return false;
	const conn = connection.value as any;
	const meId = $i?.id;
	const expectText = payload.text ?? null;
	const expectFile = payload.fileId ?? null;
	const countBefore = messages.value.length;
	const newestBefore = messages.value[0]?.id ?? null;

	try {
		return new Promise<boolean>((resolve) => {
			let settled = false;
			let acked = false;

			const cleanup = () => {
				clearTimeout(hardTimer);
				clearInterval(pollTimer);
				try {
					conn.off?.('msgAck', onAck);
					conn.off?.('msgError', onErr);
				} catch { /* ignore */ }
			};

			const finish = (ok: boolean) => {
				if (settled) return;
				settled = true;
				cleanup();
				resolve(ok);
			};

			const ownMessageVisible = () => {
				if (!$i) return messages.value.length > countBefore;
				const head = messages.value.slice(0, 8);
				return head.some(m => {
					if (m.fromUserId !== meId) return false;
					if (newestBefore && m.id <= newestBefore) return false;
					if (expectFile && m.fileId === expectFile) return true;
					if (expectText != null && m.text === expectText) return true;
					// E2EE / empty text with only timing match
					if (expectText == null && !expectFile) return true;
					return expectText == null && !!m.fileId;
				});
			};

			const onAck = () => {
				acked = true;
				// Don't finish yet — wait for bubble (or poll timeout below)
				if (ownMessageVisible()) finish(true);
			};
			const onErr = (err: any) => {
				try { onMsgError(err); } catch { /* ignore */ }
				finish(false);
			};

			// Poll for own message after ack (stream may lag slightly behind msgAck)
			const pollTimer = window.setInterval(() => {
				if (ownMessageVisible()) finish(true);
			}, 40);

			// Hard cap so spinner never sticks forever
			const hardTimer = window.setTimeout(() => finish(acked || ownMessageVisible()), 6000);

			try {
				conn.on?.('msgAck', onAck);
				conn.on?.('msgError', onErr);
			} catch { /* ignore */ }
			try {
				conn.send('msg', {
					text: payload.text ?? null,
					fileId: payload.fileId ?? null,
					replyId: payload.replyId ?? null,
					isE2ee: payload.isE2ee === true,
					ciphertext: payload.ciphertext ?? null,
				});
			} catch {
				finish(false);
			}
		});
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
	// Pin first so concurrent WS messages don't stick-to-live during scrollIntoView
	markPinnedView(id);
	el.scrollIntoView({ behavior: 'smooth', block: 'center' });
	// Re-pin after smooth scroll settles (layout may shift)
	window.setTimeout(() => {
		const again = window.document.getElementById(`chat-msg-${id}`);
		if (again && pinnedViewMessageId.value === id) {
			const rect = again.getBoundingClientRect();
			const mid = window.innerHeight / 2;
			// If still far from center (interrupted by new messages), nudge once
			if (rect.top < mid - 120 || rect.bottom > mid + 120) {
				again.scrollIntoView({ behavior: 'instant', block: 'center' });
			}
		}
	}, 450);
}

/** From search tab: switch to chat and scroll to the message (load history if needed) */
async function onSearchJump(messageId: string) {
	tab.value = 'chat';
	// Pin immediately so any WS event during load won't yank to live edge
	pinnedViewMessageId.value = messageId;
	await nextTick();
	// Wait a frame for chat DOM to mount
	await new Promise<void>(r => requestAnimationFrame(() => r()));
	const ok = await ensureMessageLoaded(messageId);
	await nextTick();
	if (ok) {
		scrollToMessage(messageId);
	} else {
		pinnedViewMessageId.value = null;
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
/** Avoid stacking catch-up requests on flaky reconnects */
let catchUpInFlight = false;
let lastCatchUpAt = 0;

function resubscribeChatChannel() {
	if (!canViewTimeline.value) return;
	if (props.roomId && (room.value || props.roomId)) {
		void enterRoomChannel();
	} else if (props.userId && user.value) {
		connection.value?.dispose();
		connection.value = stream.useChannel('chatUser', { otherId: user.value.id });
		bindChatChannelEvents();
	}
}

/**
 * After WS reconnect / tab wake: re-subscribe channel and pull messages
 * newer than the newest we already have (sinceId).
 */
async function catchUpChatMessages() {
	if (!canViewTimeline.value || !isActivated) return;
	if (catchUpInFlight) return;
	if (Date.now() - lastCatchUpAt < 800) return;
	catchUpInFlight = true;
	lastCatchUpAt = Date.now();
	try {
		// Re-open channel only if missing; Stream.onOpen already re-connects live ones
		if (!connection.value || !chatWs.ready()) {
			resubscribeChatChannel();
			await nextTick();
			// Wait a beat for connect frame after force reconnect
			await new Promise<void>(r => window.setTimeout(() => r(), 120));
		}

		const newestId = messages.value[0]?.id ?? null;
		// Pull a page of newer messages (or latest page if empty)
		const page = await fetchTimelinePage({
			limit: PAGE_LIMIT,
			untilId: null,
			sinceId: newestId,
		});
		if (page.length) {
			// page is newest-first from API; merge without dupes
			const fresh = page.filter(m => !knownMessageIds.has(m.id));
			if (fresh.length) {
				for (const m of fresh) knownMessageIds.add(m.id);
				// Keep newest-first order
				const byId = new Map<string, NormalizedChatMessage>();
				for (const m of [...fresh, ...messages.value]) {
					if (!byId.has(m.id)) byId.set(m.id, m);
				}
				messages.value = Array.from(byId.values()).sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

				const sc = getChatScrollContainer();
				const nearLive = isNearLiveEdge(sc);
				if (nearLive || !newestId) {
					await nextTick();
					scrollToLiveEdge('instant');
				} else if (fresh.some(m => m.fromUserId !== $i?.id)) {
					notifyNewMessage();
				}
			}
		}
		// Resume background older-history prefetch if needed
		if (canFetchMore.value && !historyPrefetching.value) {
			startHistoryPrefetch();
		}
	} catch {
		// REST/WS may fail briefly; next wake will retry
	} finally {
		catchUpInFlight = false;
	}
}

function onStreamState() {
	streamState.value = stream.state;
	// Re-subscribe + refresh messages when socket is back
	if (stream.state === 'connected' && canViewTimeline.value && isActivated) {
		void catchUpChatMessages();
	}
}
function onMsgError(err: { message?: string; code?: string; remainingSeconds?: number }) {
	const code = err?.code ?? '';
	const map: Record<string, string> = {
		ROOM_MUTED_ALL: tChat('mutedAllComposerDisabled'),
		ROOM_MEMBER_MUTED: tChat('youAreMuted'),
		NOT_A_MEMBER: tChat('notAMember'),
		BANNED_FROM_ROOM: tChat('bannedFromRoom'),
		ROOM_RATE_LIMITED: tChat('roomRateLimited'),
		SEND_FAILED: tChat('wsSendFailed'),
		REACT_FAILED: tChat('wsSendFailed'),
		DELETE_FAILED: tChat('wsSendFailed'),
		CLEAR_FAILED: tChat('wsSendFailed'),
	};
	let text = map[code];
	if (!text) {
		// Prefer localized API error map over raw English backend message
		const formatted = formatApiError(err);
		text = formatted.text || err?.message || err?.code || tChat('wsSendFailed');
	}
	if (code === 'ROOM_RATE_LIMITED' && err?.remainingSeconds) {
		text = `${text} (${err.remainingSeconds}s)`;
	}
	os.alert({ type: 'error', text: String(text) });
}
const timelineEl = useTemplateRef('timelineEl');
/** API order: newest-first. Separators built on that order. */
const timelineNewestFirst = makeDateSeparatedTimelineComputedRef(messages);
/**
 * Display order: oldest → newest (top → bottom).
 * Normal page scroll + chronological DOM is the stable chat model
 * (no column-reverse scrollTop sign flips).
 */
const displayTimeline = computed(() => timelineNewestFirst.value.toReversed());

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

function getChatScrollContainer(): HTMLElement | null {
	return timelineEl.value ? getScrollContainer(timelineEl.value) : null;
}

/** Distance from bottom under which we treat as "at live edge" (newest) */
const LIVE_EDGE_PX = 48;
/** Near top of normal scroll → may load older history */
const HISTORY_TOP_PX = 80;
/** Ignore stick-to-live for a moment after user scrolls (stops twitch on finger-up) */
let userScrollUntil = 0;
let lastScrollTop = 0;

function distanceFromLiveEdge(container: HTMLElement): number {
	// Normal scroll: bottom = live edge
	return container.scrollHeight - container.scrollTop - container.clientHeight;
}

function isNearLiveEdge(container: HTMLElement | null): boolean {
	if (!container) return false;
	return distanceFromLiveEdge(container) <= LIVE_EDGE_PX;
}

function isNearHistoryTop(container: HTMLElement | null): boolean {
	if (!container) return false;
	return container.scrollTop <= HISTORY_TOP_PX;
}

function markUserScrolling(container: HTMLElement) {
	const top = container.scrollTop;
	// Any real movement → user is in control; suppress auto stick briefly after stop
	if (Math.abs(top - lastScrollTop) > 1) {
		userScrollUntil = Date.now() + 450;
	}
	lastScrollTop = top;
}

/** User is reading history (search jump pin, or scrolled away from newest) */
function isReadingHistory(container: HTMLElement | null = null): boolean {
	if (pinnedViewMessageId.value) return true;
	const sc = container ?? getChatScrollContainer();
	if (!sc) return false;
	return !isNearLiveEdge(sc);
}

function scrollToLiveEdge(behavior: ScrollBehavior | 'instant' = 'instant') {
	const sc = getChatScrollContainer();
	if (!sc) return;
	// 'instant' is widely supported; fall back via cast for TS lib
	sc.scrollTo({ top: sc.scrollHeight, behavior: behavior as ScrollBehavior });
}

/**
 * After prepending older messages (top of chronological list), keep viewport
 * fixed with height-delta. Works reliably with normal (non-reversed) scroll.
 */
function preserveScrollAfterPrepend(
	scrollContainer: HTMLElement,
	prevHeight: number,
	prevTop: number,
	anchorId: string | null,
	anchorTopBefore: number | null,
) {
	const delta = scrollContainer.scrollHeight - prevHeight;
	if (delta !== 0) {
		scrollContainer.scrollTop = prevTop + delta;
	}
	// Fine-tune with element anchor if available
	if (anchorId != null && anchorTopBefore != null) {
		const el = window.document.getElementById(`chat-msg-${anchorId}`);
		if (el) {
			const drift = el.getBoundingClientRect().top - anchorTopBefore;
			if (Math.abs(drift) > 0.5) {
				scrollContainer.scrollTop += drift;
			}
		}
	}
}

function markPinnedView(id: string) {
	pinnedViewMessageId.value = id;
	// Keep soft highlight a bit longer when arriving from search
	highlightId.value = id;
	if (highlightTimer) clearTimeout(highlightTimer);
	highlightTimer = setTimeout(() => {
		if (highlightId.value === id) highlightId.value = null;
	}, 4000);
	bindScrollLiveClear();
}

function clearPinnedViewIfAtLive() {
	const sc = getChatScrollContainer();
	if (sc && isNearLiveEdge(sc)) {
		pinnedViewMessageId.value = null;
		showIndicator.value = false;
	}
}

function bindScrollLiveClear() {
	if (scrollListenCleanup) return;
	const sc = getChatScrollContainer();
	if (!sc) return;
	lastScrollTop = sc.scrollTop;
	const onScroll = () => {
		markUserScrolling(sc);
		clearPinnedViewIfAtLive();
	};
	sc.addEventListener('scroll', onScroll, { passive: true });
	scrollListenCleanup = () => {
		sc.removeEventListener('scroll', onScroll);
		scrollListenCleanup = null;
	};
}

// No MutationObserver stick-to-bottom: media layout thrash yanks viewport.
// Stick only on new WS messages when already near live edge (see onMessage).
// History: background async prefetch (startHistoryPrefetch) — not scroll IO chain.

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

function bindChatChannelEvents() {
	const conn = connection.value as any;
	if (!conn) return;
	conn.on('message', onMessage);
	conn.on('deleted', onDeleted);
	conn.on('react', onReact);
	conn.on('unreact', onUnreact);
	conn.on?.('cleared', onRoomCleared);
	conn.on?.('msgError', onMsgError);
	// Moderation live events (already published by backend)
	conn.on?.('memberKicked', onMemberKicked);
	conn.on?.('memberBanned', onMemberBanned);
	conn.on?.('memberMuted', onMemberMuted);
	// E2EE: peer rotated public key — drop cache so next encrypt/decrypt refetches
	conn.on?.('e2eeKeyUpdated', (body: { userId?: string }) => {
		if (body?.userId) {
			import('./chat-e2ee.js').then(({ invalidatePeerKey }) => {
				invalidatePeerKey(body.userId!);
			}).catch(() => { /* ignore */ });
		}
	});
}

function onMemberKicked(body: { userId?: string }) {
	if (body?.userId && $i && body.userId === $i.id) {
		// Kicked self — leave chat UI
		isMember.value = false;
		needJoin.value = true;
		messages.value = [];
		knownMessageIds.clear();
		os.alert({ type: 'info', text: tChat('notAMember') });
	}
}

function onMemberBanned(body: { userId?: string }) {
	if (body?.userId && $i && body.userId === $i.id) {
		isMember.value = false;
		needJoin.value = true;
		messages.value = [];
		knownMessageIds.clear();
		os.alert({ type: 'error', text: tChat('bannedFromRoom') });
	}
}

function onMemberMuted(_body: { userId?: string; mutedUntil?: string | null }) {
	// Soft signal; send path already enforces mute. Could show banner later.
}

async function enterRoomChannel() {
	// Open WS as soon as we have roomId (prefer stream for page content)
	const roomId = room.value?.id ?? props.roomId;
	if (!roomId || !canViewTimeline.value) return;
	connection.value?.dispose();
	connection.value = useStream().useChannel('chatRoom', { roomId });
	bindChatChannelEvents();
}

/** Deep-link ?msg= from abuse report / shared message URL */
async function jumpToQueryMessage() {
	const q = new URLSearchParams(window.location.search);
	const msgId = q.get('msg') || q.get('messageId') || '';
	if (!msgId) return;
	// Wait for timeline DOM
	await nextTick();
	await new Promise<void>(r => requestAnimationFrame(() => r()));
	pinnedViewMessageId.value = msgId;
	const ok = await ensureMessageLoaded(msgId);
	if (ok) {
		scrollToMessage(msgId);
	} else {
		pinnedViewMessageId.value = null;
	}
	// Drop msg from URL so refresh doesn't re-jump awkwardly; keep room path
	try {
		const url = new URL(window.location.href);
		url.searchParams.delete('msg');
		url.searchParams.delete('messageId');
		window.history.replaceState(window.history.state, '', url.pathname + (url.search || '') + url.hash);
	} catch { /* ignore */ }
}

async function loadRoomTimeline() {
	const LIMIT = PAGE_LIMIT;
	// WS channel first so history can load over stream
	await enterRoomChannel();
	await nextTick();

	let list: NormalizedChatMessage[] = [];
	try {
		if (chatWs.ready()) {
			const res = await chatWs.request<{ messages?: any[]; hasMore?: boolean }>(
				'history',
				{ limit: LIMIT },
				'history',
				'historyError',
				'chat/messages/room-timeline',
				{ roomId: props.roomId, limit: LIMIT },
			);
			const raw = (res as any)?.messages ?? (Array.isArray(res) ? res : []);
			list = raw.map((x: any) => normalizeMessage(x));
			canFetchMore.value = (res as any)?.hasMore ?? list.length === LIMIT;
		} else {
			const m = await misskeyApi('chat/messages/room-timeline', { roomId: props.roomId, limit: LIMIT });
			list = (m as Misskey.entities.ChatMessagesRoomTimelineResponse).map(x => normalizeMessage(x));
			canFetchMore.value = list.length === LIMIT;
		}
	} catch {
		const m = await misskeyApi('chat/messages/room-timeline', { roomId: props.roomId, limit: LIMIT });
		list = (m as Misskey.entities.ChatMessagesRoomTimelineResponse).map(x => normalizeMessage(x));
		canFetchMore.value = list.length === LIMIT;
	}

	messages.value = list;
	rebuildKnownIds();
	// non-blocking: mentions + async history pipeline
	void loadMentionsForRoom();
	if (canFetchMore.value) {
		void nextTick().then(() => startHistoryPrefetch());
	}
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
	stopHistoryPrefetch();
	messages.value = [];
	knownMessageIds.clear();
	canFetchMore.value = false;
	historyLoading.value = false;
	pinnedViewMessageId.value = null;
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
			const u = await misskeyApi('users/show', { userId: props.userId });
			user.value = u;
			isMember.value = true;

			// Open WS first — history prefers stream
			connection.value?.dispose();
			connection.value = useStream().useChannel('chatUser', {
				otherId: user.value.id,
			});
			bindChatChannelEvents();
			await nextTick();

			let list: NormalizedChatMessage[] = [];
			try {
				list = await fetchTimelinePage({ limit: LIMIT, untilId: null });
			} catch {
				const m = await misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit: LIMIT });
				list = m.map(x => normalizeMessage(x));
			}
			messages.value = list;
			rebuildKnownIds();
			canFetchMore.value = list.length === LIMIT;

			if (canFetchMore.value) {
				void nextTick().then(() => startHistoryPrefetch());
			}
		} else if (props.roomId) {
			const r = await misskeyApi('chat/rooms/show', { roomId: props.roomId }) as any;
			room.value = r as Misskey.entities.ChatRoom;
			roomPreviewName.value = r.name ?? '';
			joinPolicy.value = r.joinPolicy ?? 'invite';
			const member = r.isMember === true || r.myRole != null || r.ownerId === $i.id;
			isMember.value = member;

			if (!member && !isStaffViewer.value) {
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

			// Staff non-member: still load timeline (backend allows moderators)
			await loadRoomTimeline();
		}
	} catch (e: any) {
		const code = e?.code || e?.error?.code || '';
		const msg = e?.message || e?.error?.message || String(e);
		if (code === 'NO_SUCH_ROOM' || /no such room/i.test(msg)) {
			// might be non-member timeline denial
			if (room.value && !isMember.value && !isStaffViewer.value) {
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

	// First paint at live edge (bottom), then optional deep-link jump
	if (!loadError.value && !needJoin.value && canViewTimeline.value) {
		await nextTick();
		await new Promise<void>(r => requestAnimationFrame(() => r()));
		// Only stick if no ?msg= deep link (jumpToQueryMessage handles that)
		const q = new URLSearchParams(window.location.search);
		const hasMsgJump = !!(q.get('msg') || q.get('messageId'));
		if (!hasMsgJump) {
			scrollToLiveEdge('instant');
			// Late media/layout may grow content; re-stick once more if still near bottom
			requestAnimationFrame(() => {
				const sc = getChatScrollContainer();
				if (sc && isNearLiveEdge(sc) && !pinnedViewMessageId.value) {
					scrollToLiveEdge('instant');
				}
			});
		}
		void jumpToQueryMessage();
		// Bind scroll listener so pin auto-clears when user returns to live
		bindScrollLiveClear();
	}
}

let isActivated = true;

/** Manual load-more / resume background async pipeline (not scroll-chained). */
async function fetchMore() {
	if (moreFetching.value || !canFetchMore.value) return;
	if (messages.value.length === 0) return;

	// Prefer resuming background prefetcher
	if (historyPrefetcher && !historyPrefetcher.isRunning && !historyPrefetcher.isExhausted) {
		const oldestId = messages.value[messages.value.length - 1]?.id ?? null;
		historyPrefetching.value = true;
		historyPrefetcher.resume(oldestId);
		return;
	}
	if (historyPrefetching.value || historyPrefetcher?.isRunning) return;

	// One-shot async page if prefetcher idle/missing
	const LIMIT = PAGE_LIMIT;
	moreFetching.value = true;
	historyLoading.value = true;

	const scrollContainer = getChatScrollContainer();
	const anchorId = messages.value[messages.value.length - 1].id;
	const anchorElBefore = window.document.getElementById(`chat-msg-${anchorId}`);
	const anchorTopBefore = anchorElBefore?.getBoundingClientRect().top ?? null;
	const prevHeight = scrollContainer?.scrollHeight ?? 0;
	const prevTop = scrollContainer?.scrollTop ?? 0;

	try {
		const page = await makeTimelineFetcher()({ limit: LIMIT, untilId: anchorId });
		if (page.length === 0) {
			canFetchMore.value = false;
			return;
		}
		mergeOlderPage(page);
		canFetchMore.value = page.length === LIMIT;

		await nextTick();
		await new Promise<void>(r => requestAnimationFrame(() => r()));
		if (scrollContainer) {
			preserveScrollAfterPrepend(scrollContainer, prevHeight, prevTop, anchorId, anchorTopBefore);
		}
		// Kick background pipeline for remaining pages
		if (canFetchMore.value) startHistoryPrefetch();
	} catch {
		// keep canFetchMore
	} finally {
		moreFetching.value = false;
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

	const scrollContainer = getChatScrollContainer();
	const readingHistory = isReadingHistory(scrollContainer);
	const nearLive = !readingHistory && isNearLiveEdge(scrollContainer);

	// While reading history: new msgs append at bottom of DOM and do not
	// change scrollTop — viewport stays put (normal scroll model). No restore needed.
	const pinId = pinnedViewMessageId.value;

	const normalized = normalizeMessage(message);
	if (knownMessageIds.has(normalized.id)) return;
	knownMessageIds.add(normalized.id);
	messages.value.unshift(normalized);

	// Cap only at live edge — never trim while pinned/reading history
	// (would drop the jumped-to message and "squeeze" the user away)
	if (nearLive && !pinnedViewMessageId.value && messages.value.length > MAX_MESSAGES) {
		const overflow = messages.value.length - MAX_MESSAGES;
		const dropped = messages.value.splice(messages.value.length - overflow, overflow);
		for (const d of dropped) knownMessageIds.delete(d.id);
		canFetchMore.value = true;
	} else if (pinnedViewMessageId.value && messages.value.length > MAX_MESSAGES * 2) {
		const pin = pinnedViewMessageId.value;
		const pinIdx = messages.value.findIndex(m => m.id === pin);
		if (pinIdx >= 0) {
			const overflow = messages.value.length - MAX_MESSAGES;
			if (overflow > 0 && pinIdx < messages.value.length - overflow) {
				const dropped = messages.value.splice(messages.value.length - overflow, overflow);
				for (const d of dropped) knownMessageIds.delete(d.id);
				canFetchMore.value = true;
			}
		}
	}

	if (readingHistory) {
		// Stay put. Show indicator for others' messages.
		if (message.fromUserId !== $i.id) {
			notifyNewMessage();
		}
		// If pin somehow left the loaded set, reload it
		if (pinId && !messages.value.some(m => m.id === pinId)) {
			void ensureMessageLoaded(pinId).then(ok => {
				if (ok) scrollToMessage(pinId);
			});
		}
	} else if (nearLive && scrollContainer && !historyLoading.value) {
		// Stick to bottom only if user is not mid/just-finished scrolling (avoids twitch)
		if (Date.now() < userScrollUntil) {
			// still reading / finger just lifted near edge — don't yank
		} else {
			void nextTick().then(() => {
				requestAnimationFrame(() => {
					if (
						!historyLoading.value &&
						Date.now() >= userScrollUntil &&
						!isReadingHistory(scrollContainer)
					) {
						scrollToLiveEdge('instant');
					}
				});
			});
		}
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
}

function onDeleted(id: string) {
	const index = messages.value.findIndex(m => m.id === id);
	if (index !== -1) {
		messages.value.splice(index, 1);
		knownMessageIds.delete(id);
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
	// Jump to live edge and release history pin
	pinnedViewMessageId.value = null;
	scrollToLiveEdge('smooth');
}

function notifyNewMessage() {
	showIndicator.value = true;
}

function onVisibilitychange() {
	// Keep the chat channel while backgrounded so RWS can still reconnect;
	// only pause heavy background history prefetch to save battery/data.
	if (window.document.hidden) {
		stopHistoryPrefetch();
		return;
	}
	// Foreground: force stream wake + resubscribe + catch up missed messages
	if (!isActivated) return;
	wakeStream({ force: true });
	void catchUpChatMessages();
	// Second catch-up after socket settles (mobile half-open sockets)
	window.setTimeout(() => {
		if (window.document.visibilityState === 'visible' && isActivated) {
			void catchUpChatMessages();
		}
	}, 600);
}

function releaseChatResources(opts?: { clearMessages?: boolean }) {
	stopHistoryPrefetch();
	scrollListenCleanup?.();
	scrollListenCleanup = null;
	if (highlightTimer) {
		clearTimeout(highlightTimer);
		highlightTimer = null;
	}
	connection.value?.dispose();
	connection.value = null;
	// Drop message list to free Vue VNodes + media decoders when leaving page
	if (opts?.clearMessages !== false) {
		messages.value = [];
		knownMessageIds.clear();
		mentions.value = [];
		replyTo.value = null;
		pinnedViewMessageId.value = null;
		highlightId.value = null;
		showIndicator.value = false;
	}
}

onMounted(() => {
	stream.on('_connected_', onStreamState);
	stream.on('_disconnected_', onStreamState);
	initialize();
});

onBeforeUnmount(() => {
	stream.off('_connected_', onStreamState);
	stream.off('_disconnected_', onStreamState);
	window.document.removeEventListener('visibilitychange', onVisibilitychange);
	releaseChatResources({ clearMessages: true });
});

// Keep-alive: soft-trim DOM when room is backgrounded in stacking router
onDeactivated(() => {
	isActivated = false;
	// Keep channel for faster resume; stop heavy history prefetch only
	stopHistoryPrefetch();
	// Soft-trim: drop oldest beyond a small window to free DOM/media
	if (messages.value.length > BACKGROUND_MESSAGE_CAP) {
		const pin = pinnedViewMessageId.value;
		const pinIdx = pin ? messages.value.findIndex(m => m.id === pin) : -1;
		if (pinIdx < 0) {
			messages.value = messages.value.slice(0, BACKGROUND_MESSAGE_CAP);
			canFetchMore.value = true;
		} else if (pinIdx >= BACKGROUND_MESSAGE_CAP) {
			const from = Math.max(0, pinIdx - 20);
			messages.value = messages.value.slice(from, from + BACKGROUND_MESSAGE_CAP);
			canFetchMore.value = true;
		} else {
			messages.value = messages.value.slice(0, BACKGROUND_MESSAGE_CAP);
			canFetchMore.value = true;
		}
		rebuildKnownIds();
	}
});

onActivated(() => {
	isActivated = true;
	wakeStream({ force: true });
	void catchUpChatMessages();
	window.setTimeout(() => {
		if (isActivated) void catchUpChatMessages();
	}, 500);
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

	if (room.value && canViewTimeline.value) {
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
	/*
	 * Do NOT use justify-content:flex-end here.
	 * It reflows when history loads / media settles and causes stop-scroll twitch
	 * and upward jump. Stick-to-live is handled by scrollTop only.
	 */
	display: flex;
	flex-direction: column;
	padding-bottom: 4px;
	/* Spacer so short chats still open near the bottom without flex-end thrash */
	min-height: 0;
}

.msgList {
	/* We manage history loads; browser anchoring fights media + prepend */
	overflow-anchor: none;
	width: 100%;
}

.msgRow {
	overflow-anchor: none;
}

.msgRowLive {
	/* Keep off — media load + anchor causes twitch when finger stops */
	overflow-anchor: none;
}

.loadMoreSentinel {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 36px;
	padding: 6px 0 10px;
	overflow-anchor: none;
	gap: 8px;
}

.loadingOlder {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	opacity: 0.75;
	transform: scale(0.9);
}

.prefetchLabel {
	font-size: 0.8em;
	opacity: 0.7;
	font-variant-numeric: tabular-nums;
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

/*
 * Compact sticky header ("chin" under room name).
 * Never target [class*='tab'] here — CSS-module names like tabHighlight
 * also contain "tab", and min-height on the underline becomes a green slab
 * that covers the selected icon.
 */
.chatPage {
	:global([class*='lower']) {
		/* Room for icon + 3px underline */
		--height: 36px !important;
	}
	:global([class*='upper']) {
		--height: 40px !important;
	}
	:global([class*='titleContainer']) {
		margin-left: 6px !important;
	}
	:global([class*='titleAvatarContainer']) {
		padding: 2px !important;
	}
	/* Underline bar only (class name is selectionBar, not *tab*) */
	:global([class*='selectionBar']) {
		height: 3px !important;
		min-height: 0 !important;
		max-height: 3px !important;
	}
}

@media (max-width: 500px) {
	.chatPage {
		:global([class*='lower']) {
			--height: 34px !important;
		}
		:global([class*='upper']) {
			--height: 38px !important;
		}
	}
	.chatSpacer {
		padding-top: 0 !important;
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
