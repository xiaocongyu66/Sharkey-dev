/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { isJsonObject } from '@/misc/json-value.js';
import type { JsonValue } from '@/misc/json-value.js';
import { InternalEventService, type InternalEventTypes } from '@/global/InternalEventService.js';
import { QueueStatsService, QueueStatsLogSize } from '@/core/QueueStatsService.js';
import { RoleService } from '@/core/RoleService.js';
import { Channel, type MiChannelService } from '../channel.js';

class QueueStatsChannel extends Channel {
	public readonly chName = 'queueStats';
	public static shouldShare = true as const;
	// SK-2026-058: was unauthenticated (TODO require auth); match admin queue REST
	public static requireCredential = true as const;
	public static kind = 'read:admin:queue';

	constructor(
		private readonly internalEventService: InternalEventService,
		private readonly queueStatsService: QueueStatsService,
		private readonly roleService: RoleService,

		id: string,
		connection: Channel['connection'],
	) {
		super(id, connection);
	}

	@bindThis
	public async init(): Promise<boolean> {
		// Session users may have no token.kind check — enforce moderator here
		if (this.user == null) return false;
		if (!await this.roleService.isModerator(this.user)) return false;

		this.internalEventService.on('pushQueueCounts', this.onQueueCounts);
		return true;
	}

	@bindThis
	private async onQueueCounts(stats: InternalEventTypes['pushQueueCounts']): Promise<void> {
		await this.send('stats', stats);
	}

	@bindThis
	public async onMessage(type: string, body: JsonValue): Promise<void> {
		if (type === 'requestLog') {
			if (this.user == null) return;
			if (!await this.roleService.isModerator(this.user)) return;

			const length = isJsonObject(body) && 'length' in body && typeof(body.length) === 'number'
				? Math.min(Math.max(0, body.length), QueueStatsLogSize)
				: QueueStatsLogSize;

			const log = this.queueStatsService.getLog(length);
			await this.send('statsLog', log);
		}
	}

	@bindThis
	public dispose() {
		this.internalEventService.off('pushQueueCounts', this.onQueueCounts);
	}
}

@Injectable()
export class QueueStatsChannelService implements MiChannelService<true> {
	public readonly shouldShare = QueueStatsChannel.shouldShare;
	public readonly requireCredential = QueueStatsChannel.requireCredential;
	public readonly kind = QueueStatsChannel.kind;

	public constructor(
		private readonly internalEventService: InternalEventService,
		private readonly queueStatsService: QueueStatsService,
		private readonly roleService: RoleService,
	) {}

	@bindThis
	public create(id: string, connection: Channel['connection']): QueueStatsChannel {
		return new QueueStatsChannel(
			this.internalEventService,
			this.queueStatsService,
			this.roleService,
			id,
			connection,
		);
	}
}
