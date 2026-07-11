/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatRoomSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		ownerId: {
			type: 'string',
			optional: false, nullable: false,
		},
		owner: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserLite',
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		description: {
			type: 'string',
			optional: false, nullable: false,
		},
		joinPolicy: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['public', 'link', 'invite', 'closed'],
		},
		inviteCode: {
			type: 'string',
			optional: true, nullable: true,
		},
		announcement: {
			type: 'string',
			optional: false, nullable: false,
		},
		isMutedAll: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		messageRateLimitSeconds: {
			type: 'number',
			optional: false, nullable: false,
		},
		myRole: {
			type: 'string',
			optional: true, nullable: true,
			enum: ['owner', 'admin', 'member'],
		},
		isMember: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		canJoin: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		isMuted: {
			type: 'boolean',
			optional: true, nullable: false,
		},
	},
} as const;
