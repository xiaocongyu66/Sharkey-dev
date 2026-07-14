/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as ipaddr from 'ipaddr.js';

/**
 * Validate OpenAI-compatible AI base URLs / full endpoints (SK-2026-061/062).
 * - https only (http allowed only for loopback hostnames in dev via allowHttpLocal)
 * - no credentials in URL
 * - no raw IP literals that are non-unicast / private (defense before DNS)
 * - optional hostname allowlist
 */
export function assertSafeAiEndpointUrl(
	raw: string,
	opts?: {
		/** Allow http://127.0.0.1 and http://localhost for local gateways */
		allowHttpLocal?: boolean;
		/** If set, hostname must match one of these (exact or suffix .example.com) */
		hostnameAllowlist?: string[] | null;
	},
): URL {
	const trimmed = (raw ?? '').trim();
	if (!trimmed) {
		throw new Error('AI endpoint URL is empty');
	}

	let u: URL;
	try {
		u = new URL(trimmed);
	} catch {
		throw new Error('AI endpoint URL is invalid');
	}

	if (u.username || u.password) {
		throw new Error('AI endpoint URL must not include credentials');
	}

	const host = u.hostname.toLowerCase();
	const isLocalName = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';

	if (u.protocol === 'http:') {
		if (!(opts?.allowHttpLocal && isLocalName)) {
			throw new Error('AI endpoint URL must use https');
		}
	} else if (u.protocol !== 'https:') {
		throw new Error('AI endpoint URL must use https');
	}

	// Block literal non-unicast / private IPs (SSRF to metadata etc.)
	const bare = host.replace(/^\[|\]$/g, '');
	if (ipaddr.isValid(bare)) {
		const parsed = ipaddr.parse(bare);
		const range = parsed.range();
		if (range !== 'unicast') {
			// unicast includes public; private/loopback/linkLocal etc. are other ranges
			// Allow only explicit local when allowHttpLocal
			if (!(opts?.allowHttpLocal && (range === 'loopback'))) {
				throw new Error(`AI endpoint address blocked: ${range}`);
			}
		}
		// private IPv4 is still 'unicast' in some versions — check kind
		if (parsed.kind() === 'ipv4') {
			const v4 = parsed as ipaddr.IPv4;
			if (v4.range() === 'private' || v4.range() === 'linkLocal' || v4.range() === 'carrierGradeNat' || v4.range() === 'loopback') {
				if (!(opts?.allowHttpLocal && v4.range() === 'loopback')) {
					throw new Error(`AI endpoint private IP blocked: ${v4.range()}`);
				}
			}
		}
		if (parsed.kind() === 'ipv6') {
			const v6 = parsed as ipaddr.IPv6;
			const r = v6.range();
			if (r === 'uniqueLocal' || r === 'linkLocal' || r === 'loopback' || r === 'carrierGradeNat') {
				if (!(opts?.allowHttpLocal && r === 'loopback')) {
					throw new Error(`AI endpoint private IPv6 blocked: ${r}`);
				}
			}
		}
	}

	// Block common cloud metadata hostnames
	if (host === 'metadata.google.internal' || host.endsWith('.internal')) {
		throw new Error('AI endpoint host blocked');
	}

	const allow = opts?.hostnameAllowlist?.filter(Boolean).map(h => h.toLowerCase()) ?? null;
	if (allow && allow.length > 0) {
		const ok = allow.some(a => host === a || host.endsWith(`.${a}`));
		if (!ok) {
			throw new Error('AI endpoint host not in allowlist');
		}
	}

	return u;
}

/** Normalize OpenAI-style base to end with /v1 (no trailing slash after). */
export function normalizeOpenAiV1Base(baseUrl: string): string {
	let u = baseUrl.trim().replace(/\/+$/, '');
	if (!/\/v1$/i.test(u)) {
		u = `${u}/v1`;
	}
	return u;
}
