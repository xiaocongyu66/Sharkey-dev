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
		ref: 'ChatRoom',
	},

	errors: {
		cannotJoin: {
			message: 'Cannot join this room.',
			code: 'CANNOT_JOIN',
			id: 'e0f1a2b3-c4d5-6789-e0f1-a2b3c4d56789',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		inviteCode: { type: 'string', minLength: 1, maxLength: 64 },
	},
	required: ['inviteCode'],
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
				const room = await this.chatService.joinByInviteCode(me.id, ps.inviteCode);
				return await this.chatEntityService.packRoom(room, me);
			} catch {
				throw new ApiError(meta.errors.cannotJoin);
			}
		});
	}
}
