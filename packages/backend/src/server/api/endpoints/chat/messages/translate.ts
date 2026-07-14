/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatCryptoService } from '@/core/ChatCryptoService.js';
import { RoleService } from '@/core/RoleService.js';
import { AiTranslationService } from '@/core/AiTranslationService.js';
import { ApiError } from '@/server/api/error.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { CacheManagementService, type ManagedRedisKVCache } from '@/global/CacheManagementService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'read:chat',
	// SK-2026-065: same translator gate as notes/translate
	requiredRolePolicy: 'canUseTranslator',

	limit: {
		duration: 1000 * 5,
		max: 10,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			sourceLang: { type: 'string', optional: true, nullable: false },
			text: { type: 'string', optional: true, nullable: false },
		},
	},

	errors: {
		unavailable: {
			message: 'Chat translation unavailable.',
			code: 'UNAVAILABLE',
			id: 'c1a2b3d4-e5f6-7890-abcd-ef1234567801',
		},
		noSuchMessage: {
			message: 'No such message.',
			code: 'NO_SUCH_MESSAGE',
			id: 'c1a2b3d4-e5f6-7890-abcd-ef1234567802',
		},
		translationFailed: {
			message: 'Failed to translate chat message.',
			code: 'TRANSLATION_FAILED',
			id: 'c1a2b3d4-e5f6-7890-abcd-ef1234567803',
		},
		emptyMessage: {
			message: 'Message has no text to translate.',
			code: 'EMPTY_MESSAGE',
			id: 'c1a2b3d4-e5f6-7890-abcd-ef1234567804',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		messageId: { type: 'string', format: 'misskey:id' },
		targetLang: { type: 'string' },
		selective: { type: 'boolean' },
	},
	required: ['messageId', 'targetLang'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	private readonly translationsCache: ManagedRedisKVCache<CachedTranslationEntity>;

	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private chatService: ChatService,
		private roleService: RoleService,
		private chatCryptoService: ChatCryptoService,
		private aiTranslationService: AiTranslationService,
		cacheManagementService: CacheManagementService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');

			const message = await this.chatService.findMessageById(ps.messageId);
			if (message == null) {
				throw new ApiError(meta.errors.noSuchMessage);
			}

			// Same access rules as chat/messages/show
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

			const profile = await this.userProfilesRepository.findOneBy({ userId: me.id });
			const userOverride = this.aiTranslationService.profileToOverride(profile);

			if (!this.aiTranslationService.isAvailable('chat', userOverride)) {
				throw new ApiError(meta.errors.unavailable);
			}

			// Resolve plaintext (escrow reveal for authorized pack)
			let conversationId: string;
			if (message.toRoomId) {
				conversationId = this.chatCryptoService.roomConversationId(message.toRoomId);
			} else if (message.toUserId) {
				conversationId = this.chatCryptoService.dmConversationId(message.fromUserId, message.toUserId);
			} else {
				conversationId = `orphan:${message.id}`;
			}

			const revealed = this.chatCryptoService.revealForPack({
				conversationId,
				isE2ee: message.isE2ee === true,
				text: message.text ?? null,
				ciphertext: message.ciphertext ?? null,
			});

			const plain = (revealed.text ?? message.text ?? '').trim();
			if (!plain) {
				// Legacy client-only E2EE cannot be translated server-side
				throw new ApiError(meta.errors.emptyMessage);
			}

			let targetLang = ps.targetLang;
			if (userOverride?.targetLang) targetLang = userOverride.targetLang;
			const selective = ps.selective ?? userOverride?.selective ?? this.aiTranslationService.getConfig().selectiveByDefault;

			const cacheKey = `${message.id}@${targetLang}@${selective ? 's' : 'f'}`;
			const cached = await this.translationsCache.get(cacheKey);
			if (cached?.t) {
				return { sourceLang: cached.l, text: cached.t };
			}

			const result = await this.aiTranslationService.translate({
				text: plain,
				targetLang,
				scope: 'chat',
				selective: selective === true,
				userOverride,
			});

			if (!result?.text) {
				throw new ApiError(meta.errors.translationFailed);
			}

			await this.translationsCache.set(cacheKey, {
				l: result.sourceLang,
				t: result.text,
			});

			return {
				sourceLang: result.sourceLang,
				text: result.text,
			};
		});

		this.translationsCache = cacheManagementService.createRedisKVCache<CachedTranslationEntity>('chat-translations', {
			lifetime: 1000 * 60 * 60 * 24, // 1 day
			memoryCacheLifetime: 1000 * 60,
		});
	}
}

interface CachedTranslationEntity {
	l?: string;
	t?: string;
}
