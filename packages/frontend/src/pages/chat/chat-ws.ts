/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { InjectionKey, Ref } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';

export type ChatWsApi = {
	/** Prefer WebSocket; returns true if sent over WS */
	send: (type: string, body?: Record<string, unknown>) => boolean;
	/** True when channel connection exists */
	ready: () => boolean;
};

export const chatWsKey: InjectionKey<ChatWsApi> = Symbol('chatWs');

/** Whether the current viewer can moderate the open room (owner/admin/site staff). */
export const chatRoomCanModerateKey: InjectionKey<Ref<boolean>> = Symbol('chatRoomCanModerate');

/**
 * Prefer WebSocket channel action; fall back to REST endpoint.
 */
export async function chatWsOrApi(
	ws: ChatWsApi | null | undefined,
	wsType: string,
	wsBody: Record<string, unknown>,
	apiEndpoint: string,
	apiBody: Record<string, unknown>,
): Promise<void> {
	if (ws?.ready() && ws.send(wsType, wsBody)) {
		return;
	}
	await misskeyApi(apiEndpoint as any, apiBody as any);
}

export function createChatWsFromConnection(
	getConnection: () => Misskey.IChannelConnection<any> | null,
): ChatWsApi {
	return {
		ready: () => getConnection() != null,
		send: (type, body = {}) => {
			const conn = getConnection();
			if (!conn) return false;
			try {
				conn.send(type as any, body as any);
				return true;
			} catch {
				return false;
			}
		},
	};
}
