/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoomMembership',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'e1f2a3b4-c5d6-7890-e1f2-a3b4c5d67890',
		},
		noPermission: {
			message: 'No permission.',
			code: 'NO_PERMISSION',
			id: 'f2a3b4c5-d6e7-8901-f2a3-b4c5d6e78901',
		},
		notAMember: {
			message: 'User is not a member of the room.',
			code: 'NOT_A_MEMBER',
			id: 'a3b4c5d6-e7f8-9012-a3b4-c5d6e7f89012',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		/**
		 * Mute duration in whole seconds.
		 * 0 = unmute. Max 365 days.
		 */
		durationSeconds: { type: 'integer', minimum: 0, maximum: 365 * 24 * 60 * 60 },
	},
	required: ['roomId', 'userId', 'durationSeconds'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				const membership = await this.chatService.muteRoomMember(me, ps.roomId, ps.userId, ps.durationSeconds);
				return await this.chatEntityService.packRoomMembership(membership, me, { populateUser: true });
			} catch (e) {
				const msg = e instanceof Error ? e.message : '';
				if (msg === 'no permission') throw new ApiError(meta.errors.noPermission);
				if (msg === 'not a member') throw new ApiError(meta.errors.notAMember);
				throw new ApiError(meta.errors.noSuchRoom);
			}
		});
	}
}
