/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { UserService } from '@/core/UserService.js';
import { DI } from '@/di-symbols.js';
import type { NoteFavoritesRepository } from '@/models/_.js';
import { NoteVisibilityService } from '@/core/NoteVisibilityService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['notes', 'favorites'],

	requireCredential: true,

	kind: 'write:favorites',

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '80848a2c-398f-4343-baa9-df1d57696c56',
		},

		notFavorited: {
			message: 'You have not marked that note a favorite.',
			code: 'NOT_FAVORITED',
			id: 'b625fc69-635e-45e9-86f4-dbefbef35af5',
		},
	},

	// 20 calls per hour (match create)
	limit: {
		duration: ms('1hour'),
		max: 20,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.noteFavoritesRepository)
		private noteFavoritesRepository: NoteFavoritesRepository,

		private getterService: GetterService,
		private readonly userService: UserService,
		private readonly noteVisibilityService: NoteVisibilityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Get favoritee
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			// if already favorited — allow delete even if visibility later changed
			const exist = await this.noteFavoritesRepository.findOneBy({
				noteId: note.id,
				userId: me.id,
			});

			if (exist == null) {
				// SK-2026-086: inaccessible notes must not leak via NOT_FAVORITED vs NO_SUCH_NOTE
				if (note.userId !== me.id) {
					const { accessible } = await this.noteVisibilityService.checkNoteVisibilityAsync(note, me);
					if (!accessible) {
						throw new ApiError(meta.errors.noSuchNote);
					}
				}
				throw new ApiError(meta.errors.notFavorited);
			}

			this.userService.markUserActive(me, true);

			// Delete favorite
			await this.noteFavoritesRepository.delete(exist.id);
		});
	}
}
