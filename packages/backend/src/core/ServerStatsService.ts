/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, type OnModuleInit, type OnApplicationShutdown } from '@nestjs/common';
import si from 'systeminformation';
import { InternalEventService } from '@/global/InternalEventService.js';
import { bindThis } from '@/decorators.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/Meta.js';
import type * as Misskey from 'misskey-js';

export const ServerStatsLogSize = 200;

@Injectable()
export class ServerStatsService implements OnApplicationShutdown, OnModuleInit {
	private readonly log: Misskey.entities.ServerStats[] = [];

	public constructor(
		private readonly internalEventService: InternalEventService,
		@Inject(DI.meta)
		private readonly serverSettings: MiMeta,
	) {
	}

	@bindThis
	public getLog(length: number): Misskey.entities.ServerStats[] {
		return this.log.slice(0, length);
	}

	@bindThis
	public async tick(): Promise<void> {
		// SK-2026-057: do not collect/broadcast host metrics when admin disabled them
		if (!this.serverSettings.enableServerMachineStats) {
			return;
		}

		// Create new snapshot
		const stats = await awaitAll({
			cpu: this.getCpu(),
			mem: this.getMem(),
			net: this.getNet(),
			fs: this.getFs(),
		});

		// Emit event (this will immediately sync logs)
		await this.internalEventService.emit('pushServerStats', stats);
	}

	@bindThis
	public async getCpu() {
		const cpuUsage = await si.currentLoad();
		return cpuUsage.currentLoad / 100; // don't round, or we'll lose precision when FE multiplies back up
	}

	@bindThis
	public async getMem() {
		const mem = await si.mem();
		return {
			used: mem.used,
			active: mem.active,
		};
	}

	@bindThis
	public async getNet() {
		const defaultInterface = await si.networkInterfaceDefault();
		const [netStats] = await si.networkStats(defaultInterface);
		return {
			rx: netStats.rx_sec,
			tx: netStats.tx_sec,
		};
	}

	@bindThis
	public async getFs() {
		// Returns null values and/or throw an exception on Windows
		const stats: Partial<si.Systeminformation.DisksIoData> | null = await si.disksIO().catch(() => null);
		return {
			r: stats?.rIO_sec ?? 0,
			w: stats?.wIO_sec ?? 0,
		};
	}

	@bindThis
	public onServerStats(counts: Misskey.entities.ServerStats): void {
		this.log.unshift(counts);

		while (this.log.length > ServerStatsLogSize) {
			this.log.pop();
		}
	}

	@bindThis
	public onModuleInit(): void {
		this.internalEventService.on('pushServerStats', this.onServerStats);
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.internalEventService.off('pushServerStats', this.onServerStats);
	}
}
