/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/Meta.js';
import type { MiLocalUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { Logger } from '@/logger.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { assertSafeAiEndpointUrl } from '@/misc/ai-endpoint-url.js';

export type XAlgorithmTimelineSource = 'home' | 'hybrid';

export type XAlgorithmTimelineRequest = {
	user: MiLocalUser;
	source: XAlgorithmTimelineSource;
	limit: number;
	sinceId: string | null;
	untilId: string | null;
	withFiles: boolean;
	withRenotes: boolean;
	withReplies: boolean;
	withBots: boolean;
};

type CacheEntry = {
	ids: string[];
	expiresAt: number;
};

@Injectable()
export class XAlgorithmService {
	private readonly logger: Logger;
	/**
	 * Short TTL cache to absorb rapid refreshes / parallel home+hybrid.
	 * First page (no untilId) uses a slightly longer TTL so pull-to-refresh
	 * doesn't thrash the gateway; paginated slices stay short.
	 */
	private readonly cache = new Map<string, CacheEntry>();
	private readonly CACHE_TTL_MS = 6_000;
	private readonly CACHE_TTL_FIRST_PAGE_MS = 12_000;
	private readonly CACHE_MAX = 300;

	constructor(
		@Inject(DI.meta)
		private readonly meta: MiMeta,

		private readonly httpRequestService: HttpRequestService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('x-algo');
	}

	@bindThis
	public isEnabled(): boolean {
		const config = this.meta.xAlgorithmConfig;
		if (config?.enabled !== true) return false;
		// Toggle alone is not enough — without a mixer endpoint, never divert TL
		// (avoids "I don't use Musk algo" black-hole when enabled but unconfigured).
		return !!(config.homeMixerEndpoint || config.scoredPostsEndpoint);
	}

	@bindThis
	public shouldFallbackToSharkeyTimeline(): boolean {
		// Default true when unset so a dead gateway never black-holes the home TL
		const v = this.meta.xAlgorithmConfig?.fallbackToSharkeyTimeline;
		return v !== false;
	}

	@bindThis
	public async getTimelineNoteIds(request: XAlgorithmTimelineRequest): Promise<string[]> {
		const config = this.meta.xAlgorithmConfig;
		const endpoint = config?.homeMixerEndpoint || config?.scoredPostsEndpoint;
		if (!config?.enabled || !endpoint) {
			return [];
		}

		const cacheKey = this.cacheKey(request);
		const hit = this.cache.get(cacheKey);
		if (hit && hit.expiresAt > Date.now()) {
			return hit.ids.slice(0, request.limit);
		}

		const ids = await this.fetchTimelineNoteIds(request, config, endpoint);
		const firstPage = !request.untilId && !request.sinceId;
		this.setCache(cacheKey, ids, firstPage);
		return ids.slice(0, request.limit);
	}

	@bindThis
	public async testTimeline(request: XAlgorithmTimelineRequest): Promise<string[]> {
		const config = this.meta.xAlgorithmConfig;
		const endpoint = config?.homeMixerEndpoint || config?.scoredPostsEndpoint;
		if (!config) {
			throw new Error('X Algorithm config is not available');
		}
		if (!endpoint) {
			throw new Error('X Algorithm endpoint is not configured');
		}

		// Bypass cache for admin tests
		return await this.fetchTimelineNoteIds(request, config, endpoint);
	}

	@bindThis
	private cacheKey(request: XAlgorithmTimelineRequest): string {
		return [
			request.user.id,
			request.source,
			request.limit,
			request.sinceId ?? '',
			request.untilId ?? '',
			request.withFiles ? '1' : '0',
			request.withRenotes ? '1' : '0',
			request.withReplies ? '1' : '0',
			request.withBots ? '1' : '0',
		].join('|');
	}

	@bindThis
	private setCache(key: string, ids: string[], firstPage = false): void {
		if (this.cache.size >= this.CACHE_MAX) {
			// Drop oldest ~25%
			const n = Math.ceil(this.CACHE_MAX / 4);
			let i = 0;
			for (const k of this.cache.keys()) {
				this.cache.delete(k);
				if (++i >= n) break;
			}
		}
		const ttl = firstPage ? this.CACHE_TTL_FIRST_PAGE_MS : this.CACHE_TTL_MS;
		this.cache.set(key, { ids, expiresAt: Date.now() + ttl });
	}

	@bindThis
	private async fetchTimelineNoteIds(request: XAlgorithmTimelineRequest, config: NonNullable<MiMeta['xAlgorithmConfig']>, endpoint: string): Promise<string[]> {
		const timeoutMs = Math.max(500, Math.min(config.requestTimeoutMs || 3000, 15_000));
		const started = Date.now();

		try {
			// SK-2026-062: validate + private-IP agent (no native fetch SSRF bypass)
			assertSafeAiEndpointUrl(endpoint);
			const candidates = Math.min(
				Math.max(config.candidatesPerRequest || request.limit, request.limit),
				Math.max(request.limit, 50),
				200,
			);

			const response = await this.httpRequestService.send(endpoint, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json',
					...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
				},
				body: JSON.stringify({
					product: 'sharkey',
					source: request.source,
					userId: request.user.id,
					limit: candidates,
					sinceId: request.sinceId,
					untilId: request.untilId,
					filters: {
						withFiles: request.withFiles,
						withRenotes: request.withRenotes,
						withReplies: request.withReplies,
						withBots: request.withBots,
					},
					pipeline: {
						strictOriginalExperience: config.strictOriginalExperience,
						includeInNetwork: config.includeInNetwork,
						includeOutOfNetwork: config.includeOutOfNetwork,
						enableGroxContentUnderstanding: config.enableGroxContentUnderstanding,
						enableAdsBlending: config.enableAdsBlending,
						phoenixEndpoint: config.phoenixEndpoint,
						thunderEndpoint: config.thunderEndpoint,
						groxEndpoint: config.groxEndpoint,
						modelArtifactsPath: config.modelArtifactsPath,
					},
				}),
				timeout: timeoutMs,
				isLocalAddressAllowed: false,
				allowHttp: false,
			}, { throwErrorWhenResponseNotOk: false, validators: [] });

			if (!response.ok) {
				throw new Error(`X Algorithm HTTP ${response.status}`);
			}

			const result = await response.json() as unknown;
			const ids = this.extractNoteIds(result);
			this.logger.debug(`x-algo ok user=${request.user.id} n=${ids.length} ${Date.now() - started}ms`);
			return ids;
		} catch (err) {
			const name = err instanceof Error ? err.name : 'Error';
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.warn(`x-algo fail user=${request.user.id} ${name}: ${msg} (${Date.now() - started}ms)`);
			throw err;
		}
	}

	@bindThis
	private extractNoteIds(result: unknown): string[] {
		if (Array.isArray(result)) {
			return result.map(item => typeof item === 'string' ? item : this.extractIdFromObject(item)).filter((id): id is string => id != null);
		}

		if (result && typeof result === 'object') {
			const record = result as Record<string, unknown>;
			for (const key of ['noteIds', 'postIds', 'tweetIds', 'ids']) {
				const value = record[key];
				if (Array.isArray(value)) {
					return value.map(item => typeof item === 'string' ? item : this.extractIdFromObject(item)).filter((id): id is string => id != null);
				}
			}

			for (const key of ['posts', 'tweets', 'candidates', 'items', 'data']) {
				const value = record[key];
				if (Array.isArray(value)) {
					return value.map(item => this.extractIdFromObject(item)).filter((id): id is string => id != null);
				}
				// Nested { data: { noteIds: [] } }
				if (value && typeof value === 'object') {
					const nested = this.extractNoteIds(value);
					if (nested.length) return nested;
				}
			}
		}

		return [];
	}

	@bindThis
	private extractIdFromObject(item: unknown): string | null {
		if (!item || typeof item === 'string') return typeof item === 'string' ? item : null;
		if (typeof item !== 'object') return null;
		const record = item as Record<string, unknown>;
		for (const key of ['noteId', 'postId', 'tweetId', 'id']) {
			if (typeof record[key] === 'string') return record[key];
		}
		return null;
	}
}
