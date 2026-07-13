/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { isJsonObject } from '@/misc/json-value.js';
import type { JsonValue } from '@/misc/json-value.js';
import { InternalEventService, type InternalEventTypes } from '@/global/InternalEventService.js';
import { ServerStatsService, ServerStatsLogSize } from '@/core/ServerStatsService.js';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/Meta.js';
import Channel, { type MiChannelService } from '../channel.js';

class ServerStatsChannel extends Channel {
	public readonly chName = 'serverStats';
	public static shouldShare = true;
	// Public when machine stats enabled (matches REST server-info); gated in init
	public static requireCredential = false as const;

	constructor(
		private readonly internalEventService: InternalEventService,
		private readonly serverStatsService: ServerStatsService,
		private readonly serverSettings: MiMeta,

		id: string,
		connection: Channel['connection'],
	) {
		super(id, connection);
	}

	@bindThis
	public init(): boolean {
		// SK-2026-057: align with REST server-info — no live host metrics when disabled
		if (!this.serverSettings.enableServerMachineStats) {
			return false;
		}
		this.internalEventService.on('pushServerStats', this.onServerStats);
		return true;
	}

	@bindThis
	private async onServerStats(stats: InternalEventTypes['pushServerStats']): Promise<void> {
		if (!this.serverSettings.enableServerMachineStats) return;
		await this.send('stats', stats);
	}

	@bindThis
	public async onMessage(type: string, body: JsonValue): Promise<void> {
		if (type === 'requestLog') {
			if (!this.serverSettings.enableServerMachineStats) return;
			const length = isJsonObject(body) && 'length' in body && typeof(body.length) === 'number'
				? Math.min(Math.max(0, body.length), ServerStatsLogSize)
				: ServerStatsLogSize;

			const log = this.serverStatsService.getLog(length);
			await this.send('statsLog', log);
		}
	}

	@bindThis
	public dispose() {
		this.internalEventService.off('pushServerStats', this.onServerStats);
	}
}

@Injectable()
export class ServerStatsChannelService implements MiChannelService<false> {
	public readonly shouldShare = ServerStatsChannel.shouldShare;
	public readonly requireCredential = ServerStatsChannel.requireCredential;
	public readonly kind = ServerStatsChannel.kind;

	public constructor(
		private readonly internalEventService: InternalEventService,
		private readonly serverStatsService: ServerStatsService,
		@Inject(DI.meta)
		private readonly serverSettings: MiMeta,
	) {}

	@bindThis
	public create(id: string, connection: Channel['connection']): ServerStatsChannel {
		return new ServerStatsChannel(
			this.internalEventService,
			this.serverStatsService,
			this.serverSettings,
			id,
			connection,
		);
	}
}
