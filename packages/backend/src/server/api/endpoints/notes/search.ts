/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { fileTypeCategories, SearchService } from '@/core/SearchService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../error.js';
import type { MiNote } from '@/models/Note.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,

	description: 'Full-text search notes. When the instance uses Meilisearch, `order` is only `asc`|`desc` and `host` must be `.` (local) or a hostname-like string (filter injection hardened).',

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
		unavailable: {
			message: 'Search of notes unavailable.',
			code: 'UNAVAILABLE',
			id: '0b44998d-77aa-4427-80d0-d2c9b8523011',
		},
	},

	// 2 calls per second
	limit: {
		duration: 1000,
		max: 2,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string' },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		host: {
			type: 'string',
			nullable: true,
			// SK-2026-054: free host was Meili filter injection surface
			// `.` = local; otherwise hostname-like (no quotes/ops)
			pattern: '^(\\.|[a-zA-Z0-9._:-]{1,253})$',
			description: 'The local host is represented with `.`.',
		},
		filetype: {
			type: 'string',
			nullable: true,
			enum: fileTypeCategories,
		},
		userId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		channelId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		// SK-2026-054: was free string interpolated into Meili sort
		order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
	},
	required: ['query'],
} as const;

// TODO: ロジックをサービスに切り出す

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private noteEntityService: NoteEntityService,
		private searchService: SearchService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const policies = await this.roleService.getUserPolicies(me ? me.id : null);
			if (!policies.canSearchNotes) {
				throw new ApiError(meta.errors.unavailable);
			}

			let notes: MiNote[];
			try {
				notes = await this.searchService.searchNote(ps.query, me, {
					userId: ps.userId,
					channelId: ps.channelId,
					host: ps.host,
					filetype: ps.filetype,
					order: ps.order,
				}, {
					untilId: ps.untilId,
					sinceId: ps.sinceId,
					limit: ps.limit,
				});
			} catch (err: any) {
				// MeiliSearch (or other provider) unavailable at runtime -> treat as search unavailable
				if (err?.message?.includes('MeiliSearch') || err?.message?.includes('not available')) {
					throw new ApiError(meta.errors.unavailable);
				}
				throw err;
			}

			return await this.noteEntityService.packMany(notes, me);
		});
	}
}
