/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService } from '@/core/ChatService.js';
import type { DriveFilesRepository, MiUser, MiDriveFile } from '@/models/_.js';
import type { Config } from '@/config.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	// Up to 10 message burst, then 2/second
	limit: {
		type: 'bucket',
		size: 10,
		dripRate: 500,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatMessageLiteForRoom',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '8098520d-2da5-4e8f-8ee1-df78b55a4ec6',
		},

		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'b6accbd3-1d7b-4d9f-bdb7-eb185bac06db',
		},

		contentRequired: {
			message: 'Content required. You need to set text or fileId.',
			code: 'CONTENT_REQUIRED',
			id: '340517b7-6d04-42c0-bac1-37ee804e3594',
		},

		maxLength: {
			message: 'You tried posting a message which is too long.',
			code: 'MAX_LENGTH',
			id: '3ac74a84-8fd5-4bb0-870f-01804f82ce16',
		},

		mutedAll: {
			message: 'This room is muted for all members.',
			code: 'ROOM_MUTED_ALL',
			id: 'b7c8d9e0-f1a2-3456-b7c8-d9e0f1a23456',
		},

		memberMuted: {
			message: 'You are muted in this room.',
			code: 'ROOM_MEMBER_MUTED',
			id: 'b5c6d7e8-f9a0-1234-b5c6-d7e8f9a01234',
		},

		noSuchReply: {
			message: 'No such reply target.',
			code: 'NO_SUCH_REPLY',
			id: 'c8d9e0f1-a2b3-4567-c8d9-e0f1a2b34567',
		},

		rateLimited: {
			message: 'You are sending messages too quickly in this room.',
			code: 'ROOM_RATE_LIMITED',
			id: 'd9e0f1a2-b3c4-5678-d9e0-f1a2b3c45678',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		text: { type: 'string', nullable: true, minLength: 1 },
		fileId: { type: 'string', format: 'misskey:id' },
		toRoomId: { type: 'string', format: 'misskey:id' },
		replyId: { type: 'string', format: 'misskey:id', nullable: true },
		isE2ee: { type: 'boolean', default: false },
		ciphertext: { type: 'string', nullable: true, maxLength: 100000 },
	},
	required: ['toRoomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.config)
		private config: Config,

		private getterService: GetterService,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const isE2ee = ps.isE2ee === true;

			if (!isE2ee && ps.text && ps.text.length > this.config.maxNoteLength) {
				throw new ApiError(meta.errors.maxLength);
			}

			const room = await this.chatService.findRoomById(ps.toRoomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			let file: MiDriveFile | null = null;
			if (ps.fileId != null) {
				file = await this.driveFilesRepository.findOneBy({
					id: ps.fileId,
					userId: me.id,
				});

				if (file == null) {
					throw new ApiError(meta.errors.noSuchFile);
				}
			}

			// テキストが無いかつ添付ファイルも無かったらエラー（加密时可用 ciphertext）
			if (!isE2ee && ps.text == null && file == null) {
				throw new ApiError(meta.errors.contentRequired);
			}
			if (isE2ee && (ps.ciphertext == null || ps.ciphertext === '') && file == null) {
				throw new ApiError(meta.errors.contentRequired);
			}

			try {
				return await this.chatService.createMessageToRoom(me, room, {
					text: isE2ee ? null : ps.text,
					file: file,
					replyId: ps.replyId,
					isE2ee,
					ciphertext: isE2ee ? ps.ciphertext : null,
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : '';
				const code = (e as any)?.code;
				if (msg === 'room is muted for all') throw new ApiError(meta.errors.mutedAll);
				if (code === 'ROOM_MEMBER_MUTED' || msg === 'you are muted in this room') {
					throw new ApiError(meta.errors.memberMuted);
				}
				if (msg === 'no such reply target') throw new ApiError(meta.errors.noSuchReply);
				if (code === 'ROOM_RATE_LIMITED' || msg.startsWith('rate limited')) {
					throw new ApiError(meta.errors.rateLimited);
				}
				throw e;
			}
		});
	}
}
