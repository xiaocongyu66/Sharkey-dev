/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Legacy client-side E2EE (1:1, wire prefix v1.) using Web Crypto:
 * - ECDH P-256 long-term keypair (private key stays in IndexedDB / localStorage)
 * - AES-GCM message encryption with derived shared secret
 *
 * Preferred model is server-side chat escrow (v3s, AES-GCM) in ChatCryptoService:
 * participants + operator with chatEscrowSecret can read; notes/posts are never encrypted.
 * This module remains only for decrypting older v1. client-E2EE messages.
 */

import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';

const DB_NAME = 'sharkey-chat-e2ee';
const STORE = 'keys';
const ALGO_ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const ALGO_AES = { name: 'AES-GCM', length: 256 } as const;

type StoredKeyPair = {
	userId: string;
	publicKeyJwk: JsonWebKey;
	privateKeyJwk: JsonWebKey;
	keyId?: string;
};

type PeerKeyRecord = {
	jwk: JsonWebKey;
	keyId: string | null;
	updatedAt: string | null;
};

function storageKey(userId: string) {
	return `chat-e2ee-keypair:${userId}`;
}

function b64encode(buf: ArrayBuffer | Uint8Array): string {
	const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let s = '';
	for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
	return btoa(s);
}

function b64decode(s: string): Uint8Array {
	const bin = atob(s);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** Short fingerprint from public JWK (matches server when keyId omitted). */
export async function fingerprintPublicKey(publicKeyJwk: JsonWebKey): Promise<string> {
	const raw = JSON.stringify({
		crv: publicKeyJwk.crv,
		kty: publicKeyJwk.kty,
		x: publicKeyJwk.x,
		y: publicKeyJwk.y,
	});
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
	const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
	return hex.slice(0, 16);
}

async function openDb(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === 'undefined') return null;
	return await new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function idbGet(userId: string): Promise<StoredKeyPair | null> {
	const db = await openDb();
	if (!db) return null;
	return await new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).get(userId);
		req.onsuccess = () => resolve((req.result as StoredKeyPair) ?? null);
		req.onerror = () => reject(req.error);
	});
}

async function idbSet(pair: StoredKeyPair): Promise<void> {
	const db = await openDb();
	if (!db) {
		localStorage.setItem(storageKey(pair.userId), JSON.stringify(pair));
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(pair, pair.userId);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

async function loadStored(userId: string): Promise<StoredKeyPair | null> {
	try {
		const fromIdb = await idbGet(userId);
		if (fromIdb) return fromIdb;
	} catch { /* ignore */ }
	try {
		const raw = localStorage.getItem(storageKey(userId));
		if (raw) return JSON.parse(raw) as StoredKeyPair;
	} catch { /* ignore */ }
	return null;
}

export async function ensureE2eeKeyPair(): Promise<{
	publicKeyJwk: JsonWebKey;
	privateKey: CryptoKey;
	publicKey: CryptoKey;
	keyId: string;
} | null> {
	if (!$i || !crypto?.subtle) return null;
	const userId = $i.id;
	let stored = await loadStored(userId);

	if (!stored) {
		const kp = await crypto.subtle.generateKey(ALGO_ECDH, true, ['deriveBits', 'deriveKey']);
		const publicKeyJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
		const privateKeyJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
		delete (publicKeyJwk as any).d;
		const keyId = await fingerprintPublicKey(publicKeyJwk);
		stored = { userId, publicKeyJwk, privateKeyJwk, keyId };
		await idbSet(stored);
	} else if (!stored.keyId) {
		stored.keyId = await fingerprintPublicKey(stored.publicKeyJwk);
		await idbSet(stored);
	}

	const publicKey = await crypto.subtle.importKey('jwk', stored.publicKeyJwk, ALGO_ECDH, true, []);
	const privateKey = await crypto.subtle.importKey('jwk', stored.privateKeyJwk, ALGO_ECDH, false, ['deriveBits', 'deriveKey']);
	return { publicKeyJwk: stored.publicKeyJwk, privateKey, publicKey, keyId: stored.keyId! };
}

export type E2eeWsApi = {
	ready: () => boolean;
	request: <T = unknown>(
		wsType: string,
		wsBody: Record<string, unknown>,
		okEvent: string,
		errEvent: string,
		apiEndpoint?: string,
		apiBody?: Record<string, unknown>,
		timeoutMs?: number,
	) => Promise<T>;
};

export async function publishE2eePublicKey(ws?: E2eeWsApi | null): Promise<{ ok: boolean; keyId?: string | null }> {
	const pair = await ensureE2eeKeyPair();
	if (!pair) return { ok: false };
	const body = {
		publicKey: JSON.stringify(pair.publicKeyJwk),
		keyId: pair.keyId,
	};
	try {
		if (ws?.ready()) {
			const res = await ws.request<{ ok?: boolean; keyId?: string }>(
				'e2eeKeySet',
				body,
				'e2eeKeySetAck',
				'e2eeKeyError',
				'chat/e2ee/keys/set',
				body as any,
			);
			return { ok: !!(res as any)?.ok || true, keyId: (res as any)?.keyId ?? pair.keyId };
		}
		const res = await misskeyApi('chat/e2ee/keys/set' as any, body as any) as { ok?: boolean; keyId?: string };
		return { ok: true, keyId: res?.keyId ?? pair.keyId };
	} catch {
		return { ok: false };
	}
}

const peerKeyCache = new Map<string, PeerKeyRecord | null>();

export async function fetchPeerPublicKey(
	userId: string,
	opts?: { force?: boolean; ws?: E2eeWsApi | null },
): Promise<JsonWebKey | null> {
	if (!opts?.force && peerKeyCache.has(userId)) {
		return peerKeyCache.get(userId)?.jwk ?? null;
	}
	try {
		let res: { publicKey: string | null; keyId?: string | null; updatedAt?: string | null };
		if (opts?.ws?.ready()) {
			res = await opts.ws.request(
				'e2eeKeyGet',
				{ userId },
				'e2eeKey',
				'e2eeKeyError',
				'chat/e2ee/keys/get',
				{ userId },
			) as any;
		} else {
			res = await misskeyApi('chat/e2ee/keys/get' as any, { userId } as any) as any;
		}
		if (!res?.publicKey) {
			peerKeyCache.set(userId, null);
			return null;
		}
		const jwk = JSON.parse(res.publicKey) as JsonWebKey;
		peerKeyCache.set(userId, {
			jwk,
			keyId: res.keyId ?? null,
			updatedAt: res.updatedAt ?? null,
		});
		return jwk;
	} catch {
		peerKeyCache.set(userId, null);
		return null;
	}
}

export function invalidatePeerKey(userId: string) {
	peerKeyCache.delete(userId);
}

export function clearPeerKeyCache() {
	peerKeyCache.clear();
}

export function getCachedPeerKeyId(userId: string): string | null {
	return peerKeyCache.get(userId)?.keyId ?? null;
}

/** Human-readable short fingerprint for verification UI */
export async function peerKeyFingerprintLabel(userId: string): Promise<string | null> {
	const rec = peerKeyCache.get(userId);
	if (!rec?.jwk) return null;
	const id = rec.keyId || await fingerprintPublicKey(rec.jwk);
	// Group hex into 4-char chunks
	return id.replace(/(.{4})/g, '$1 ').trim().toUpperCase();
}

async function deriveAesKey(myPrivate: CryptoKey, peerPublicJwk: JsonWebKey): Promise<CryptoKey> {
	const peerPublic = await crypto.subtle.importKey('jwk', peerPublicJwk, ALGO_ECDH, true, []);
	return await crypto.subtle.deriveKey(
		{ name: 'ECDH', public: peerPublic },
		myPrivate,
		ALGO_AES,
		false,
		['encrypt', 'decrypt'],
	);
}

/** Ciphertext wire format: v1.<ivB64>.<ctB64> */
export async function encryptChatText(
	peerUserId: string,
	plaintext: string,
	ws?: E2eeWsApi | null,
): Promise<string | null> {
	const me = await ensureE2eeKeyPair();
	if (!me) return null;
	const peerJwk = await fetchPeerPublicKey(peerUserId, { ws });
	if (!peerJwk) return null;

	const aes = await deriveAesKey(me.privateKey, peerJwk);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		aes,
		new TextEncoder().encode(plaintext),
	);
	return `v1.${b64encode(iv)}.${b64encode(ct)}`;
}

export async function decryptChatText(
	fromUserId: string,
	ciphertext: string,
	ws?: E2eeWsApi | null,
): Promise<string | null> {
	if (!ciphertext.startsWith('v1.')) return null;
	const me = await ensureE2eeKeyPair();
	if (!me) return null;
	const peerJwk = await fetchPeerPublicKey(fromUserId, { ws });
	if (!peerJwk) return null;

	const parts = ciphertext.split('.');
	if (parts.length !== 3) return null;
	const iv = b64decode(parts[1]);
	const ct = b64decode(parts[2]);
	try {
		const aes = await deriveAesKey(me.privateKey, peerJwk);
		const pt = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv },
			aes,
			ct,
		);
		return new TextDecoder().decode(pt);
	} catch {
		// Force refresh peer key once (rotation) then retry
		const peerJwk2 = await fetchPeerPublicKey(fromUserId, { force: true, ws });
		if (!peerJwk2) return null;
		try {
			const aes = await deriveAesKey(me.privateKey, peerJwk2);
			const pt = await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv },
				aes,
				ct,
			);
			return new TextDecoder().decode(pt);
		} catch {
			return null;
		}
	}
}
