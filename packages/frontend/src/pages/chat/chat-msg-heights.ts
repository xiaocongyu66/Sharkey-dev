/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Remember chat message row heights across tab switches / remounts.
 * Prevents "scroll position vanishes" when media-heavy history re-lazy-mounts
 * with a tiny default placeholder (72px) instead of real image/video height.
 */

const heights = new Map<string, number>();
const MAX = 2000;

export function rememberChatMsgHeight(id: string, h: number): void {
	if (!id || !Number.isFinite(h) || h <= 0) return;
	heights.set(id, Math.round(h));
	if (heights.size > MAX) {
		// Drop oldest insertions
		const drop = heights.size - MAX;
		let i = 0;
		for (const k of heights.keys()) {
			heights.delete(k);
			if (++i >= drop) break;
		}
	}
}

export function getChatMsgHeight(id: string): number | null {
	return heights.get(id) ?? null;
}

export function clearChatMsgHeights(): void {
	heights.clear();
}
