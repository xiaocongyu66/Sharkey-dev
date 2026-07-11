/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { ChatE2eeKeysRepository } from '@/models/_.js';
import { ChatService } from '@/core/ChatService.js';

export const meta = {
	tags: ['chat'],
	requireCredential: true,
	kind: 'write:chat',
	secure: true,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		publicKey: { type: 'string', minLength: 32, maxLength: 8192 },
	},
	required: ['publicKey'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.chatE2eeKeysRepository)
		private chatE2eeKeysRepository: ChatE2eeKeysRepository,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			// Validate JWK JSON shape lightly
			let parsed: any;
			try {
				parsed = JSON.parse(ps.publicKey);
			} catch {
				throw new Error('invalid public key json');
			}
			if (parsed?.kty !== 'EC' || !parsed?.x || !parsed?.y) {
				throw new Error('invalid public key jwk');
			}
			// Never accept private material
			if (parsed.d) {
				throw new Error('private key not allowed');
			}

			const existing = await this.chatE2eeKeysRepository.findOneBy({ userId: me.id });
			if (existing) {
				await this.chatE2eeKeysRepository.update(me.id, {
					publicKey: ps.publicKey,
					updatedAt: new Date(),
				});
			} else {
				await this.chatE2eeKeysRepository.insert({
					userId: me.id,
					publicKey: ps.publicKey,
					updatedAt: new Date(),
				});
			}

			return { ok: true };
		});
	}
}
