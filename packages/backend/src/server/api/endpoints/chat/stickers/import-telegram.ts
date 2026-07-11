/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatStickerService } from '@/core/ChatStickerService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1hour'),
		max: 5,
	},

	errors: {
		importFailed: {
			message: 'Failed to import Telegram sticker pack.',
			code: 'TELEGRAM_IMPORT_FAILED',
			id: 'c4d5e6f7-a8b9-0123-c4d5-e6f7a8b90123',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 128 },
	},
	required: ['name'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatStickerService: ChatStickerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');
			try {
				const pack = await this.chatStickerService.importTelegramPack(me, ps.name);
				return {
					id: pack.id,
					name: pack.name,
					title: pack.title,
					telegramName: pack.telegramName,
				};
			} catch (e) {
				throw new ApiError(meta.errors.importFailed);
			}
		});
	}
}
