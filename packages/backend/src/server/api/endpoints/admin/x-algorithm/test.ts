/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { XAlgorithmService } from '@/core/XAlgorithmService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin:meta',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			ok: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			noteIds: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
					optional: false, nullable: false,
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		source: { type: 'string', enum: ['home', 'hybrid'], default: 'home' },
		limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly xAlgorithmService: XAlgorithmService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const noteIds = await this.xAlgorithmService.testTimeline({
				user: me,
				source: ps.source,
				limit: ps.limit,
				sinceId: null,
				untilId: null,
				withFiles: false,
				withRenotes: true,
				withReplies: ps.source === 'hybrid',
				withBots: true,
			});

			return {
				ok: true,
				noteIds,
			};
		});
	}
}
