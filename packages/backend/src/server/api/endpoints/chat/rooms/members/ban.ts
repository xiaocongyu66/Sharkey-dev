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

	kind: 'write:chat',

	res: {
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

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'f8a9b0c1-d2e3-4567-f8a9-b0c1d2e34567',
		},
		noPermission: {
			message: 'No permission.',
			code: 'NO_PERMISSION',
			id: 'a9b0c1d2-e3f4-5678-a9b0-c1d2e3f45678',
		},
		cannotBanOwner: {
			message: 'Cannot ban the room owner.',
			code: 'CANNOT_BAN_OWNER',
			id: 'b0c1d2e3-f4a5-6789-b0c1-d2e3f4a56789',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		reason: { type: 'string', nullable: true, maxLength: 512 },
	},
	required: ['roomId', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				const ban = await this.chatService.banRoomMember(me, ps.roomId, ps.userId, ps.reason ?? null);
				return {
					id: ban.id,
					createdAt: this.idService.parse(ban.id).date.toISOString(),
					roomId: ban.roomId,
					userId: ban.userId,
					user: await this.userEntityService.pack(ban.userId, me),
					bannedById: ban.bannedById,
					reason: ban.reason,
				};
			} catch (e) {
				const msg = e instanceof Error ? e.message : '';
				if (msg === 'no permission') throw new ApiError(meta.errors.noPermission);
				if (msg === 'cannot ban owner') throw new ApiError(meta.errors.cannotBanOwner);
				throw new ApiError(meta.errors.noSuchRoom);
			}
		});
	}
}
