/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Three-party escrow chat crypto (not strict E2EE). Chat only — never notes/posts.
 *
 * - At rest: AES-256-GCM ciphertext.
 * - Who can read: participants (server reveals over TLS) + operator with escrow keys.
 * - Wire: v3s.<keyId>.<ivB64url>.<ctB64url>  (legacy: v3s.<iv>.<ct> uses default key)
 * - Keys live in MiMeta (admin UI) with optional config/env fallback.
 * - Rotation: generate new key, set active; keep old keys to decrypt history.
 */

import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import { bindThis } from '@/decorators.js';

const WIRE_PREFIX = 'v3s';
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
/** Built-in fallback key id (config/env/setupPassword) */
export const CHAT_ESCROW_FALLBACK_KEY_ID = 'cfg';

export type ChatEscrowKeyRecord = {
	id: string;
	/** Raw secret material (never expose via API) */
	secret: string;
	createdAt: string;
};

export type ChatEscrowPublicKeyInfo = {
	id: string;
	/** Short fingerprint for admin UI (not secret) */
	fingerprint: string;
	createdAt: string;
	active: boolean;
};

@Injectable()
export class ChatCryptoService {
	private readonly keyCache = new Map<string, Buffer>();

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,
	) {}

	/** Escrow on when enabled flag is true and at least one master secret exists. */
	public get isEnabled(): boolean {
		if (this.meta.chatEscrowEnabled === false) return false;
		if ((this.config as any).chatEscrowEnabled === false && this.meta.chatEscrowEnabled == null) {
			// config explicitly off and meta not set
			return false;
		}
		return this.listKeyMaterials().length > 0;
	}

	public get activeKeyId(): string | null {
		const materials = this.listKeyMaterials();
		if (materials.length === 0) return null;
		const want = this.meta.chatEscrowActiveKeyId?.trim() || null;
		if (want && materials.some(k => k.id === want)) return want;
		// Prefer non-fallback meta keys
		const metaKey = materials.find(k => k.id !== CHAT_ESCROW_FALLBACK_KEY_ID);
		return (metaKey ?? materials[0]).id;
	}

	public dmConversationId(userA: string, userB: string): string {
		return userA < userB ? `u:${userA}:${userB}` : `u:${userB}:${userA}`;
	}

	public roomConversationId(roomId: string): string {
		return `r:${roomId}`;
	}

	@bindThis
	public isEscrowCiphertext(value: string | null | undefined): boolean {
		return typeof value === 'string' && value.startsWith(`${WIRE_PREFIX}.`);
	}

	/** Admin-safe list (no secrets). */
	@bindThis
	public listPublicKeyInfo(): ChatEscrowPublicKeyInfo[] {
		const active = this.activeKeyId;
		return this.listKeyMaterials().map(k => ({
			id: k.id,
			fingerprint: fingerprintSecret(k.secret),
			createdAt: k.createdAt,
			active: k.id === active,
		}));
	}

	@bindThis
	public generateSecret(): string {
		// 32 bytes → 64 hex chars
		return randomBytes(32).toString('hex');
	}

	@bindThis
	public encrypt(conversationId: string, plaintext: string): string {
		const keyId = this.activeKeyId;
		if (!keyId) throw new Error('chat escrow secret not configured');
		const master = this.masterFor(keyId);
		if (!master) throw new Error('chat escrow secret not configured');
		const key = this.deriveKey(master, conversationId, keyId);
		const iv = randomBytes(IV_LEN);
		const cipher = createCipheriv(ALGO, key, iv);
		const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
		const tag = cipher.getAuthTag();
		const ct = Buffer.concat([enc, tag]);
		return `${WIRE_PREFIX}.${keyId}.${b64url(iv)}.${b64url(ct)}`;
	}

	@bindThis
	public decrypt(conversationId: string, ciphertext: string): string | null {
		if (!this.isEscrowCiphertext(ciphertext)) return null;
		const parts = ciphertext.split('.');
		// v3s.<keyId>.<iv>.<ct>  OR legacy v3s.<iv>.<ct>
		let keyId: string | null = null;
		let ivPart: string;
		let ctPart: string;
		if (parts.length === 4) {
			keyId = parts[1];
			ivPart = parts[2];
			ctPart = parts[3];
		} else if (parts.length === 3) {
			keyId = null;
			ivPart = parts[1];
			ctPart = parts[2];
		} else {
			return null;
		}

		const tryIds = keyId
			? [keyId, ...this.listKeyMaterials().map(k => k.id).filter(id => id !== keyId)]
			: this.listKeyMaterials().map(k => k.id);

		for (const id of tryIds) {
			const master = this.masterFor(id);
			if (!master) continue;
			const plain = this.tryDecrypt(master, id, conversationId, ivPart, ctPart);
			if (plain != null) return plain;
		}
		return null;
	}

	@bindThis
	public prepareOutboundText(opts: {
		conversationId: string;
		text?: string | null;
		isE2ee?: boolean;
		ciphertext?: string | null;
	}): { text: string | null; isE2ee: boolean; ciphertext: string | null } {
		if (opts.isE2ee && opts.ciphertext && opts.ciphertext.trim()) {
			return {
				text: null,
				isE2ee: true,
				ciphertext: opts.ciphertext.trim(),
			};
		}

		const plain = opts.text?.trim() ?? '';
		if (!plain) {
			return { text: null, isE2ee: false, ciphertext: null };
		}

		if (!this.isEnabled) {
			return { text: plain, isE2ee: false, ciphertext: null };
		}

		return {
			text: null,
			isE2ee: true,
			ciphertext: this.encrypt(opts.conversationId, plain),
		};
	}

	@bindThis
	public revealForPack(opts: {
		conversationId: string;
		isE2ee: boolean;
		text: string | null;
		ciphertext: string | null;
	}): { text: string | null; isE2ee: boolean; ciphertext: string | null; encryptedAtRest: boolean } {
		if (!opts.isE2ee) {
			return {
				text: opts.text,
				isE2ee: false,
				ciphertext: null,
				encryptedAtRest: false,
			};
		}

		const ct = opts.ciphertext;
		if (ct && this.isEscrowCiphertext(ct) && this.isEnabled) {
			const plain = this.decrypt(opts.conversationId, ct);
			return {
				text: plain,
				isE2ee: true,
				ciphertext: ct,
				encryptedAtRest: true,
			};
		}

		// Legacy client E2EE (v1.)
		return {
			text: null,
			isE2ee: true,
			ciphertext: ct,
			encryptedAtRest: true,
		};
	}

	// —— key material resolution ——

	private listKeyMaterials(): { id: string; secret: string; createdAt: string }[] {
		const out: { id: string; secret: string; createdAt: string }[] = [];
		const seen = new Set<string>();

		const keys = Array.isArray(this.meta.chatEscrowKeys) ? this.meta.chatEscrowKeys : [];
		for (const k of keys) {
			if (!k?.id || !k?.secret) continue;
			const id = String(k.id).slice(0, 32);
			if (seen.has(id)) continue;
			seen.add(id);
			out.push({
				id,
				secret: String(k.secret),
				createdAt: k.createdAt || new Date(0).toISOString(),
			});
		}

		const fallback =
			(this.config as any).chatEscrowSecret
			|| process.env.CHAT_ESCROW_SECRET
			|| this.config.setupPassword
			|| null;
		if (fallback && String(fallback).length > 0 && !seen.has(CHAT_ESCROW_FALLBACK_KEY_ID)) {
			out.push({
				id: CHAT_ESCROW_FALLBACK_KEY_ID,
				secret: String(fallback),
				createdAt: new Date(0).toISOString(),
			});
		}

		return out;
	}

	private masterFor(keyId: string): Buffer | null {
		const rec = this.listKeyMaterials().find(k => k.id === keyId);
		if (!rec) return null;
		return createHash('sha256').update(rec.secret, 'utf8').digest();
	}

	private deriveKey(master: Buffer, conversationId: string, keyId: string): Buffer {
		const cacheKey = `${keyId}:${conversationId}`;
		const cached = this.keyCache.get(cacheKey);
		if (cached) return cached;
		const key = createHmac('sha256', master)
			.update(`sharkey-chat-escrow:v1:${keyId}:${conversationId}`)
			.digest();
		if (this.keyCache.size > 8000) this.keyCache.clear();
		this.keyCache.set(cacheKey, key);
		return key;
	}

	private tryDecrypt(
		master: Buffer,
		keyId: string,
		conversationId: string,
		ivPart: string,
		ctPart: string,
	): string | null {
		try {
			const iv = b64urlDecode(ivPart);
			const raw = b64urlDecode(ctPart);
			if (raw.length <= TAG_LEN) return null;
			const tag = raw.subarray(raw.length - TAG_LEN);
			const data = raw.subarray(0, raw.length - TAG_LEN);
			const key = this.deriveKey(master, conversationId, keyId);
			// Legacy wire (no keyId) used derive without keyId in HMAC — try both
			const candidates = [key];
			if (keyId === CHAT_ESCROW_FALLBACK_KEY_ID || true) {
				// Also try pre-rotation derive (no keyId in info) for legacy v3s.iv.ct
				const legacy = createHmac('sha256', master)
					.update(`sharkey-chat-escrow:v1:${conversationId}`)
					.digest();
				candidates.push(legacy);
			}
			for (const k of candidates) {
				try {
					const decipher = createDecipheriv(ALGO, k, iv);
					decipher.setAuthTag(tag);
					const pt = Buffer.concat([decipher.update(data), decipher.final()]);
					return pt.toString('utf8');
				} catch {
					// try next
				}
			}
			return null;
		} catch {
			return null;
		}
	}

	/** Clear derived key cache after rotation (optional). */
	@bindThis
	public clearKeyCache(): void {
		this.keyCache.clear();
	}
}

function b64url(buf: Buffer): string {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(s: string): Buffer {
	const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
	return Buffer.from(b64, 'base64');
}

function fingerprintSecret(secret: string): string {
	const hex = createHash('sha256').update(secret, 'utf8').digest('hex');
	return hex.slice(0, 16).replace(/(.{4})/g, '$1 ').trim().toUpperCase();
}
