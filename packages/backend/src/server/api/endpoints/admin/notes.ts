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
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		query: { type: 'string', nullable: true },
		username: { type: 'string', nullable: true },
		email: { type: 'string', nullable: true },
		clientIp: { type: 'string', nullable: true },
		clientFingerprint: { type: 'string', nullable: true },
		/**
		 * local = 本站非隐藏
		 * remote = 远程非隐藏
		 * hidden = 已隐藏（本站+远程）
		 * all = 全部非隐藏（本站+远程）— legacy
		 */
		scope: {
			type: 'string',
			enum: ['local', 'remote', 'hidden', 'all'],
			default: 'local',
		},
		/** @deprecated use scope=remote / all */
		includeRemote: { type: 'boolean', default: false },
		/** @deprecated use scope=hidden */
		onlyHidden: { type: 'boolean', default: false },
		/** @deprecated use scope */
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

			// Resolve scope from new param or legacy flags
			let scope: 'local' | 'remote' | 'hidden' | 'all' = ps.scope ?? 'local';
			if (ps.onlyHidden) scope = 'hidden';
			else if (ps.includeRemote && scope === 'local') scope = 'all';

			const query = this.queryService.makePaginationQuery(
				this.notesRepository.createQueryBuilder('note'),
				ps.sinceId,
				ps.untilId,
			)
				// leftJoin so notes remain listed even if user row is missing
				.leftJoinAndSelect('note.user', 'user');

			// Scope: local / remote / all / hidden
			if (scope === 'local') {
				query.andWhere('note.userHost IS NULL');
			} else if (scope === 'remote') {
				query.andWhere('note.userHost IS NOT NULL');
			}
			// all / hidden: no host filter

			if (meIsMod) {
				if (scope === 'hidden') {
					query.andWhere('note.isHidden = true');
				} else {
					// local / remote / all: non-hidden by default
					query.andWhere('(note.isHidden = false OR note.isHidden IS NULL)');
				}
			} else {
				query.andWhere('(note.isHidden = false OR note.isHidden IS NULL)');
			}

			if (ps.userId) {
				query.andWhere('note.userId = :userId', { userId: ps.userId });
			}

			if (ps.username && ps.username.trim()) {
				const un = ps.username.trim().replace(/^@/, '').toLowerCase();
				// partial match so lists are not empty when typing
				query.andWhere('user.usernameLower LIKE :usernameLower', { usernameLower: `${un}%` });
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

			const notes = await query.limit(ps.limit).getMany();

			// skipHide: moderators must see full text of followers-only / DM-ish notes for moderation
			const packed = await this.noteEntityService.packMany(notes, me, {
				detail: true,
				skipHide: true,
			} as any);

			// Map by id — packMany may not preserve array order in edge cases
			const byId = new Map(notes.map(n => [n.id, n]));

			return packed.map((p) => {
				const raw = byId.get(p.id);
				return {
					...p,
					isHidden: raw?.isHidden === true,
					...(meIsAdmin ? {
						clientIp: raw?.clientIp ?? null,
						clientFingerprint: raw?.clientFingerprint ?? null,
					} : {
						clientIp: null,
						clientFingerprint: null,
					}),
				};
			});
		});
	}
}
