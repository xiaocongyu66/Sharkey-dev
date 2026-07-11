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
			id: 'f1a2b3c4-d5e6-7890-f1a2-b3c4d5e67890',
		},
		noPermission: {
			message: 'No permission.',
			code: 'NO_PERMISSION',
			id: 'a2b3c4d5-e6f7-8901-a2b3-c4d5e6f78901',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		role: { type: 'string', enum: ['member', 'admin'] },
	},
	required: ['roomId', 'userId', 'role'],
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
				const membership = await this.chatService.setMemberRole(me.id, ps.roomId, ps.userId, ps.role);
				return await this.chatEntityService.packRoomMembership(membership, me, { populateUser: true });
			} catch (e) {
				const msg = e instanceof Error ? e.message : '';
				if (msg === 'no permission' || msg === 'cannot change owner role') {
					throw new ApiError(meta.errors.noPermission);
				}
				throw new ApiError(meta.errors.noSuchRoom);
			}
		});
	}
}
