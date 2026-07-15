/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';

export type FanoutTimelineName = (
	// home timeline
	| `homeTimeline:${string}`
	| `homeTimelineWithFiles:${string}` // only notes with files are included
	// local timeline
	| `localTimeline` // replies are not included
	| `localTimelineWithFiles` // only non-reply notes with files are included
	| `localTimelineWithReplies` // only replies are included
	| `localTimelineWithReplyTo:${string}` // Only replies to specific local user are included. Parameter is reply user id.

	// antenna
	| `antennaTimeline:${string}`

	// user timeline
	| `userTimeline:${string}` // replies are not included
	| `userTimelineWithFiles:${string}` // only non-reply notes with files are included
	| `userTimelineWithReplies:${string}` // only replies are included
	| `userTimelineWithChannel:${string}` // only channel notes are included, replies are included

	// user list timelines
	| `userListTimeline:${string}`
	| `userListTimelineWithFiles:${string}` // only notes with files are included

	// channel timelines
	| `channelTimeline:${string}` // replies are included

	// role timelines
	| `roleTimeline:${string}` // any notes are included
);

/**
 * Never pull unbounded fanout lists (PERF-01 / SK Pass 13).
 * Lists are newest-first (LPUSH); window covers normal pagination + filter churn.
 */
export const FANOUT_READ_MAX = 1000;

export type FanoutReadResult = {
	/** Newest-first IDs after until/since filter, sorted for the caller's direction */
	ids: string[];
	/**
	 * SK-098: raw window was full-sized, so older IDs may exist past the window.
	 * Callers paging with untilId older than the window must DB-fallback.
	 */
	windowFull: boolean;
	/** Oldest id in the raw Redis window (before until/since filter), if any */
	windowOldestId: string | null;
};

@Injectable()
export class FanoutTimelineService {
	constructor(
		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		private idService: IdService,
		private readonly timeService: TimeService,
	) {
	}

	@bindThis
	public async push(tl: FanoutTimelineName, id: string, maxlen: number, pipeline: Redis.ChainableCommander) {
		const createdAt = this.idService.parse(id).date.getTime();

		// リモートから遅れて届いた(もしくは後から追加された)投稿日時が古い投稿が追加されるとページネーション時に問題を引き起こすため、
		// 3分以内に投稿されたものでない場合、Redisにある最古のIDより新しい場合のみ追加する
		if (createdAt > this.timeService.now - 1000 * 60 * 3) {
			pipeline.lpush('list:' + tl, id);
			// Always trim (was ~10% random) so lists cannot grow past maxlen
			pipeline.ltrim('list:' + tl, 0, maxlen - 1);
		} else {
			// 末尾のIDを取得
			const lastId = await this.redisForTimelines.lindex('list:' + tl, -1);
			{
				if (lastId == null || (createdAt > this.idService.parse(lastId).date.getTime())) {
					pipeline.lpush('list:' + tl, id);
					pipeline.ltrim('list:' + tl, 0, maxlen - 1);
				}
			}
		}
	}

	private processRawIds(
		raw: string[],
		untilId?: string | null,
		sinceId?: string | null,
	): FanoutReadResult {
		const windowFull = raw.length >= FANOUT_READ_MAX;
		const windowOldestId = raw.length > 0 ? raw[raw.length - 1]! : null;

		let ids: string[];
		if (untilId && sinceId) {
			ids = raw.filter(id => id < untilId && id > sinceId).sort((a, b) => a > b ? -1 : 1);
		} else if (untilId) {
			ids = raw.filter(id => id < untilId).sort((a, b) => a > b ? -1 : 1);
		} else if (sinceId) {
			ids = raw.filter(id => id > sinceId).sort((a, b) => a < b ? -1 : 1);
		} else {
			ids = [...raw].sort((a, b) => a > b ? -1 : 1);
		}

		return { ids, windowFull, windowOldestId };
	}

	@bindThis
	public get(name: FanoutTimelineName, untilId?: string | null, sinceId?: string | null): Promise<string[]> {
		return this.getDetailed(name, untilId, sinceId).then(r => r.ids);
	}

	@bindThis
	public getDetailed(name: FanoutTimelineName, untilId?: string | null, sinceId?: string | null): Promise<FanoutReadResult> {
		const rangeEnd = FANOUT_READ_MAX - 1;
		return this.redisForTimelines.lrange('list:' + name, 0, rangeEnd)
			.then(raw => this.processRawIds(raw, untilId, sinceId));
	}

	@bindThis
	public getMulti(name: FanoutTimelineName[], untilId?: string | null, sinceId?: string | null): Promise<string[][]> {
		return this.getMultiDetailed(name, untilId, sinceId).then(rows => rows.map(r => r.ids));
	}

	@bindThis
	public getMultiDetailed(name: FanoutTimelineName[], untilId?: string | null, sinceId?: string | null): Promise<FanoutReadResult[]> {
		const pipeline = this.redisForTimelines.pipeline();
		const rangeEnd = FANOUT_READ_MAX - 1;
		for (const n of name) {
			pipeline.lrange('list:' + n, 0, rangeEnd);
		}
		return pipeline.exec().then(res => {
			if (res == null) return [];
			return res.map(r => this.processRawIds((r[1] as string[]) ?? [], untilId, sinceId));
		});
	}

	/**
	 * SK-098: client wants notes older than our Redis window can provide.
	 * untilId is exclusive upper bound (newer side); windowOldest is the oldest id we read.
	 */
	public static needsDbForOlderPage(
		untilId: string | null | undefined,
		windowFull: boolean,
		windowOldestId: string | null,
	): boolean {
		if (!untilId || !windowFull || windowOldestId == null) return false;
		// Need strictly older than windowOldest → not present in the bounded LRANGE
		return untilId <= windowOldestId;
	}

	@bindThis
	public purge(name: FanoutTimelineName) {
		return this.redisForTimelines.del('list:' + name);
	}
}
