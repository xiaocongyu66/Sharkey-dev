/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Chat timeline page fetch (WS history first, REST fallback).
 * Single path used by initial load, history prefetch, catch-up, and load-more.
 */

import type * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import type { ChatWsApi } from './chat-ws.js';
import type { NormalizedChatMessage } from './chat-types.js';

export type TimelineFetchArgs = {
	limit: number;
	untilId?: string | null;
	sinceId?: string | null;
};

export type TimelineTarget =
	| { kind: 'user'; userId: string }
	| { kind: 'room'; roomId: string };

/**
 * Normalize WS/REST history payload into a message array.
 * WS: { messages, hasMore?, reqId } | raw array (REST fallback through request())
 */
export function extractTimelineMessages(res: unknown): {
	messages: any[];
	hasMore: boolean | null;
} {
	if (Array.isArray(res)) {
		return { messages: res, hasMore: null };
	}
	if (res && typeof res === 'object') {
		const o = res as { messages?: any[]; hasMore?: boolean };
		const messages = Array.isArray(o.messages) ? o.messages : [];
		const hasMore = typeof o.hasMore === 'boolean' ? o.hasMore : null;
		return { messages, hasMore };
	}
	return { messages: [], hasMore: null };
}

export async function fetchChatTimelinePage(
	opts: {
		chatWs: ChatWsApi;
		target: TimelineTarget | null;
		args: TimelineFetchArgs;
		normalize: (m: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage) => NormalizedChatMessage;
		/** When true, only use REST if WS path fails / not ready */
		preferWs?: boolean;
	},
): Promise<{ list: NormalizedChatMessage[]; hasMore: boolean | null }> {
	const { chatWs, target, args, normalize } = opts;
	if (!target) return { list: [], hasMore: false };

	const untilId = args.untilId ?? null;
	const sinceId = args.sinceId ?? null;
	const limit = args.limit;

	const api = target.kind === 'user' ? 'chat/messages/user-timeline' : 'chat/messages/room-timeline';
	const apiBody =
		target.kind === 'user'
			? {
				userId: target.userId,
				limit,
				...(untilId ? { untilId } : {}),
				...(sinceId ? { sinceId } : {}),
			}
			: {
				roomId: target.roomId,
				limit,
				...(untilId ? { untilId } : {}),
				...(sinceId ? { sinceId } : {}),
			};

	if (chatWs.ready()) {
		try {
			const res = await chatWs.request<{ messages?: any[]; hasMore?: boolean }>(
				'history',
				{ limit, untilId, sinceId },
				'history',
				'historyError',
				api,
				apiBody,
			);
			const { messages, hasMore } = extractTimelineMessages(res);
			return {
				list: messages.map(x => normalize(x)),
				hasMore: hasMore ?? (messages.length >= limit),
			};
		} catch {
			// fall through to REST
		}
	}

	const raw = await misskeyApi(api as any, apiBody as any);
	const list = (raw as any[]).map(x => normalize(x));
	return { list, hasMore: list.length >= limit };
}
