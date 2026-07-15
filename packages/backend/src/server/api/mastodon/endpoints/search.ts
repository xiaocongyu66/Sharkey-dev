/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { NotesRepository, UsersRepository } from '@/models/_.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import { TimeService } from '@/global/TimeService.js';
import { MastodonClientService } from '@/server/api/mastodon/MastodonClientService.js';
import { attachMinMaxPagination, attachOffsetPagination } from '@/server/api/mastodon/pagination.js';
import { promiseMap } from '@/misc/promise-map.js';
import { MastodonConverters } from '../MastodonConverters.js';
import { parseTimelineArgs, TimelineArgs, toBoolean, toInt } from '../argsUtils.js';
import type { FastifyInstance } from 'fastify';
import type { Entity } from 'megalodon';

interface ApiSearchMastodonRoute {
	Querystring: TimelineArgs & {
		type?: string;
		q?: string;
		resolve?: string;
	}
}

@Injectable()
export class ApiSearchMastodon {
	private globalNotesRankingCache: string[] = [];
	private globalNotesRankingCacheLastFetchedAt = 0;

	constructor(
		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		@Inject(DI.usersRepository)
		private readonly usersRepository: UsersRepository,

		private readonly mastoConverters: MastodonConverters,
		private readonly clientService: MastodonClientService,
		private readonly featuredService: FeaturedService,
		private readonly queryService: QueryService,
		private readonly roleService: RoleService,
		private readonly timeService: TimeService,
	) {}

	public register(fastify: FastifyInstance): void {
		fastify.get<ApiSearchMastodonRoute>('/v1/search', async (request, reply) => {
			if (!request.query.q) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required property "q"' });
			if (!request.query.type) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required property "type"' });

			const type = request.query.type;
			if (type !== 'hashtags' && type !== 'statuses' && type !== 'accounts') {
				return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Invalid type' });
			}

			const { client, me } = await this.clientService.getAuthClient(request);

			if (toBoolean(request.query.resolve) && !me) {
				return reply.code(401).send({ error: 'The access token is invalid', error_description: 'Authentication is required to use the "resolve" property' });
			}
			if (toInt(request.query.offset) && !me) {
				return reply.code(401).send({ error: 'The access token is invalid', error_description: 'Authentication is required to use the "offset" property' });
			}

			// TODO implement resolve

			const query = parseTimelineArgs(request.query);
			const { data } = await client.search(request.query.q, { type, ...query });
			const response = {
				...data,
				accounts: await promiseMap(data.accounts, (account: Entity.Account) => this.mastoConverters.convertAccount(account), { limiter: 3 }),
				statuses: await promiseMap(data.statuses, (status: Entity.Status) => this.mastoConverters.convertStatus(status, me), { limiter: 3 }),
			};

			if (type === 'hashtags') {
				attachOffsetPagination(request, reply, response.hashtags);
			} else {
				attachMinMaxPagination(request, reply, response[type]);
			}

			return reply.send(response);
		});

		fastify.get<ApiSearchMastodonRoute>('/v2/search', async (request, reply) => {
			if (!request.query.q) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required property "q"' });

			const type = request.query.type;
			if (type !== undefined && type !== 'hashtags' && type !== 'statuses' && type !== 'accounts') {
				return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Invalid type' });
			}

			const { client, me } = await this.clientService.getAuthClient(request);

			if (toBoolean(request.query.resolve) && !me) {
				return reply.code(401).send({ error: 'The access token is invalid', error_description: 'Authentication is required to use the "resolve" property' });
			}
			if (toInt(request.query.offset) && !me) {
				return reply.code(401).send({ error: 'The access token is invalid', error_description: 'Authentication is required to use the "offset" property' });
			}

			// TODO implement resolve

			const query = parseTimelineArgs(request.query);
			const acct = !type || type === 'accounts' ? await client.search(request.query.q, { type: 'accounts', ...query }) : null;
			const stat = !type || type === 'statuses' ? await client.search(request.query.q, { type: 'statuses', ...query }) : null;
			const tags = !type || type === 'hashtags' ? await client.search(request.query.q, { type: 'hashtags', ...query }) : null;
			const response = {
				accounts: acct ? await promiseMap(acct.data.accounts, async (account: Entity.Account) => await this.mastoConverters.convertAccount(account), { limiter: 3 }) : [],
				statuses: acct ? await promiseMap(acct.data.statuses, async (status: Entity.Status) => this.mastoConverters.convertStatus(status, me), { limiter: 3 }) : [],
				hashtags: tags?.data.hashtags ?? [],
			};

			// Pagination hack, based on "best guess" expected behavior.
			// Mastodon doesn't document this part at all!
			const longestResult = [response.statuses, response.hashtags]
				.reduce((longest: unknown[], current: unknown[]) => current.length > longest.length ? current : longest, response.accounts);

			// Ignore min/max pagination because how TF would that work with multiple result sets??
			// Offset pagination is the only possible option
			attachOffsetPagination(request, reply, longestResult);

			return reply.send(response);
		});

		// SK-2026-092: in-process FeaturedService (no self-HTTP loopback)
		fastify.get<ApiSearchMastodonRoute>('/v1/trends/statuses', async (request, reply) => {
			const me = await this.clientService.getAuth(request);
			const policies = await this.roleService.getUserPolicies(me ? me.id : null);
			if (!policies.ltlAvailable) {
				return reply.code(403).send({ error: 'LTL_DISABLED', error_description: 'Local timeline has been disabled.' });
			}

			let noteIds: string[];
			if (this.globalNotesRankingCacheLastFetchedAt !== 0 && (this.timeService.now - this.globalNotesRankingCacheLastFetchedAt < 1000 * 60 * 30)) {
				noteIds = this.globalNotesRankingCache;
			} else {
				noteIds = await this.featuredService.getGlobalNotesRanking(100);
				this.globalNotesRankingCache = noteIds;
				this.globalNotesRankingCacheLastFetchedAt = this.timeService.now;
			}

			noteIds = [...noteIds].sort((a, b) => a > b ? -1 : 1).slice(0, 10);
			if (noteIds.length === 0) {
				attachMinMaxPagination(request, reply, []);
				return reply.send([]);
			}

			const query = this.notesRepository.createQueryBuilder('note')
				.where('note.id IN (:...noteIds)', { noteIds })
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser')
				.leftJoinAndSelect('note.channel', 'channel')
				.andWhere('user.isExplorable = TRUE');

			await this.queryService.generateVisibilityQueryFor(query, me);
			this.queryService.generateBlockedHostQueryForNote(query);
			this.queryService.generateSuspendedUserQueryForNote(query);
			this.queryService.generateSilencedUserQueryForNotes(query, me);
			if (me) {
				this.queryService.generateMutedUserQueryForNotes(query, me);
				this.queryService.generateBlockedUserQueryForNotes(query, me);
				this.queryService.generateMutedNoteThreadQuery(query, me);
			}

			const notes = await query.getMany();
			notes.sort((a, b) => a.id > b.id ? -1 : 1);
			// Build minimal Status stubs + note hints (avoid self-HTTP pack round-trip)
			const response = await promiseMap(notes, async (note) => {
				const stub = {
					id: note.id,
					account: note.user as any,
					created_at: note.createdAt instanceof Date
						? note.createdAt.toISOString()
						: String((note as any).createdAt ?? new Date().toISOString()),
					favourites_count: 0,
					favourited: false,
					muted: false,
					sensitive: false,
					visibility: 'public',
					media_attachments: [],
					reblog: null,
					poll: null,
					emoji_reactions: [],
				} as unknown as Entity.Status;
				return await this.mastoConverters.convertStatus(stub, me, {
					note,
					user: note.user as any,
				});
			}, { limiter: 4 });

			attachMinMaxPagination(request, reply, response);
			return reply.send(response);
		});

		// SK-2026-092: in-process user listing (no self-HTTP loopback)
		fastify.get<ApiSearchMastodonRoute>('/v2/suggestions', async (request, reply) => {
			const limit = Math.min(Math.max(1, parseTimelineArgs(request.query).limit ?? 20), 100);
			const users = await this.usersRepository.createQueryBuilder('user')
				.where('user.isExplorable = TRUE')
				.andWhere('user.isSuspended = FALSE')
				.andWhere('user.host IS NULL')
				.andWhere('user.updatedAt > :date', { date: new Date(this.timeService.now - 1000 * 60 * 60 * 24 * 5) })
				.orderBy('user.followersCount', 'DESC')
				.take(limit)
				.getMany();

			const response = await promiseMap(users, async entry => ({
				source: 'global',
				account: await this.mastoConverters.convertAccount(entry),
			}), {
				limiter: 4,
			});

			attachOffsetPagination(request, reply, response);
			return reply.send(response);
		});
	}
}
