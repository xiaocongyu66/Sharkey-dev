/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Chat WebSocket channel lifecycle (open / dispose / stream ready).
 * Event handlers stay in room.vue and are passed via bindEvents callback.
 */

import { nextTick, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { useStream, waitForStreamConnected } from '@/stream.js';
import { createChatWsFromConnection } from './chat-ws.js';
import type { ChatChannelConnection } from './chat-types.js';

export function useChatChannel() {
	const connection = ref<ChatChannelConnection | null>(null);
	const chatWs = createChatWsFromConnection(() => connection.value);
	const stream = useStream();
	const streamState = ref(stream.state);

	/** Ensure shared stream socket is up before channel history (avoids 15s REST spin). */
	async function ensureStreamReady(timeoutMs = 5000): Promise<boolean> {
		try {
			return await waitForStreamConnected(stream, timeoutMs);
		} catch {
			return stream.state === 'connected';
		}
	}

	/**
	 * Open chatRoom channel. Server allows connect when room exists;
	 * history/roomShow enforce access.
	 */
	async function openRoomChannel(roomId: string, bindEvents: () => void) {
		if (!roomId) return;
		connection.value?.dispose();
		// Prefer connected socket so the first connect+history frames aren't dropped
		await ensureStreamReady(4500);
		connection.value = stream.useChannel('chatRoom', { roomId });
		bindEvents();
		// Give server a tick to finish channel init before first request
		await nextTick();
		await new Promise<void>(r => window.setTimeout(() => r(), 40));
	}

	async function openUserChannel(otherId: string, bindEvents: () => void) {
		if (!otherId) return;
		connection.value?.dispose();
		await ensureStreamReady(4500);
		connection.value = stream.useChannel('chatUser', { otherId });
		bindEvents();
		await nextTick();
		await new Promise<void>(r => window.setTimeout(() => r(), 40));
	}

	function disposeConnection() {
		connection.value?.dispose();
		connection.value = null;
	}

	function syncStreamState() {
		streamState.value = stream.state;
	}

	return {
		connection,
		chatWs,
		stream,
		streamState,
		ensureStreamReady,
		openRoomChannel,
		openUserChannel,
		disposeConnection,
		syncStreamState,
	};
}
