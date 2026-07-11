/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
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
			id: '84416476-5ce8-4a2c-b568-9569f1b10733',
		},
		cannotJoin: {
			message: 'Cannot join this room.',
			code: 'CANNOT_JOIN',
			id: 'a1c2d3e4-f5a6-7890-b1c2-d3e4f5a67890',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		inviteCode: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
	},
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				await this.chatService.joinToRoom(me.id, ps.roomId, { inviteCode: ps.inviteCode });
			} catch (e) {
				const msg = e instanceof Error ? e.message : '';
				if (msg === 'no invitation' || msg === 'invalid invite code' || msg === 'joining closed' || msg === 'room is full') {
					throw new ApiError(meta.errors.cannotJoin);
				}
				throw e;
			}
		});
	}
}
