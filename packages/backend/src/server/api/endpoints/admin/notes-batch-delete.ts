/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';

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
			maxItems: 50,
		},
	},
	required: ['noteIds'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,
		private noteDeleteService: NoteDeleteService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const notes = await this.notesRepository.find({
				where: { id: In(ps.noteIds) },
				relations: ['user'],
			});

			let deleted = 0;
			for (const note of notes) {
				if (note.user == null) continue;
				try {
					// author, note, deleter
					await this.noteDeleteService.delete(note.user, note, me);
					deleted++;
				} catch {
					// continue
				}
			}

			return { deleted };
		});
	}
}
