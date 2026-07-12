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
	/**
	 * Request/response over the open chat channel (history, room, members).
	 * Falls back to REST when WS is unavailable.
	 */
	request: <T = unknown>(
		wsType: string,
		wsBody: Record<string, unknown>,
		okEvent: string,
		errEvent: string,
		apiEndpoint?: string,
		apiBody?: Record<string, unknown>,
		timeoutMs?: number,
	) => Promise<T>;
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

let reqSeq = 0;
function nextReqId(): string {
	reqSeq = (reqSeq + 1) % 1_000_000;
	return `r${Date.now().toString(36)}_${reqSeq}`;
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
		request: async <T,>(
			wsType: string,
			wsBody: Record<string, unknown>,
			okEvent: string,
			errEvent: string,
			apiEndpoint?: string,
			apiBody?: Record<string, unknown>,
			timeoutMs = 15000,
		): Promise<T> => {
			const conn = getConnection();
			if (!conn) {
				if (apiEndpoint) {
					return await misskeyApi(apiEndpoint as any, (apiBody ?? {}) as any) as T;
				}
				throw new Error('WS not ready');
			}

			const reqId = nextReqId();
			return await new Promise<T>((resolve, reject) => {
				const timer = window.setTimeout(() => {
					cleanup();
					if (apiEndpoint) {
						misskeyApi(apiEndpoint as any, (apiBody ?? {}) as any)
							.then(r => resolve(r as T))
							.catch(reject);
					} else {
						reject(new Error('WS request timeout'));
					}
				}, timeoutMs);

				const onOk = (body: any) => {
					if (body?.reqId != null && body.reqId !== reqId) return;
					cleanup();
					resolve(body as T);
				};
				const onErr = (body: any) => {
					if (body?.reqId != null && body.reqId !== reqId) return;
					cleanup();
					if (apiEndpoint) {
						misskeyApi(apiEndpoint as any, (apiBody ?? {}) as any)
							.then(r => resolve(r as T))
							.catch(reject);
					} else {
						reject(new Error(body?.message || body?.code || 'WS request failed'));
					}
				};
				const cleanup = () => {
					window.clearTimeout(timer);
					try {
						conn.off?.(okEvent as any, onOk);
						conn.off?.(errEvent as any, onErr);
					} catch { /* ignore */ }
				};

				try {
					conn.on?.(okEvent as any, onOk);
					conn.on?.(errEvent as any, onErr);
					conn.send(wsType as any, { ...wsBody, reqId } as any);
				} catch (e) {
					cleanup();
					if (apiEndpoint) {
						misskeyApi(apiEndpoint as any, (apiBody ?? {}) as any)
							.then(r => resolve(r as T))
							.catch(reject);
					} else {
						reject(e);
					}
				}
			});
		},
	};
}

/**
 * Request/response over an arbitrary stream channel connection (e.g. main).
 */
export async function streamRequest<T = unknown>(
	conn: Misskey.IChannelConnection<any> | null | undefined,
	wsType: string,
	wsBody: Record<string, unknown>,
	okEvent: string,
	errEvent: string,
	apiEndpoint?: string,
	apiBody?: Record<string, unknown>,
	timeoutMs = 15000,
): Promise<T> {
	if (!conn) {
		if (apiEndpoint) {
			return await misskeyApi(apiEndpoint as any, (apiBody ?? {}) as any) as T;
		}
		throw new Error('WS not ready');
	}
	const reqId = nextReqId();
	return await new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(() => {
			cleanup();
			if (apiEndpoint) {
				misskeyApi(apiEndpoint as any, (apiBody ?? {}) as any)
					.then(r => resolve(r as T))
					.catch(reject);
			} else {
				reject(new Error('WS request timeout'));
			}
		}, timeoutMs);

		const onOk = (body: any) => {
			if (body?.reqId != null && body.reqId !== reqId) return;
			cleanup();
			resolve(body as T);
		};
		const onErr = (body: any) => {
			if (body?.reqId != null && body.reqId !== reqId) return;
			cleanup();
			if (apiEndpoint) {
				misskeyApi(apiEndpoint as any, (apiBody ?? {}) as any)
					.then(r => resolve(r as T))
					.catch(reject);
			} else {
				reject(new Error(body?.message || body?.code || 'WS request failed'));
			}
		};
		const cleanup = () => {
			window.clearTimeout(timer);
			try {
				conn.off?.(okEvent as any, onOk);
				conn.off?.(errEvent as any, onErr);
			} catch { /* ignore */ }
		};

		try {
			conn.on?.(okEvent as any, onOk);
			conn.on?.(errEvent as any, onErr);
			conn.send(wsType as any, { ...wsBody, reqId } as any);
		} catch (e) {
			cleanup();
			if (apiEndpoint) {
				misskeyApi(apiEndpoint as any, (apiBody ?? {}) as any)
					.then(r => resolve(r as T))
					.catch(reject);
			} else {
				reject(e);
			}
		}
	});
}
