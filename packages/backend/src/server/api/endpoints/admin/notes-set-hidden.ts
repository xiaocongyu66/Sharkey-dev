/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:show-user',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteIds: {
			type: 'array',
			items: { type: 'string', format: 'misskey:id' },
			minItems: 1,
			maxItems: 100,
		},
		isHidden: { type: 'boolean' },
	},
	required: ['noteIds', 'isHidden'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const result = await this.notesRepository.update(
				{ id: In(ps.noteIds) },
				{ isHidden: ps.isHidden },
			);

			return {
				updated: result.affected ?? ps.noteIds.length,
			};
		});
	}
}
