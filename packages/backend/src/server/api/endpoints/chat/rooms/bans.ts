/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'read:chat',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string', optional: false, nullable: false },
				createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
				roomId: { type: 'string', optional: false, nullable: false },
				userId: { type: 'string', optional: false, nullable: false },
				user: {
					type: 'object',
					optional: true, nullable: false,
					ref: 'UserLite',
				},
				bannedById: { type: 'string', optional: false, nullable: true },
				reason: { type: 'string', optional: false, nullable: true },
			},
		},
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'e3f4a5b6-c7d8-9012-e3f4-a5b6c7d89012',
		},
		noPermission: {
			message: 'No permission.',
			code: 'NO_PERMISSION',
			id: 'f4a5b6c7-d8e9-0123-f4a5-b6c7d8e90123',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
	},
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');

			const room = await this.chatService.findRoomById(ps.roomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}
			if (!(await this.chatService.canModerateRoom(room, me.id))) {
				throw new ApiError(meta.errors.noPermission);
			}

			const bans = await this.chatService.listRoomBans(room.id, ps.limit);
			return await Promise.all(bans.map(async ban => ({
				id: ban.id,
				createdAt: this.idService.parse(ban.id).date.toISOString(),
				roomId: ban.roomId,
				userId: ban.userId,
				user: await this.userEntityService.pack(ban.userId, me),
				bannedById: ban.bannedById,
				reason: ban.reason,
			})));
		});
	}
}
