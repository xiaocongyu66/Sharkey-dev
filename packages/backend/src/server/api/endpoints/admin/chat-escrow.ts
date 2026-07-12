/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Admin: chat escrow key management (chat messages only — not notes).
 * - show status / fingerprints
 * - enable/disable
 * - generate random key + activate (rotate)
 * - retire old keys (cannot decrypt those messages afterward)
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/Meta.js';
import { MetaService } from '@/core/MetaService.js';
import { ChatCryptoService, CHAT_ESCROW_FALLBACK_KEY_ID } from '@/core/ChatCryptoService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { ApiError } from '@/server/api/error.js';
import { IdService } from '@/core/IdService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',

	errors: {
		noSuchKey: {
			message: 'No such escrow key.',
			code: 'NO_SUCH_ESCROW_KEY',
			id: 'a1b2c3d4-e5f6-7890-a1b2-c3d4e5f67890',
		},
		cannotRetireActive: {
			message: 'Cannot retire the active key. Rotate to another key first.',
			code: 'CANNOT_RETIRE_ACTIVE',
			id: 'b2c3d4e5-f6a7-8901-b2c3-d4e5f6a78901',
		},
		cannotRetireFallback: {
			message: 'Config/env fallback key cannot be retired here; clear chatEscrowSecret / setupPassword in config instead.',
			code: 'CANNOT_RETIRE_FALLBACK',
			id: 'c3d4e5f6-a7b8-9012-c3d4-e5f6a7b89012',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			enabled: { type: 'boolean' },
			activeKeyId: { type: 'string', nullable: true },
			hasConfigFallback: { type: 'boolean' },
			keys: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						fingerprint: { type: 'string' },
						createdAt: { type: 'string' },
						active: { type: 'boolean' },
					},
				},
			},
			/** Only set on generate/rotate — one-time reveal of new secret for operator backup */
			generatedSecret: { type: 'string', nullable: true },
			generatedKeyId: { type: 'string', nullable: true },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		/** get | setEnabled | rotate | retire */
		action: {
			type: 'string',
			enum: ['get', 'setEnabled', 'rotate', 'retire'],
			default: 'get',
		},
		enabled: { type: 'boolean', nullable: true },
		/** For retire */
		keyId: { type: 'string', nullable: true, maxLength: 32 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private metaService: MetaService,
		private chatCryptoService: ChatCryptoService,
		private moderationLogService: ModerationLogService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const action = ps.action ?? 'get';

			if (action === 'setEnabled') {
				if (typeof ps.enabled === 'boolean') {
					const after = await this.metaService.update({ chatEscrowEnabled: ps.enabled });
					Object.assign(this.serverSettings, after);
					this.chatCryptoService.clearKeyCache();
					this.moderationLogService.log(me, 'updateServerSettings', {
						chatEscrowEnabled: ps.enabled,
					});
				}
			} else if (action === 'rotate') {
				const secret = this.chatCryptoService.generateSecret();
				const keyId = `k${this.idService.gen().slice(0, 10)}`;
				const createdAt = new Date().toISOString();
				const prev = Array.isArray(this.serverSettings.chatEscrowKeys)
					? [...this.serverSettings.chatEscrowKeys]
					: [];
				// Keep previous keys for decrypt; append new active
				prev.push({ id: keyId, secret, createdAt });
				// Cap ring size (keep last 8 meta keys)
				const trimmed = prev.slice(-8);
				const after = await this.metaService.update({
					chatEscrowKeys: trimmed,
					chatEscrowActiveKeyId: keyId,
					chatEscrowEnabled: true,
				});
				Object.assign(this.serverSettings, after);
				this.chatCryptoService.clearKeyCache();
				this.moderationLogService.log(me, 'updateServerSettings', {
					chatEscrowRotated: true,
					chatEscrowActiveKeyId: keyId,
					// never log secret
				} as any);
				return {
					...this.statusPayload(),
					generatedSecret: secret,
					generatedKeyId: keyId,
				};
			} else if (action === 'retire') {
				const keyId = ps.keyId?.trim();
				if (!keyId) throw new ApiError(meta.errors.noSuchKey);
				if (keyId === CHAT_ESCROW_FALLBACK_KEY_ID) {
					throw new ApiError(meta.errors.cannotRetireFallback);
				}
				if (keyId === this.chatCryptoService.activeKeyId) {
					throw new ApiError(meta.errors.cannotRetireActive);
				}
				const prev = Array.isArray(this.serverSettings.chatEscrowKeys)
					? [...this.serverSettings.chatEscrowKeys]
					: [];
				const next = prev.filter(k => k.id !== keyId);
				if (next.length === prev.length) throw new ApiError(meta.errors.noSuchKey);
				const after = await this.metaService.update({ chatEscrowKeys: next });
				Object.assign(this.serverSettings, after);
				this.chatCryptoService.clearKeyCache();
				this.moderationLogService.log(me, 'updateServerSettings', {
					chatEscrowRetiredKeyId: keyId,
				} as any);
			}

			return this.statusPayload();
		});
	}

	private statusPayload() {
		const keys = this.chatCryptoService.listPublicKeyInfo();
		return {
			enabled: this.chatCryptoService.isEnabled && this.serverSettings.chatEscrowEnabled !== false,
			activeKeyId: this.chatCryptoService.activeKeyId,
			hasConfigFallback: keys.some(k => k.id === CHAT_ESCROW_FALLBACK_KEY_ID),
			keys,
			generatedSecret: null as string | null,
			generatedKeyId: null as string | null,
		};
	}
}
