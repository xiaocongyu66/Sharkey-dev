/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/Meta.js';
import type { MiLocalUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';

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

@Injectable()
export class XAlgorithmService {
	constructor(
		@Inject(DI.meta)
		private readonly meta: MiMeta,
	) {
	}

	@bindThis
	public isEnabled(): boolean {
		return this.meta.xAlgorithmConfig?.enabled === true;
	}

	@bindThis
	public shouldFallbackToSharkeyTimeline(): boolean {
		return this.meta.xAlgorithmConfig?.fallbackToSharkeyTimeline === true;
	}

	@bindThis
	public async getTimelineNoteIds(request: XAlgorithmTimelineRequest): Promise<string[]> {
		const config = this.meta.xAlgorithmConfig;
		const endpoint = config?.homeMixerEndpoint || config?.scoredPostsEndpoint;
		if (!config?.enabled) {
			return [];
		}
		if (!endpoint) {
			throw new Error('X Algorithm endpoint is not configured');
		}

		return await this.fetchTimelineNoteIds(request, config, endpoint);
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

		return await this.fetchTimelineNoteIds(request, config, endpoint);
	}

	@bindThis
	private async fetchTimelineNoteIds(request: XAlgorithmTimelineRequest, config: NonNullable<MiMeta['xAlgorithmConfig']>, endpoint: string): Promise<string[]> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
				},
				body: JSON.stringify({
					product: 'sharkey',
					source: request.source,
					userId: request.user.id,
					limit: Math.min(config.candidatesPerRequest, request.limit),
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
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`X Algorithm responded with HTTP ${response.status}`);
			}

			const result = await response.json() as unknown;
			return this.extractNoteIds(result).slice(0, request.limit);
		} finally {
			clearTimeout(timeout);
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

			for (const key of ['posts', 'tweets', 'candidates', 'items']) {
				const value = record[key];
				if (Array.isArray(value)) {
					return value.map(item => this.extractIdFromObject(item)).filter((id): id is string => id != null);
				}
			}
		}

		return [];
	}

	@bindThis
	private extractIdFromObject(item: unknown): string | null {
		if (!item || typeof item !== 'object') return null;
		const record = item as Record<string, unknown>;
		for (const key of ['noteId', 'postId', 'tweetId', 'id']) {
			if (typeof record[key] === 'string') return record[key];
		}
		return null;
	}
}
