/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Live user display cache driven by WS `userUpdated` / `userAvatarUpdated`.
 * Lets timeline notes, avatars, and chat rows patch name/avatar/description
 * without a REST refetch when someone updates their profile.
 */

import { shallowRef, computed, type ComputedRef, type Ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { globalEvents } from '@/events.js';

type UserLike = Misskey.entities.UserLite | Misskey.entities.User;

type UserUpdatedPayload = {
	user: UserLike;
	updatedAt: string;
};

const MAX_ENTRIES = 2000;
/** userId -> latest patch */
const patches = new Map<string, { user: UserLike; updatedAt: string; ts: number }>();
/** Bumped so Vue computeds re-evaluate */
const version = shallowRef(0);

function bustAvatarUrl(url: string | null | undefined, updatedAt: string): string | null | undefined {
	if (url == null) return url;
	const base = String(url).split('?')[0];
	return `${base}?t=${encodeURIComponent(updatedAt)}`;
}

function normalizePatch(payload: UserUpdatedPayload): { user: UserLike; updatedAt: string } | null {
	const u = payload?.user;
	if (!u?.id) return null;
	const updatedAt = payload.updatedAt ? String(payload.updatedAt) : new Date().toISOString();
	const next: UserLike = {
		...u,
		avatarUrl: bustAvatarUrl(u.avatarUrl, updatedAt) as any,
	};
	return { user: next, updatedAt };
}

export function applyUserUpdated(payload: UserUpdatedPayload): void {
	const norm = normalizePatch(payload);
	if (!norm) return;

	// Evict oldest when capped
	if (patches.size >= MAX_ENTRIES && !patches.has(norm.user.id)) {
		let oldestId: string | null = null;
		let oldestTs = Infinity;
		for (const [id, e] of patches) {
			if (e.ts < oldestTs) {
				oldestTs = e.ts;
				oldestId = id;
			}
		}
		if (oldestId) patches.delete(oldestId);
	}

	patches.set(norm.user.id, { ...norm, ts: Date.now() });
	version.value++;
	globalEvents.emit('userUpdated', { user: norm.user, updatedAt: norm.updatedAt });
}

export function getLiveUserPatch(userId: string): UserLike | null {
	return patches.get(userId)?.user ?? null;
}

/** Merge a packed user with any live patch (avatar/name/description/…). */
export function mergeLiveUser<T extends UserLike>(user: T): T {
	const patch = patches.get(user.id);
	if (!patch) return user;
	return {
		...user,
		...patch.user,
		// Prefer patch avatar (already cache-busted)
		avatarUrl: patch.user.avatarUrl ?? user.avatarUrl,
		name: patch.user.name !== undefined ? patch.user.name : user.name,
		description: (patch.user as any).description !== undefined
			? (patch.user as any).description
			: (user as any).description,
		avatarBlurhash: (patch.user as any).avatarBlurhash ?? (user as any).avatarBlurhash,
		avatarDecorations: (patch.user as any).avatarDecorations ?? (user as any).avatarDecorations,
	} as T;
}

/**
 * Reactive merge: re-renders when this user (or any user) receives a WS patch.
 * Use in avatar / note header components.
 */
export function useLiveUser<T extends UserLike>(user: Ref<T> | (() => T)): ComputedRef<T> {
	const get = typeof user === 'function' ? user : () => user.value;
	return computed(() => {
		// depend on version
		void version.value;
		return mergeLiveUser(get());
	});
}

/** Subscribe once from boot; also re-export for tests. */
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
