/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Chat E2EE (1:1) using Web Crypto:
 * - ECDH P-256 long-term keypair (private key stays in IndexedDB / localStorage)
 * - AES-GCM message encryption with derived shared secret
 * Server only stores ciphertext + public keys.
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
		// fallback localStorage
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

export async function ensureE2eeKeyPair(): Promise<{ publicKeyJwk: JsonWebKey; privateKey: CryptoKey; publicKey: CryptoKey } | null> {
	if (!$i || !crypto?.subtle) return null;
	const userId = $i.id;
	let stored = await loadStored(userId);

	if (!stored) {
		const kp = await crypto.subtle.generateKey(ALGO_ECDH, true, ['deriveBits', 'deriveKey']);
		const publicKeyJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
		const privateKeyJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
		// strip private from public jwk just in case
		delete (publicKeyJwk as any).d;
		stored = { userId, publicKeyJwk, privateKeyJwk };
		await idbSet(stored);
	}

	const publicKey = await crypto.subtle.importKey('jwk', stored.publicKeyJwk, ALGO_ECDH, true, []);
	const privateKey = await crypto.subtle.importKey('jwk', stored.privateKeyJwk, ALGO_ECDH, false, ['deriveBits', 'deriveKey']);
	return { publicKeyJwk: stored.publicKeyJwk, privateKey, publicKey };
}

export async function publishE2eePublicKey(): Promise<boolean> {
	const pair = await ensureE2eeKeyPair();
	if (!pair) return false;
	try {
		await misskeyApi('chat/e2ee/keys/set' as any, {
			publicKey: JSON.stringify(pair.publicKeyJwk),
		} as any);
		return true;
	} catch {
		return false;
	}
}

const peerKeyCache = new Map<string, JsonWebKey | null>();

export async function fetchPeerPublicKey(userId: string): Promise<JsonWebKey | null> {
	if (peerKeyCache.has(userId)) return peerKeyCache.get(userId) ?? null;
	try {
		const res = await misskeyApi('chat/e2ee/keys/get' as any, { userId } as any) as { publicKey: string | null };
		if (!res.publicKey) {
			peerKeyCache.set(userId, null);
			return null;
		}
		const jwk = JSON.parse(res.publicKey) as JsonWebKey;
		peerKeyCache.set(userId, jwk);
		return jwk;
	} catch {
		peerKeyCache.set(userId, null);
		return null;
	}
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
export async function encryptChatText(peerUserId: string, plaintext: string): Promise<string | null> {
	const me = await ensureE2eeKeyPair();
	if (!me) return null;
	const peerJwk = await fetchPeerPublicKey(peerUserId);
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

export async function decryptChatText(fromUserId: string, ciphertext: string): Promise<string | null> {
	if (!ciphertext.startsWith('v1.')) return null;
	const me = await ensureE2eeKeyPair();
	if (!me) return null;
	const peerJwk = await fetchPeerPublicKey(fromUserId);
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
		return null;
	}
}

export function clearPeerKeyCache() {
	peerKeyCache.clear();
}
