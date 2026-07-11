/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { } from '@/models/Blocking.js';
import type { MiSignin } from '@/models/Signin.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { extractClientFingerprint, extractUserAgent } from '@/misc/fingerprint.js';

@Injectable()
export class SigninEntityService {
	constructor(
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: MiSignin,
	) {
		const fingerprint = src.fingerprint ?? extractClientFingerprint(src.headers);
		const userAgent = extractUserAgent(src.headers);
		return {
			id: src.id,
			createdAt: this.idService.parse(src.id).date.toISOString(),
			ip: src.ip,
			headers: src.headers,
			fingerprint,
			userAgent,
			success: src.success,
		};
	}
}

