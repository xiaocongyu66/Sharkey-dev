/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedSigninSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
		ip: {
			type: 'string',
			optional: false, nullable: false,
		},
		headers: {
			type: 'object',
			optional: false, nullable: false,
		},
		fingerprint: {
			type: 'string',
			optional: true, nullable: true,
		},
		userAgent: {
			type: 'string',
			optional: true, nullable: true,
		},
		success: {
			type: 'boolean',
			optional: false, nullable: false,
		},
	},
} as const;
