/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Misskey } from 'megalodon';
import { Inject, Injectable } from '@nestjs/common';
import { MiLocalUser } from '@/models/User.js';
import { AuthenticateService } from '@/server/api/AuthenticateService.js';
import type { FastifyRequest } from 'fastify';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';

@Injectable()
export class MastodonClientService {
	constructor(
		@Inject(DI.config)
		private readonly config: Config,

		private readonly authenticateService: AuthenticateService,
	) {}

	/**
	 * Gets the authenticated user and API client for a request.
	 */
	public async getAuthClient(request: FastifyRequest, accessToken?: string | null): Promise<{ client: Misskey, me: MiLocalUser | null }> {
		const authorization = request.headers.authorization;
		accessToken = accessToken !== undefined ? accessToken : getAccessToken(authorization);

		const me = await this.getAuth(request, accessToken);
		const client = this.getClient(request, accessToken);

		return { client, me };
	}

	/**
	 * Gets the authenticated client user for a request.
	 */
	public async getAuth(request: FastifyRequest, accessToken?: string | null): Promise<MiLocalUser | null> {
		const authorization = request.headers.authorization;
		accessToken = accessToken !== undefined ? accessToken : getAccessToken(authorization);
		const [me] = await this.authenticateService.authenticate(accessToken);
		return me;
	}

	/**
	 * Creates an authenticated API client for a request.
	 */
	public getClient(request: FastifyRequest, accessToken?: string | null): Misskey {
		const authorization = request.headers.authorization;
		accessToken = accessToken !== undefined ? accessToken : getAccessToken(authorization);

		// TODO pass agent?
		const baseUrl = this.getBaseUrl(request);
		const userAgent = request.headers['user-agent'];
		return new Misskey(baseUrl, accessToken, userAgent);
	}

	getBaseUrl(_request?: FastifyRequest): string {
		return getBaseUrl(_request, this.config.url);
	}
}

/**
 * Instance origin for server-side Mastodon glue (SK-2026-064).
 * Never derive outbound URLs from request Host / X-Forwarded-Host.
 */
export function getBaseUrl(request?: FastifyRequest, configUrl?: string): string {
	// Prefer explicit config origin for server-side outbound (SK-2026-064).
	if (configUrl) {
		try {
			return new URL(configUrl).origin;
		} catch {
			/* fall through */
		}
	}
	// Client-facing only (Link pagination / logging) — never used for server fetch.
	if (request?.host) {
		return `${request.protocol}://${request.host}`;
	}
	return 'http://127.0.0.1';
}

/**
 * Extracts the first access token from an authorization header
 * Returns null if none were found.
 */
function getAccessToken(authorization: string | undefined): string | null {
	const accessTokenArr = authorization?.split(' ') ?? [null];
	return accessTokenArr[accessTokenArr.length - 1];
}
