/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';

/**
 * Prefer client-provided fingerprint headers; otherwise derive a stable hash
 * from common browser headers for admin audit trails.
 */
export function extractClientFingerprint(headers: Record<string, any> | null | undefined): string | null {
	if (!headers) return null;
	const direct =
		headers['x-client-fingerprint'] ??
		headers['x-fingerprint'] ??
		headers['x-device-fingerprint'];
	if (typeof direct === 'string' && direct.trim().length > 0) {
		return direct.trim().slice(0, 256);
	}

	const ua = String(headers['user-agent'] ?? '');
	const al = String(headers['accept-language'] ?? '');
	const ae = String(headers['accept-encoding'] ?? '');
	if (!ua && !al) return null;

	return createHash('sha256').update(`${ua}|${al}|${ae}`).digest('hex').slice(0, 32);
}

export function extractUserAgent(headers: Record<string, any> | null | undefined): string | null {
	if (!headers) return null;
	const ua = headers['user-agent'];
	return typeof ua === 'string' && ua.length > 0 ? ua.slice(0, 512) : null;
}
