/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'b4c5d6e7-f8a9-0123-b4c5-d6e7f8a90123',
		},
		noPermission: {
			message: 'No permission.',
			code: 'NO_PERMISSION',
			id: 'c5d6e7f8-a9b0-1234-c5d6-e7f8a9b01234',
		},
		notAMember: {
			message: 'User is not a member of the room.',
			code: 'NOT_A_MEMBER',
			id: 'd6e7f8a9-b0c1-2345-d6e7-f8a9b0c12345',
		},
		cannotKickOwner: {
			message: 'Cannot kick the room owner.',
			code: 'CANNOT_KICK_OWNER',
			id: 'e7f8a9b0-c1d2-3456-e7f8-a9b0c1d23456',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['roomId', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				await this.chatService.kickRoomMember(me, ps.roomId, ps.userId);
			} catch (e) {
				const msg = e instanceof Error ? e.message : '';
				if (msg === 'no permission') throw new ApiError(meta.errors.noPermission);
				if (msg === 'not a member') throw new ApiError(meta.errors.notAMember);
				if (msg === 'cannot kick owner') throw new ApiError(meta.errors.cannotKickOwner);
				throw new ApiError(meta.errors.noSuchRoom);
			}
		});
	}
}
