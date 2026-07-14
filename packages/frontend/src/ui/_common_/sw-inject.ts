/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { post } from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';
import { getAccountFromId } from '@/utility/get-account-from-id.js';
import { deepClone } from '@/utility/clone.js';
import { mainRouter } from '@/router.js';
import { login } from '@/accounts.js';

/** SK-2026-089: only same-origin relative paths (reject //evil, absolute URLs). */
function safeSwRedirectUrl(url: unknown): string | undefined {
	if (typeof url !== 'string' || url.length === 0) return undefined;
	if (!url.startsWith('/') || url.startsWith('//')) return undefined;
	// Disallow scheme-like paths and backslash tricks
	if (url.includes('\\') || /^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return undefined;
	return url;
}

export function swInject() {
	navigator.serviceWorker.addEventListener('message', async ev => {
		if (_DEV_) {
			console.log('sw msg', ev.data);
		}

		if (ev.data.type !== 'order') return;

		const safeUrl = safeSwRedirectUrl(ev.data.url);

		if (ev.data.loginId && ev.data.loginId !== $i?.id) {
			return getAccountFromId(ev.data.loginId).then(account => {
				if (!account) return;
				return login(account.token, safeUrl);
			});
		}

		switch (ev.data.order) {
			case 'post': {
				const props = deepClone(ev.data.options);
				// プッシュ通知から来たreply,renoteはtruncateBodyが通されているため、
				// 完全なノートを取得しなおす
				if (props.reply) {
					props.reply = await misskeyApi('notes/show', { noteId: props.reply.id });
				}
				if (props.renote) {
					props.renote = await misskeyApi('notes/show', { noteId: props.renote.id });
				}
				return post(props);
			}
			case 'push':
				if (!safeUrl) return;
				if (mainRouter.currentRoute.value.path === safeUrl) {
					return window.scroll({ top: 0, behavior: 'smooth' });
				}
				return mainRouter.push(safeUrl);
			default:
				return;
		}
	});
}
