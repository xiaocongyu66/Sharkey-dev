/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

/** Chat timeline message with resolved fromUser / reaction.user (never null in UI). */
export type NormalizedChatMessage = Omit<Misskey.entities.ChatMessageLite, 'fromUser' | 'reactions'> & {
	fromUser: Misskey.entities.UserLite;
	reactions: (Misskey.entities.ChatMessageLite['reactions'][number] & {
		user: Misskey.entities.UserLite;
	})[];
};

/**
 * Room payload as used by Sharkey chat UI (extends misskey-js ChatRoom with
 * moderation / announcement fields returned by rooms/show).
 */
export type ChatRoomView = Misskey.entities.ChatRoom & {
	announcement?: string | null;
	isMutedAll?: boolean;
	/** Membership role for current user when present */
	myRole?: 'owner' | 'admin' | 'member' | string | null;
	isMember?: boolean;
	joinPolicy?: 'public' | 'link' | 'invite' | 'closed';
	ownerId?: string;
};

export type ChatChannelConnection =
	| Misskey.IChannelConnection<Misskey.Channels['chatUser']>
	| Misskey.IChannelConnection<Misskey.Channels['chatRoom']>;
