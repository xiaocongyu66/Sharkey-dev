/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository, ChannelFollowingsRepository, MiMeta } from '@/models/_.js';
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

		@Inject(DI.channelFollowingsRepository)
		private channelFollowingsRepository: ChannelFollowingsRepository,

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
		const logger = loggerService.getLogger('notes/timeline');

		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : null);

			this.userService.markUserActive(me);

			const loadDb = async (u: string | null, s: string | null, limit: number) => {
				try {
					return await this.getFromDb({
						untilId: u,
						sinceId: s,
						limit,
						withFiles: ps.withFiles,
						withRenotes: ps.withRenotes,
						withBots: ps.withBots,
					}, me);
				} catch (err) {
					// HF / small PG: EXISTS-based home queries can hit statement_timeout.
					// Never surface 500 "请重试" — return empty so the client recovers.
					const msg = err instanceof Error ? err.message : String(err);
					if (/statement timeout|canceling statement/i.test(msg)) {
						logger.warn(`home timeline DB query timed out (limit=${limit}): ${msg}`);
						return [];
					}
					throw err;
				}
			};

			// X/Musk algorithm path removed — always use native Sharkey timeline
			if (!this.serverSettings.enableFanoutTimeline) {
				const timeline = await loadDb(untilId, sinceId, ps.limit);
				return await this.noteEntityService.packMany(timeline, me);
			}

			// Must await: otherwise reverse-proxy / HF can time out while work still runs.
			const timeline = await this.fanoutTimelineEndpointService.timeline({
				untilId,
				sinceId,
				limit: ps.limit,
				// Prefer partial redis results over slow full DB scan on constrained hosts
				allowPartial: true,
				me,
				useDbFallback: this.serverSettings.enableFanoutTimelineDbFallback,
				redisTimelines: ps.withFiles ? [`homeTimelineWithFiles:${me.id}`] : [`homeTimeline:${me.id}`],
				excludePureRenotes: !ps.withRenotes,
				excludeBots: !ps.withBots,
				dbFallback: async (u, s, limit) => await loadDb(u, s, limit),
			});

			return timeline;
		});

		this.logger = logger;
	}

	/**
	 * Home timeline from DB using followee IN-list (from cache) instead of per-row EXISTS.
	 * Much cheaper under statement_timeout on small instances.
	 */
	private async getFromDb(ps: { untilId: string | null; sinceId: string | null; limit: number; withFiles: boolean; withRenotes: boolean; withBots: boolean; }, me: MiLocalUser) {
		const followings = await this.cacheService.userFollowingsCache.fetch(me.id);
		// Include self; IN-list avoids correlated EXISTS on every note row
		const followeeIds = Array.from(new Set([...followings.keys(), me.id]));

		const channelRows = await this.channelFollowingsRepository.find({
			where: { followerId: me.id },
			select: { followeeId: true },
		});
		const channelIds = channelRows.map(r => r.followeeId);

		const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId)
			.andWhere(new Brackets(qb => {
				// Posts by me / people I follow (not in a channel)
				qb.where(new Brackets(q0 => {
					q0.where('note.userId IN (:...followeeIds)', { followeeIds })
						.andWhere('note.channelId IS NULL');
				}));
				// Or in channels I follow
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
