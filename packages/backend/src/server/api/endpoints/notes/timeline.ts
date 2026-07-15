/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository, MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { MiLocalUser } from '@/models/User.js';
import { FanoutTimelineEndpointService } from '@/core/FanoutTimelineEndpointService.js';
import { UserService } from '@/core/UserService.js';
import { CacheService } from '@/core/CacheService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { Logger } from '@/logger.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},

	errors: {
		// SK-2026-096: do not pretend timeout is an empty feed
		temporarilyUnavailable: {
			message: 'Home timeline is temporarily unavailable. Please try again.',
			code: 'TEMPORARILY_UNAVAILABLE',
			id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
			kind: 'server' as const,
			httpStatusCode: 503,
		},
	},

	// 10 calls per 5 seconds
	limit: {
		duration: 1000 * 5,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		allowPartial: { type: 'boolean', default: false }, // true is recommended but for compatibility false by default
		withFiles: { type: 'boolean', default: false },
		withRenotes: { type: 'boolean', default: true },
		withBots: { type: 'boolean', default: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	private readonly logger: Logger;

	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private noteEntityService: NoteEntityService,
		private activeUsersChart: ActiveUsersChart,
		private idService: IdService,
		private fanoutTimelineEndpointService: FanoutTimelineEndpointService,
		private userFollowingService: UserFollowingService,
		private queryService: QueryService,
		private readonly userService: UserService,
		private readonly cacheService: CacheService,
		loggerService: LoggerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : null);

			this.userService.markUserActive(me);

			// Same control flow as TransFem-org/Sharkey home timeline:
			// fanout redis first, DB only when fanout is off or redis is insufficient.
			// (No X/Musk algorithm diversion.)
			if (!this.serverSettings.enableFanoutTimeline) {
				const timeline = await this.getFromDbSafe({
					untilId,
					sinceId,
					limit: ps.limit,
					withFiles: ps.withFiles,
					withRenotes: ps.withRenotes,
					withBots: ps.withBots,
				}, me);
				return await this.noteEntityService.packMany(timeline, me);
			}

			const timeline = await this.fanoutTimelineEndpointService.timeline({
				untilId,
				sinceId,
				limit: ps.limit,
				allowPartial: ps.allowPartial,
				me,
				useDbFallback: this.serverSettings.enableFanoutTimelineDbFallback,
				redisTimelines: ps.withFiles ? [`homeTimelineWithFiles:${me.id}`] : [`homeTimeline:${me.id}`],
				excludePureRenotes: !ps.withRenotes,
				// Same as hybrid/local (upstream home omits this; keep so withBots works on fanout path)
				excludeBots: !ps.withBots,
				dbFallback: async (untilId, sinceId, limit) => await this.getFromDbSafe({
					untilId,
					sinceId,
					limit,
					withFiles: ps.withFiles,
					withRenotes: ps.withRenotes,
					withBots: ps.withBots,
				}, me),
			});

			return timeline;
		});

		this.logger = loggerService.getLogger('notes/timeline');
	}

	/**
	 * DB path with statement_timeout guard.
	 * SK-2026-096: throw TEMPORARILY_UNAVAILABLE (not empty []) so clients do not
	 * treat overload as "no posts".
	 */
	private async getFromDbSafe(ps: {
		untilId: string | null;
		sinceId: string | null;
		limit: number;
		withFiles: boolean;
		withRenotes: boolean;
		withBots: boolean;
	}, me: MiLocalUser) {
		try {
			return await this.getFromDb(ps, me);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (/statement timeout|canceling statement/i.test(msg)) {
				this.logger.warn(`home timeline DB timed out (limit=${ps.limit}): ${msg}`);
				throw new ApiError(meta.errors.temporarilyUnavailable);
			}
			throw err;
		}
	}

	/**
	 * Same result set as upstream (channel I follow OR me OR followee, channelId IS NULL),
	 * but uses cached ID lists + IN instead of correlated EXISTS for cheaper plans.
	 */
	private async getFromDb(ps: {
		untilId: string | null;
		sinceId: string | null;
		limit: number;
		withFiles: boolean;
		withRenotes: boolean;
		withBots: boolean;
	}, me: MiLocalUser) {
		const followings = await this.cacheService.userFollowingsCache.fetch(me.id);
		const followeeIds = Array.from(new Set([...followings.keys(), me.id]));
		const channelIds = Array.from(await this.cacheService.userFollowingChannelsCache.fetch(me.id));

		const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId)
			// in a channel I follow OR my own post OR by a user I follow
			.andWhere(new Brackets(qb => {
				qb.where(new Brackets(q0 => {
					q0.where('note.userId IN (:...followeeIds)', { followeeIds })
						.andWhere('note.channelId IS NULL');
				}));
				if (channelIds.length > 0) {
					qb.orWhere('note.channelId IN (:...channelIds)', { channelIds });
				}
			}))
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser')
			.limit(ps.limit);

		this.queryService.generateExcludedRepliesQueryForNotes(query, me);
		// Fork: staff-aware visibility (upstream: generateVisibilityQuery)
		await this.queryService.generateVisibilityQueryFor(query, me);
		this.queryService.generateBlockedHostQueryForNote(query);
		this.queryService.generateSuspendedUserQueryForNote(query);
		this.queryService.generateSilencedUserQueryForNotes(query, me);
		this.queryService.generateMutedUserQueryForNotes(query, me);
		this.queryService.generateBlockedUserQueryForNotes(query, me);
		this.queryService.generateMutedNoteThreadQuery(query, me);

		if (ps.withFiles) {
			query.andWhere('note.fileIds != \'{}\'');
		}

		if (!ps.withBots) query.andWhere('user.isBot = FALSE');

		if (!ps.withRenotes) {
			this.queryService.generateExcludedRenotesQueryForNotes(query);
		} else {
			this.queryService.generateMutedUserRenotesQueryForNotes(query, me);
		}

		return await query.getMany();
	}
}
