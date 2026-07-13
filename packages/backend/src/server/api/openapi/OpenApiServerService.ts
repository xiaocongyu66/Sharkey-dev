/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fileURLToPath } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { AuthenticateService, AuthenticationError } from '@/server/api/AuthenticateService.js';
import { genOpenapiSpec } from './gen-spec.js';
import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';

const staticAssets = fileURLToPath(new URL('../../../../assets/', import.meta.url));

/**
 * SK-2026-060: API catalog was public recon surface.
 * /api-doc and /api.json require a valid user (or app) access token.
 */
@Injectable()
export class OpenApiServerService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		private readonly authenticateService: AuthenticateService,
	) {
	}

	/**
	 * Resolve token from Authorization Bearer, query `i`, or body `i` (POST only).
	 */
	private tokenFromRequest(request: FastifyRequest): string | null {
		const auth = request.headers.authorization;
		if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
			const t = auth.slice(7).trim();
			return t.length > 0 ? t : null;
		}
		const q = request.query as Record<string, unknown> | undefined;
		if (q && typeof q.i === 'string' && q.i.length > 0) return q.i;
		const body = request.body as Record<string, unknown> | undefined;
		if (body && typeof body.i === 'string' && body.i.length > 0) return body.i;
		return null;
	}

	@bindThis
	private async requireUser(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
		const token = this.tokenFromRequest(request);
		if (token == null) {
			reply.code(401);
			reply.header('WWW-Authenticate', 'Bearer realm="Sharkey API docs"');
			return false;
		}
		try {
			const [user] = await this.authenticateService.authenticate(token);
			if (user == null) {
				reply.code(401);
				reply.header('WWW-Authenticate', 'Bearer realm="Sharkey API docs"');
				return false;
			}
			return true;
		} catch (e) {
			if (e instanceof AuthenticationError) {
				reply.code(401);
				reply.header('WWW-Authenticate', 'Bearer realm="Sharkey API docs"');
				return false;
			}
			throw e;
		}
	}

	@bindThis
	public createServer(fastify: FastifyInstance, _options: FastifyPluginOptions, done: (err?: Error) => void) {
		// Login shell is public (no secrets); it loads /api.json with the user's token
		fastify.get('/api-doc', async (_request, reply) => {
			reply.header('Cache-Control', 'private, no-store');
			reply.header('X-Robots-Tag', 'noindex');
			return await reply.sendFile('/api-doc.html', staticAssets);
		});

		fastify.get('/api.json', async (request, reply) => {
			const ok = await this.requireUser(request, reply);
			if (!ok) {
				return reply.send({
					error: {
						message: 'Authentication required to access the API catalog.',
						code: 'CREDENTIAL_REQUIRED',
						id: 'a0c1e2d3-4b5a-6789-0abc-def012345678',
					},
				});
			}
			reply.header('Cache-Control', 'private, no-store');
			reply.header('X-Robots-Tag', 'noindex');
			return reply.send(genOpenapiSpec(this.config));
		});
		done();
	}
}
