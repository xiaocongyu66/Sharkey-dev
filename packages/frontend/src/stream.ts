/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { markRaw } from 'vue';
import { $i } from '@/i.js';
import { wsOrigin } from '@@/js/config.js';

// Heartbeat while tab is visible
const HEART_BEAT_INTERVAL = 1000 * 25;
// Minimum gap between forced reconnect attempts
const FORCE_RECONNECT_COOLDOWN_MS = 1500;

let stream: Misskey.IStream | null = null;
let timeoutHeartBeat: number | null = null;
let lastHeartbeatCall = 0;
let lastForceReconnect = 0;
let wakeHandlersBound = false;

export function useStream(): Misskey.IStream {
	if (stream) return stream;

	stream = markRaw(new Misskey.Stream(wsOrigin, $i ? {
		token: $i.token,
	} : null));

	if (timeoutHeartBeat) window.clearTimeout(timeoutHeartBeat);
	timeoutHeartBeat = window.setTimeout(heartbeat, HEART_BEAT_INTERVAL);

	if (!wakeHandlersBound) {
		wakeHandlersBound = true;
		bindWakeHandlers();
	}

	return stream;
}

/** Current streaming URL scheme (ws / wss) for diagnostics */
export function getStreamOrigin(): string {
	return String(wsOrigin).replace(/^http/, 'ws');
}

/**
 * Call when the tab becomes visible / network returns.
 * Forces socket reconnect if needed and pings so channels re-subscribe.
 */
export function wakeStream(opts?: { force?: boolean }): void {
	const s = stream ?? useStream();
	const force = opts?.force === true;
	const now = Date.now();

	if (force || s.state !== 'connected') {
		if (now - lastForceReconnect >= FORCE_RECONNECT_COOLDOWN_MS) {
			lastForceReconnect = now;
			try {
				s.reconnect();
			} catch { /* ignore */ }
		}
	}

	// Always poke if connected (detect half-open sockets)
	try {
		if (s.state === 'connected') {
			s.ping();
			s.heartbeat();
		}
	} catch { /* ignore */ }

	lastHeartbeatCall = now;
}

function bindWakeHandlers(): void {
	// Tab back to foreground
	window.document.addEventListener('visibilitychange', () => {
		if (window.document.visibilityState !== 'visible') return;
		wakeStream({ force: true });
		// Second poke after a tick — mobile browsers often need it
		window.setTimeout(() => wakeStream({ force: false }), 400);
	});

	// Browser online
	window.addEventListener('online', () => {
		wakeStream({ force: true });
		window.setTimeout(() => wakeStream({ force: false }), 500);
	});

	// BFCache restore (iOS Safari / Chrome back-forward)
	window.addEventListener('pageshow', (ev) => {
		if ((ev as PageTransitionEvent).persisted || window.document.visibilityState === 'visible') {
			wakeStream({ force: true });
		}
	});

	// Window focus (some mobile browsers don't fire visibility reliably)
	window.addEventListener('focus', () => {
		if (window.document.visibilityState === 'visible') {
			wakeStream({ force: stream?.state !== 'connected' });
		}
	});
}

function heartbeat(): void {
	if (stream != null && window.document.visibilityState === 'visible') {
		try {
			// If socket thinks it's connected, heartbeat; otherwise force reconnect
			if (stream.state === 'connected') {
				stream.heartbeat();
			} else {
				wakeStream({ force: true });
			}
		} catch {
			wakeStream({ force: true });
		}
	}
	lastHeartbeatCall = Date.now();
	if (timeoutHeartBeat) window.clearTimeout(timeoutHeartBeat);
	timeoutHeartBeat = window.setTimeout(heartbeat, HEART_BEAT_INTERVAL);
}
