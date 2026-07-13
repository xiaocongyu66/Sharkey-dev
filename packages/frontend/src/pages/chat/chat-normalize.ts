/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import type { NormalizedChatMessage } from './chat-types.js';

/**
 * Fill missing fromUser / reaction.user from local identity + peer profile.
 * Prefer server-packed fromUser (1:1 lite now includes it); peer is fallback only.
 */
export function normalizeChatMessage(
	message: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage,
	me: Misskey.entities.UserLite,
	peerUser: Misskey.entities.UserLite | null | undefined,
): NormalizedChatMessage {
	const fromUser: Misskey.entities.UserLite =
		message.fromUser
		?? (message.fromUserId === me.id ? me : null)
		?? peerUser
		?? ({ id: message.fromUserId } as Misskey.entities.UserLite);

	return {
		...message,
		fromUser,
		reactions: message.reactions.map(record => {
			let user: Misskey.entities.UserLite | null | undefined = record.user;
			if (user == null) {
				// 1:1 lite historically omitted reactor user; infer from who got reacted
				user = message.fromUserId === me.id ? (peerUser ?? null) : me;
			}
			if (user == null) user = me;
			return {
				...record,
				user,
			};
		}),
	};
}
