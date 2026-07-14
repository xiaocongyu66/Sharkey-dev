/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type * as Misskey from 'misskey-js';
import { DI } from '@/di-symbols.js';
import type { SigninsRepository, UserProfilesRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import type { MiLocalUser } from '@/models/User.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { SigninEntityService } from '@/core/entities/SigninEntityService.js';
import { bindThis } from '@/decorators.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { CacheService } from '@/core/CacheService.js';
import { EmailService } from '@/core/EmailService.js';
import { NotificationService } from '@/core/NotificationService.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { extractClientFingerprint } from '@/misc/fingerprint.js';
import { AiAbuseControlService } from '@/core/AiAbuseControlService.js';

@Injectable()
export class SigninService {
	constructor(
		@Inject(DI.signinsRepository)
		private signinsRepository: SigninsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private signinEntityService: SigninEntityService,
		private emailService: EmailService,
		private notificationService: NotificationService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private readonly cacheService: CacheService,
		private readonly aiAbuseControlService: AiAbuseControlService,
	) {
	}

	@bindThis
	public signin(request: FastifyRequest, reply: FastifyReply, user: MiLocalUser) {
		setImmediate(async () => {
			try {
				this.notificationService.createNotification(user.id, 'login', {});

				const headers = request.headers as any;
				const ip = (request.ip && String(request.ip)) || '0.0.0.0';
				const fingerprint = extractClientFingerprint(headers);
				const record = await this.signinsRepository.insertOne({
					id: this.idService.gen(),
					userId: user.id,
					// Never null — DB column is NOT NULL (proxy misconfig can omit request.ip)
					ip,
					headers: headers ?? {},
					fingerprint,
					success: true,
				});

				await this.globalEventService.publishMainStream(user.id, 'signin', await this.signinEntityService.pack(record));

				// AI multi-account / abuse control (async; never blocks login response)
				this.aiAbuseControlService.scheduleCheck({
					userId: user.id,
					ip,
					fingerprint,
					trigger: 'signin',
				});

				const profile = await this.cacheService.userProfileCache.fetch(user.id);
				if (profile.email && profile.emailVerified) {
					trackPromise(this.emailService.sendEmail(profile.email, 'New login / ログインがありました',
						'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。',
						'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。'));
				}
			} catch {
				// Login already succeeded; audit trail must not break the response path
			}
		});

		reply.code(200);
		return {
			finished: true,
			id: user.id,
			i: user.token!,
		} satisfies Misskey.entities.SigninFlowResponse;
	}
}

