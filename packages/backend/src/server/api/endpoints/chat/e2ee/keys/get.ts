/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { ChatE2eeKeysRepository } from '@/models/_.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],
	requireCredential: true,
	kind: 'read:chat',
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			userId: { type: 'string', optional: false, nullable: false },
			publicKey: { type: 'string', optional: false, nullable: true },
		},
	},
	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'c1a2b3d4-e5f6-7890-a1b2-c3d4e5f67891',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.chatE2eeKeysRepository)
		private chatE2eeKeysRepository: ChatE2eeKeysRepository,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');
			const row = await this.chatE2eeKeysRepository.findOneBy({ userId: ps.userId });
			return {
				userId: ps.userId,
				publicKey: row?.publicKey ?? null,
			};
		});
	}
}
