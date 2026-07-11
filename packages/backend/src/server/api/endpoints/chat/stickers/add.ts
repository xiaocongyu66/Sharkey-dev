/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository } from '@/models/_.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatStickerService } from '@/core/ChatStickerService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	errors: {
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'd5e6f7a8-b9c0-1234-d5e6-f7a8b9c01234',
		},
		noPermission: {
			message: 'No permission.',
			code: 'NO_PERMISSION',
			id: 'e6f7a8b9-c0d1-2345-e6f7-a8b9c0d12345',
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
		packId: { type: 'string', format: 'misskey:id' },
		fileId: { type: 'string', format: 'misskey:id' },
		emoji: { type: 'string', maxLength: 64 },
	},
	required: ['packId', 'fileId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private chatService: ChatService,
		private chatStickerService: ChatStickerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const file = await this.driveFilesRepository.findOneBy({
				id: ps.fileId,
				userId: me.id,
			});
			if (file == null) throw new ApiError(meta.errors.noSuchFile);

			try {
				const sticker = await this.chatStickerService.addStickerToPack(me, ps.packId, file, ps.emoji ?? '');
				return {
					id: sticker.id,
					packId: sticker.packId,
					fileId: sticker.fileId,
					emoji: sticker.emoji,
				};
			} catch {
				throw new ApiError(meta.errors.noPermission);
			}
		});
	}
}
