/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Live user display cache driven by WS `userUpdated` / `userAvatarUpdated`.
 * Patches only display fields (name / avatar) so timeline notes do not flicker
 * or lose emojis when a slim broadcast arrives.
 */

import { shallowRef, computed, type ComputedRef, type Ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { globalEvents } from '@/events.js';

type UserLike = Misskey.entities.UserLite | Misskey.entities.User;

type UserUpdatedPayload = {
	user: UserLike;
	updatedAt: string;
};

/** Only fields safe to overlay on packed note.user without wiping emojis etc. */
type DisplayPatch = {
	name?: string | null;
	avatarUrl?: string | null;
	avatarBlurhash?: string | null;
	avatarDecorations?: UserLike['avatarDecorations'];
	updatedAt: string;
	ts: number;
};

const MAX_ENTRIES = 2000;
const patches = new Map<string, DisplayPatch>();
/** Per-user version so only components for that user re-render meaningfully */
const userVersions = new Map<string, number>();
const globalBump = shallowRef(0);

function baseAvatar(url: string | null | undefined): string | null {
	if (url == null) return null;
	return String(url).split('?')[0];
}

function bustAvatarUrl(url: string | null | undefined, updatedAt: string): string | null | undefined {
	if (url == null) return url;
	return `${baseAvatar(url)}?t=${encodeURIComponent(updatedAt)}`;
}

function normalizePatch(payload: UserUpdatedPayload): { id: string; patch: DisplayPatch } | null {
	const u = payload?.user;
	if (!u?.id) return null;
	const updatedAt = payload.updatedAt ? String(payload.updatedAt) : new Date().toISOString();
	const prev = patches.get(u.id);

	const nextAvatarBase = u.avatarUrl != null ? baseAvatar(u.avatarUrl) : null;
	const prevAvatarBase = prev?.avatarUrl != null ? baseAvatar(prev.avatarUrl) : null;
	const avatarChanged = nextAvatarBase != null && nextAvatarBase !== prevAvatarBase;

	const patch: DisplayPatch = {
		name: u.name !== undefined ? u.name : prev?.name,
		avatarUrl: u.avatarUrl != null
			? (avatarChanged || !prev?.avatarUrl
				? (bustAvatarUrl(u.avatarUrl, updatedAt) as string)
				: prev.avatarUrl)
			: prev?.avatarUrl,
		avatarBlurhash: (u as any).avatarBlurhash !== undefined
			? (u as any).avatarBlurhash
			: prev?.avatarBlurhash,
		avatarDecorations: (u as any).avatarDecorations !== undefined
			? (u as any).avatarDecorations
			: prev?.avatarDecorations,
		updatedAt,
		ts: Date.now(),
	};

	// Skip no-op (same display fields)
	if (
		prev
		&& prev.name === patch.name
		&& prevAvatarBase === (patch.avatarUrl ? baseAvatar(patch.avatarUrl) : null)
		&& prev.avatarBlurhash === patch.avatarBlurhash
	) {
		return null;
	}

	return { id: u.id, patch };
}

export function applyUserUpdated(payload: UserUpdatedPayload): void {
	const norm = normalizePatch(payload);
	if (!norm) return;

	if (patches.size >= MAX_ENTRIES && !patches.has(norm.id)) {
		let oldestId: string | null = null;
		let oldestTs = Infinity;
		for (const [id, e] of patches) {
			if (e.ts < oldestTs) {
				oldestTs = e.ts;
				oldestId = id;
			}
		}
		if (oldestId) {
			patches.delete(oldestId);
			userVersions.delete(oldestId);
		}
	}

	patches.set(norm.id, norm.patch);
	userVersions.set(norm.id, (userVersions.get(norm.id) ?? 0) + 1);
	globalBump.value++;
	globalEvents.emit('userUpdated', {
		user: { id: norm.id, ...norm.patch } as any,
		updatedAt: norm.patch.updatedAt,
	});
}

export function getLiveUserPatch(userId: string): DisplayPatch | null {
	return patches.get(userId) ?? null;
}

/** Merge only display fields; never replace whole user (keeps emojis/username). */
export function mergeLiveUser<T extends UserLike>(user: T): T {
	const patch = patches.get(user.id);
	if (!patch) return user;

	const nameDiff = patch.name !== undefined && patch.name !== user.name;
	const avatarDiff = patch.avatarUrl != null
		&& baseAvatar(patch.avatarUrl) !== baseAvatar(user.avatarUrl);

	if (!nameDiff && !avatarDiff) return user;

	return {
		...user,
		...(nameDiff ? { name: patch.name } : {}),
		...(avatarDiff ? {
			avatarUrl: patch.avatarUrl,
			avatarBlurhash: patch.avatarBlurhash ?? (user as any).avatarBlurhash,
			avatarDecorations: patch.avatarDecorations ?? (user as any).avatarDecorations,
		} : {}),
	} as T;
}

/**
 * Reactive merge for avatar/name components.
 * Depends on globalBump so patches apply; merge is no-op when no patch for this id.
 */
export function useLiveUser<T extends UserLike>(user: Ref<T> | (() => T)): ComputedRef<T> {
	const get = typeof user === 'function' ? user : () => user.value;
	return computed(() => {
		const u = get();
		void globalBump.value;
		void userVersions.get(u.id);
		return mergeLiveUser(u);
	});
}

export function installLiveUserCacheFromStream(stream: {
	on: (ev: string, cb: (p: any) => void) => void;
	off?: (ev: string, cb: (p: any) => void) => void;
}): () => void {
	const onUpdated = (body: any) => applyUserUpdated(body);
	stream.on('userUpdated', onUpdated);
	return () => {
		try {
			stream.off?.('userUpdated', onUpdated);
		} catch { /* ignore */ }
	};
}
