/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApiError } from '@/server/api/error.js';
import { RoleService } from '@/core/RoleService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'read:chat',

	limit: {
		duration: 1000 * 60,
		max: 120,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatMessage',
	},

	errors: {
		noSuchMessage: {
			message: 'No such message.',
			code: 'NO_SUCH_MESSAGE',
			id: '3710865b-1848-4da9-8d61-cfed15510b93',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		messageId: { type: 'string', format: 'misskey:id' },
	},
	required: ['messageId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private roleService: RoleService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');

			const message = await this.chatService.findMessageById(ps.messageId);
			if (message == null) {
				throw new ApiError(meta.errors.noSuchMessage);
			}

			// 1:1 — party or staff; room — member or staff (for abuse-report deep links)
			const isParty = message.fromUserId === me.id || message.toUserId === me.id;
			if (!isParty) {
				if (message.toRoomId != null) {
					const room = await this.chatService.findRoomById(message.toRoomId);
					if (room == null || !await this.chatService.hasPermissionToViewRoomTimeline(me, room)) {
						throw new ApiError(meta.errors.noSuchMessage);
					}
				} else if (!await this.roleService.isModerator(me)) {
					throw new ApiError(meta.errors.noSuchMessage);
				}
			}

			return await this.chatEntityService.packMessageDetailed(message, me);
		});
	}
}
