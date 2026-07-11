/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository, UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { DI } from '@/di-symbols.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { RoleService } from '@/core/RoleService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:show-user',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		query: { type: 'string', nullable: true },
		username: { type: 'string', nullable: true },
		email: { type: 'string', nullable: true },
		clientIp: { type: 'string', nullable: true },
		clientFingerprint: { type: 'string', nullable: true },
		/** false = local only; true = include federated (remote) posts */
		includeRemote: { type: 'boolean', default: false },
		/** only staff-hidden posts */
		onlyHidden: { type: 'boolean', default: false },
		/** exclude hidden (default true for normal view) */
		excludeHidden: { type: 'boolean', default: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private queryService: QueryService,
		private noteEntityService: NoteEntityService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const meIsAdmin = await this.roleService.isAdministrator(me);
			const meIsMod = await this.roleService.isModerator(me);

			const query = this.queryService.makePaginationQuery(
				this.notesRepository.createQueryBuilder('note'),
				ps.sinceId,
				ps.untilId,
			)
				.innerJoinAndSelect('note.user', 'user');

			if (!ps.includeRemote) {
				query.andWhere('note.userHost IS NULL');
			}

			if (ps.userId) {
				query.andWhere('note.userId = :userId', { userId: ps.userId });
			}

			if (ps.username && ps.username.trim()) {
				const un = ps.username.trim().replace(/^@/, '').toLowerCase();
				query.andWhere('user.usernameLower = :usernameLower', { usernameLower: un });
			}

			if (ps.query && ps.query.trim().length > 0) {
				query.andWhere('note.text ILIKE :q', { q: `%${ps.query.trim()}%` });
			}

			if (meIsAdmin && ps.clientIp && ps.clientIp.trim()) {
				query.andWhere('note.clientIp ILIKE :cip', { cip: `%${ps.clientIp.trim()}%` });
			}

			if (meIsAdmin && ps.clientFingerprint && ps.clientFingerprint.trim()) {
				query.andWhere('note.clientFingerprint ILIKE :cfp', { cfp: `%${ps.clientFingerprint.trim()}%` });
			}

			if (meIsAdmin && ps.email && ps.email.trim()) {
				const profiles = await this.userProfilesRepository.createQueryBuilder('p')
					.select('p.userId')
					.where('p.email ILIKE :email', { email: `%${ps.email.trim()}%` })
					.getMany();
				const ids = profiles.map(p => p.userId);
				if (ids.length === 0) return [];
				query.andWhere('note.userId IN (:...emailUserIds)', { emailUserIds: ids });
			}

			if (meIsMod) {
				if (ps.onlyHidden) {
					query.andWhere('note.isHidden = true');
				} else if (ps.excludeHidden !== false) {
					// normal list: hide staff-hidden unless viewing "hidden" tab
					// still show them to mods if onlyHidden is off and excludeHidden false
					query.andWhere('note.isHidden = false');
				}
			} else {
				query.andWhere('note.isHidden = false');
			}

			const notes = await query.limit(ps.limit).getMany();
			const packed = await this.noteEntityService.packMany(notes, me, {
				// force detail for moderation
			} as any);

			return packed.map((p, i) => {
				const raw = notes[i];
				return {
					...p,
					isHidden: raw.isHidden === true,
					...(meIsAdmin ? {
						clientIp: raw.clientIp ?? null,
						clientFingerprint: raw.clientFingerprint ?? null,
					} : {
						clientIp: null,
						clientFingerprint: null,
					}),
				};
			});
		});
	}
}
