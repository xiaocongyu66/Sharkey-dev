/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { isUserFromMutedInstance } from '@/misc/is-instance-muted.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { NotificationEntityService } from '@/core/entities/NotificationEntityService.js';
import { CacheService } from '@/core/CacheService.js';
import { bindThis } from '@/decorators.js';
import type { MainEventPayload } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { type Channel, NoteChannel, type MiChannelService } from '../channel.js';

class MainChannel extends NoteChannel {
	public readonly chName = 'main';
	public static shouldShare = true;
	public static requireCredential = true as const;
	public static kind = 'read:account';

	constructor(
		id: string,
		connection: Channel['connection'],
		noteEntityService: NoteEntityService,
		private readonly cacheService: CacheService,
		private readonly notificationService: NotificationService,
		private readonly notificationEntityService: NotificationEntityService,
	) {
		super(id, connection, noteEntityService);
	}

	@bindThis
	public async init(): Promise<boolean> {
		if (!this.user) return false;

		this.subscriber.on(`mainStream:${this.user.id}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: MainEventPayload): Promise<void> {
		switch (data.type) {
			case 'notification': {
				// Ignore notifications from instances the user has muted
				if (isUserFromMutedInstance(data.body, this.userMutedInstances)) return;
				if (data.body.userId) {
					const relation = await this.cacheService.getUserRelation(this.user!.id, data.body.userId);
					if (relation.isMuting) return;
				}

				if (data.body.note) {
					const preparedNote = await this.prepareNote(data.body.note);
					if (!preparedNote) return;

					data.body.note = preparedNote;
				}
				break;
			}
			case 'mention': {
				const preparedNote = await this.prepareNote(data.body);
				if (preparedNote) {
					this.send(data.type, preparedNote);
				}
				return;
			}
		}

		this.send(data.type, data.body);
	}

	/**
	 * Request/response over main WS — prefer over REST when stream is connected.
	 * - notifications: catch-up / page load
	 * - (read all still uses connection-level readNotification)
	 */
	@bindThis
	public async onMessage(type: string, body: any): Promise<void> {
		if (!this.user) return;

		if (type === 'notifications' || type === 'requestNotifications') {
			try {
				const limit = Math.min(Math.max(1, Math.floor(Number(body?.limit) || 20)), 100);
				const untilId = typeof body?.untilId === 'string' ? body.untilId : undefined;
				const sinceId = typeof body?.sinceId === 'string' ? body.sinceId : undefined;
				const reqId = typeof body?.reqId === 'string' ? body.reqId : null;
				const notifications = await this.notificationService.getNotifications(this.user.id, {
					limit,
					untilId,
					sinceId,
				});
				const packed = await this.notificationEntityService.packMany(notifications, this.user);
				this.send('notifications', {
					reqId,
					notifications: packed,
					hasMore: notifications.length === limit,
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'error';
				this.send('notificationsError', {
					code: 'NOTIFICATIONS_FAILED',
					message: msg,
					reqId: typeof body?.reqId === 'string' ? body.reqId : null,
				});
			}
		}
	}

	@bindThis
	public dispose() {
		this.subscriber.off(`mainStream:${this.user?.id}`, this.onEvent);
	}
}

@Injectable()
export class MainChannelService implements MiChannelService<true> {
	public readonly shouldShare = MainChannel.shouldShare;
	public readonly requireCredential = MainChannel.requireCredential;
	public readonly kind = MainChannel.kind;

	constructor(
		private noteEntityService: NoteEntityService,
		private readonly cacheService: CacheService,
		private readonly notificationService: NotificationService,
		private readonly notificationEntityService: NotificationEntityService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): MainChannel {
		return new MainChannel(
			id,
			connection,
			this.noteEntityService,
			this.cacheService,
			this.notificationService,
			this.notificationEntityService,
		);
	}
}
