/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MetricsTime } from 'bullmq';
import { parse as parseRedisInfo } from 'redis-info';
import type { IActivity } from '@/core/activitypub/type.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import type { MiSystemWebhook, SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type { Config } from '@/config.js';
import type { Packed } from '@/misc/json-schema.js';
import { baseJobOptions, QUEUE_TYPES } from '@/queue/const.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import { ApRequestCreator } from '@/core/activitypub/ApRequestService.js';
import { TimeService } from '@/global/TimeService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { EnvService } from '@/global/EnvService.js';
import type { Antenna } from '@/server/api/endpoints/i/import-antennas.js';
import type { Logger } from '@/logger.js';
import type { SystemWebhookPayload } from '@/core/SystemWebhookService.js';
import type { MiNote } from '@/models/Note.js';
import type { MinimalNote } from '@/misc/is-renote.js';
import type { UserWebhookPayload } from '@/core/UserWebhookService.js';
import type {
	Queues,
	QueueEvents,
	QueueType,
	QueueData,
	BackgroundTaskJobData,
	DbJobData,
	DeliverJobData,
	RelationshipJobData,
	SystemWebhookDeliverJobData,
	ThinUser,
	UserWebhookDeliverJobData,
} from '@/queue/types.js';
import type httpSignature from '@peertube/http-signature';
import type * as Bull from 'bullmq';

@Injectable()
export class QueueService implements OnModuleInit, OnApplicationBootstrap {
	private readonly logger: Logger;
	private readonly queues = {} as {
		[QT in QueueType]: Queues[QT];
	};
	private readonly queueEvents = {} as {
		[QT in QueueType]: Bull.QueueEvents;
	};

	private systemQueue: Queues['system'];

	constructor(
		protected readonly moduleRef: ModuleRef,

		@Inject(DI.config)
		private config: Config,

		private readonly timeService: TimeService,
		private readonly envService: EnvService,

		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('queue-service');
	}

	@bindThis
	public onModuleInit() {
		// Resolve all queues
		for (const queueType of QUEUE_TYPES) {
			this.queues[queueType] = this.moduleRef.get(`queue:${queueType}`, { strict: false });
			this.queueEvents[queueType] = this.moduleRef.get(`queue:${queueType}:events`, { strict: false });
		}

		this.systemQueue = this.queues['system'];
	}

	@bindThis
	public async onApplicationBootstrap() {
		if (this.envService.env.NODE_ENV === 'test') {
			this.logger.debug('Skipping scheduled job maintenance in TEST');
			return;
		}

		this.logger.info('Upserting scheduled jobs...');
		await this.upsertScheduledJobs();
	}

	@bindThis
	private async upsertScheduledJobs() {
		// Remove any obsolete scheduled jobs
		const removeScheduleJobs = async (jobs: { key: string, id?: string | null, name?: string | null }[]) => {
			for (const job of jobs) {
				// Known schedulers will be updated below.
				if (job.id === 'tickCharts-scheduler' || job.key === 'tickCharts-scheduler') continue;
				if (job.id === 'resyncCharts-scheduler' || job.key === 'resyncCharts-scheduler') continue;
				if (job.id === 'cleanCharts-scheduler' || job.key === 'cleanCharts-scheduler') continue;
				if (job.id === 'aggregateRetention-scheduler' || job.key === 'aggregateRetention-scheduler') continue;
				if (job.id === 'clean-scheduler' || job.key === 'clean-scheduler') continue;
				if (job.id === 'checkExpiredMutings-scheduler' || job.key === 'checkExpiredMutings-scheduler') continue;
				if (job.id === 'bakeBufferedReactions-scheduler' || job.key === 'bakeBufferedReactions-scheduler') continue;
				if (job.id === 'checkModeratorsActivity-scheduler' || job.key === 'checkModeratorsActivity-scheduler') continue;
				if (job.id === 'cleanupApLogs-scheduler' || job.key === 'cleanupApLogs-scheduler') continue;
				if (job.id === 'hibernateUsers-scheduler' || job.key === 'hibernateUsers-scheduler') continue;
				if (job.id === 'tickQueueCounts-scheduler' || job.key === 'tickQueueCounts-scheduler') continue;
				if (job.id === 'tickServerStats-scheduler' || job.key === 'tickServerStats-scheduler') continue;

				if (job.id) {
					this.logger.info(`Removing obsolete job scheduler key=${job.key} id=${job.id} name=${job.name}`);
					await this.systemQueue.removeJobScheduler(job.id);
				} else {
					this.logger.info(`Removing obsolete repeatable job key=${job.key} id=${job.id} name=${job.name}`);
					await this.systemQueue.removeRepeatableByKey(job.key);
				}
			}
		};

		// These have to be separate, since there's some unpredictable overlap between the results!
		await removeScheduleJobs(await this.systemQueue.getJobSchedulers());
		await removeScheduleJobs(await this.systemQueue.getRepeatableJobs());

		await this.systemQueue.upsertJobScheduler(
			'tickCharts-scheduler',
			{ pattern: '0 * * * *' }, // every hour at :00
			{
				name: 'tickCharts',
				data: {
					type: 'tickCharts',
				},
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'resyncCharts-scheduler',
			{ pattern: '20 0 * * *' }, // every day at 00:20 (wait for tickCharts)
			{
				name: 'resyncCharts',
				data: {
					type: 'resyncCharts',
				},
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'cleanCharts-scheduler',
			{ pattern: '40 0 * * *' }, // every day at 00:40 (wait for resyncCharts)
			{
				name: 'cleanCharts',
				data: {
					type: 'cleanCharts',
				},
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'aggregateRetention-scheduler',
			{ pattern: '0 1 * * *' }, // every day at 01:00
			{
				name: 'aggregateRetention',
				data: {
					type: 'aggregateRetention',
				},
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'clean-scheduler',
			{ pattern: '10 1 * * *' }, // every day at 01:10 (wait for aggregateRetention)
			{
				name: 'clean',
				data: {
					type: 'clean',
				},
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'checkExpiredMutings-scheduler',
			{ pattern: '*/5 * * * *' }, // every 5 minutes
			{
				name: 'checkExpiredMutings',
				data: {
					type: 'checkExpiredMutings',
				},
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'bakeBufferedReactions-scheduler',
			{ pattern: '20 1 * * *' }, // every day at 01:40 (wait for clean)
			{
				name: 'bakeBufferedReactions',
				data: {
					type: 'bakeBufferedReactions',
				},
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'checkModeratorsActivity-scheduler',
			// 毎時30分に起動
			{ pattern: '30 * * * *' }, // every hour at :30
			{
				name: 'checkModeratorsActivity',
				data: {
					type: 'checkModeratorsActivity',
				},
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'cleanupApLogs-scheduler',
			{ pattern: '*/10 * * *' }, // every 10 minutes
			{
				name: 'cleanupApLogs',
				data: {
					type: 'cleanupApLogs',
				},
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'hibernateUsers-scheduler',
			{ pattern: '30 1 * * *' }, // every day at 01:30 (avoid bakeBufferedReactions)
			{
				name: 'hibernateUsers',
				data: {
					type: 'hibernateUsers',
				},
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'tickQueueCounts-scheduler',
			{ every: 2 * 1000 }, // every 2 seconds - https://docs.bullmq.io/guide/job-schedulers/repeat-strategies#every-strategy
			{
				name: 'tickQueueCounts',
				data: {
					type: 'tickQueueCounts',
				},
				opts: {
					removeOnComplete: 2,
					removeOnFail: 10,
				},
			},
		);

		await this.systemQueue.upsertJobScheduler(
			'tickServerStats-scheduler',
			{ every: 2 * 1000 }, // every 2 seconds - https://docs.bullmq.io/guide/job-schedulers/repeat-strategies#every-strategy
			{
				name: 'tickServerStats',
				data: {
					type: 'tickServerStats',
				},
				opts: {
					removeOnComplete: 2,
					removeOnFail: 10,
				},
			},
		);

		// Slot '40 1 * * *' is available for future work
		// Slot '50 1 * * *' is available for future work
	}

	@bindThis
	public async add<
		QT extends QueueType,
		Data extends Bull.ExtractDataType<QueueData[QT], QueueData[QT]>,
		Name extends Bull.ExtractNameType<QueueData[QT], string>,
	>(qt: QT, name: Name, data: Data, opts?: Bull.JobsOptions) {
		// Apply default options
		opts = {
			...baseJobOptions(this.config, qt),
			...(opts ?? {}),
		};

		// Locate the queu and add
		return await this.queues[qt].add(name, data, opts);
	}

	@bindThis
	public async addBulk<
		QT extends QueueType,
		Data extends Bull.ExtractDataType<QueueData[QT], QueueData[QT]>,
		Name extends Bull.ExtractNameType<QueueData[QT], string>,
	>(qt: QT, jobs: { name: Name, data: Data, opts?: Bull.JobsOptions }[]) {
		// Apply default options
		jobs = jobs.map(job => ({
			...job,
			opts: {
				...baseJobOptions(this.config, qt),
				...(job.opts ?? {}),
			},
		}));

		// Locate the queu and add
		return await this.queues[qt].addBulk(jobs);
	}

	@bindThis
	public async deliver(user: ThinUser, content: IActivity | null, to: string | null, isSharedInbox: boolean) {
		if (content == null) return null;
		if (to == null) return null;

		const contentBody = JSON.stringify(content);
		const digest = ApRequestCreator.createDigest(contentBody);

		const data: DeliverJobData = {
			user: {
				id: user.id,
			},
			content: contentBody,
			digest,
			to,
			isSharedInbox,
		};

		const label = to.replace('https://', '').replace('/inbox', '');

		return await this.add('deliver', label, data, {
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	/**
	 * ApDeliverManager-DeliverManager.execute()からinboxesを突っ込んでaddBulkしたい
	 * @param user `{ id: string; }` この関数ではThinUserに変換しないので前もって変換してください
	 * @param content IActivity | null
	 * @param inboxes `Map<string, boolean>` / key: to (inbox url), value: isSharedInbox (whether it is sharedInbox)
	 * @returns void
	 */
	@bindThis
	public async deliverMany(user: ThinUser, content: IActivity | null, inboxes: Map<string, boolean>) {
		if (content == null) return null;
		const contentBody = JSON.stringify(content);
		const digest = ApRequestCreator.createDigest(contentBody);

		const opts = {
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		};

		await this.addBulk('deliver', Array.from(inboxes.entries(), d => ({
			name: d[0].replace('https://', '').replace('/inbox', ''),
			data: {
				user: {
					id: user.id,
				},
				content: contentBody,
				digest,
				to: d[0],
				isSharedInbox: d[1],
			} as DeliverJobData,
			opts,
		})));

		return;
	}

	@bindThis
	public inbox(activity: IActivity, signature: httpSignature.IParsedSignature) {
		const data = {
			activity: activity,
			signature,
		};

		const label = (activity.id ?? '').replace('https://', '').replace('/activity', '');

		return this.add('inbox', label, data, {
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: activity.id ? {
				id: activity.id,
			} : undefined,
		});
	}

	@bindThis
	public createDeleteDriveFilesJob(user: ThinUser) {
		return this.add('db', 'deleteDriveFiles', {
			user: { id: user.id },
			dbJobType: 'deleteDriveFiles',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `deleteDriveFiles_${user.id}`,
			},
		});
	}

	@bindThis
	public createExportCustomEmojisJob(user: ThinUser) {
		return this.add('db', 'exportCustomEmojis', {
			user: { id: user.id },
			dbJobType: 'exportCustomEmojis',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `exportCustomEmojis_${user.id}`,
			},
		});
	}

	@bindThis
	public createExportAccountDataJob(user: ThinUser) {
		return this.add('db', 'exportAccountData', {
			user: { id: user.id },
			dbJobType: 'exportAccountData',
		}, {
			removeOnComplete: true,
			removeOnFail: true,
			deduplication: {
				id: `exportAccountData_${user.id}`,
			},
		});
	}

	@bindThis
	public createExportNotesJob(user: ThinUser) {
		return this.add('db', 'exportNotes', {
			user: { id: user.id },
			dbJobType: 'exportNotes',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `exportNotes_${user.id}`,
			},
		});
	}

	@bindThis
	public createExportClipsJob(user: ThinUser) {
		return this.add('db', 'exportClips', {
			user: { id: user.id },
			dbJobType: 'exportClips',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `exportClips_${user.id}`,
			},
		});
	}

	@bindThis
	public createExportFavoritesJob(user: ThinUser) {
		return this.add('db', 'exportFavorites', {
			user: { id: user.id },
			dbJobType: 'exportFavorites',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `exportFavorites_${user.id}`,
			},
		});
	}

	@bindThis
	public createExportFollowingJob(user: ThinUser, excludeMuting = false, excludeInactive = false) {
		return this.add('db', 'exportFollowing', {
			user: { id: user.id },
			excludeMuting,
			excludeInactive,
			dbJobType: 'exportFollowing',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `exportFollowing_${user.id}_${excludeMuting ? '' : 'M'}${excludeInactive ? '' : 'I'}`,
			},
		});
	}

	@bindThis
	public createExportMuteJob(user: ThinUser) {
		return this.add('db', 'exportMuting', {
			user: { id: user.id },
			dbJobType: 'exportMuting',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `exportMuting_${user.id}`,
			},
		});
	}

	@bindThis
	public createExportBlockingJob(user: ThinUser) {
		return this.add('db', 'exportBlocking', {
			user: { id: user.id },
			dbJobType: 'exportBlocking',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `exportBlocking_${user.id}`,
			},
		});
	}

	@bindThis
	public createExportUserListsJob(user: ThinUser) {
		return this.add('db', 'exportUserLists', {
			user: { id: user.id },
			dbJobType: 'exportUserLists',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `exportUserLists_${user.id}`,
			},
		});
	}

	@bindThis
	public createExportAntennasJob(user: ThinUser) {
		return this.add('db', 'exportAntennas', {
			user: { id: user.id },
			dbJobType: 'exportAntennas',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `exportAntennas_${user.id}`,
			},
		});
	}

	@bindThis
	public createImportFollowingJob(user: ThinUser, fileId: MiDriveFile['id'], withReplies?: boolean) {
		return this.add('db', 'importFollowing', {
			user: { id: user.id },
			fileId: fileId,
			withReplies,
			dbJobType: 'importFollowing',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `importFollowing_${user.id}_${fileId}_${withReplies ? 'R' : ''}`,
			},
		});
	}

	@bindThis
	public createImportNotesJob(user: ThinUser, fileId: MiDriveFile['id'], type: string | null | undefined) {
		return this.add('db', 'importNotes', {
			user: { id: user.id },
			fileId: fileId,
			type: type ?? undefined,
			dbJobType: 'importNotes',
		}, {
			removeOnComplete: true,
			removeOnFail: true,
			deduplication: {
				id: `importNotes_${user.id}_${fileId}_${type ?? ''}`,
			},
		});
	}

	@bindThis
	public createImportTweetsToDbJob(user: ThinUser, targets: string[], note: MiNote['id'] | null) {
		const jobs = targets.map(rel => this.generateToDbJobData('importTweetsToDb', { user: { id: user.id }, target: rel, note }));
		return this.addBulk('db', jobs);
	}

	@bindThis
	public createImportMastoToDbJob(user: ThinUser, targets: string[], note: MiNote['id'] | null) {
		const jobs = targets.map(rel => this.generateToDbJobData('importMastoToDb', { user: { id: user.id }, target: rel, note }));
		return this.addBulk('db', jobs);
	}

	@bindThis
	public createImportPleroToDbJob(user: ThinUser, targets: string[], note: MiNote['id'] | null) {
		const jobs = targets.map(rel => this.generateToDbJobData('importPleroToDb', { user: { id: user.id }, target: rel, note }));
		return this.addBulk('db', jobs);
	}

	@bindThis
	public createImportKeyNotesToDbJob(user: ThinUser, targets: string[], note: MiNote['id'] | null) {
		const jobs = targets.map(rel => this.generateToDbJobData('importKeyNotesToDb', { user: { id: user.id }, target: rel, note }));
		return this.addBulk('db', jobs);
	}

	@bindThis
	public createImportIGToDbJob(user: ThinUser, targets: string[]) {
		const jobs = targets.map(rel => this.generateToDbJobData('importIGToDb', { user: { id: user.id }, target: rel }));
		return this.addBulk('db', jobs);
	}

	@bindThis
	public createImportFBToDbJob(user: ThinUser, targets: string[]) {
		const jobs = targets.map(rel => this.generateToDbJobData('importFBToDb', { user: { id: user.id }, target: rel }));
		return this.addBulk('db', jobs);
	}

	@bindThis
	public createImportFollowingToDbJob(user: ThinUser, targets: string[], withReplies?: boolean) {
		const jobs = targets.map(rel => this.generateToDbJobData('importFollowingToDb', { user: { id: user.id }, target: rel, withReplies }));
		return this.addBulk('db', jobs);
	}

	@bindThis
	public createImportMutingJob(user: ThinUser, fileId: MiDriveFile['id']) {
		return this.add('db', 'importMuting', {
			user: { id: user.id },
			fileId: fileId,
			dbJobType: 'importMuting',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `importMuting_${user.id}_${fileId}`,
			},
		});
	}

	@bindThis
	public createImportBlockingJob(user: ThinUser, fileId: MiDriveFile['id']) {
		return this.add('db', 'importBlocking', {
			user: { id: user.id },
			fileId: fileId,
			dbJobType: 'importBlocking',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `importBlocking_${user.id}_${fileId}`,
			},
		});
	}

	@bindThis
	public createImportBlockingToDbJob(user: ThinUser, targets: string[]) {
		const jobs = targets.map(rel => this.generateToDbJobData('importBlockingToDb', { user: { id: user.id }, target: rel }));
		return this.addBulk('db', jobs);
	}

	@bindThis
	private generateToDbJobData<T extends 'importFollowingToDb' | 'importBlockingToDb' | 'importTweetsToDb' | 'importIGToDb' | 'importFBToDb' | 'importMastoToDb' | 'importPleroToDb' | 'importKeyNotesToDb', D extends DbJobData<T>>(name: T, data: Omit<D, 'dbJobType'>): {
		name: string,
		data: D,
		opts: Bull.JobsOptions,
	} {
		return {
			name: `${name}/${data.user.id}/${data.target}`,
			data: {
				...data,
				dbJobType: name,
			} as D,
			opts: {
				removeOnComplete: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 30,
				},
				removeOnFail: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 100,
				},
			},
		};
	}

	@bindThis
	public createImportUserListsJob(user: ThinUser, fileId: MiDriveFile['id']) {
		return this.add('db', 'importUserLists', {
			user: { id: user.id },
			fileId: fileId,
			dbJobType: 'importUserLists',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `importUserLists_${user.id}_${fileId}`,
			},
		});
	}

	@bindThis
	public createImportCustomEmojisJob(user: ThinUser, fileId: MiDriveFile['id']) {
		return this.add('db', 'importCustomEmojis', {
			user: { id: user.id },
			fileId: fileId,
			dbJobType: 'importCustomEmojis',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `importCustomEmojis_${user.id}_${fileId}`,
			},
		});
	}

	@bindThis
	public createImportAntennasJob(user: ThinUser, antenna: Antenna, fileId: MiDriveFile['id']) {
		return this.add('db', 'importAntennas', {
			user: { id: user.id },
			antenna,
			fileId,
			dbJobType: 'importAntennas',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `importAntennas_${user.id}_${fileId}`,
			},
		});
	}

	@bindThis
	public createDeleteAccountJob(user: ThinUser, opts: { soft?: boolean; } = {}) {
		return this.add('db', 'deleteAccount', {
			user: { id: user.id },
			soft: opts.soft,
			dbJobType: 'deleteAccount',
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 30 days
				count: 10_000,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 30 days
				count: 10_000,
			},
			deduplication: {
				id: `deleteAccount_${user.id}`,
			},
		});
	}

	@bindThis
	public createFollowJob(followings: { from: ThinUser, to: ThinUser, requestId?: string, silent?: boolean, withReplies?: boolean }[]) {
		const jobs = followings.map(rel => this.generateRelationshipJobData('follow', rel));
		return this.addBulk('relationship', jobs);
	}

	@bindThis
	public createUnfollowJob(followings: { from: ThinUser, to: ThinUser, requestId?: string }[]) {
		const jobs = followings.map(rel => this.generateRelationshipJobData('unfollow', rel));
		return this.addBulk('relationship', jobs);
	}

	@bindThis
	public createDelayedUnfollowJob(followings: { from: ThinUser, to: ThinUser, requestId?: string }[], delay: number) {
		const jobs = followings.map(rel => this.generateRelationshipJobData('unfollow', rel, { delay }));
		return this.addBulk('relationship', jobs);
	}

	@bindThis
	public createBlockJob(blockings: { from: ThinUser, to: ThinUser, silent?: boolean }[]) {
		const jobs = blockings.map(rel => this.generateRelationshipJobData('block', rel));
		return this.addBulk('relationship', jobs);
	}

	@bindThis
	public createUnblockJob(blockings: { from: ThinUser, to: ThinUser, silent?: boolean }[]) {
		const jobs = blockings.map(rel => this.generateRelationshipJobData('unblock', rel));
		return this.addBulk('relationship', jobs);
	}

	@bindThis
	public createMoveJob(from: ThinUser, to: ThinUser) {
		const job = this.generateRelationshipJobData('move', { from, to });
		return this.add('relationship', job.name, job.data, job.opts);
	}

	@bindThis
	private generateRelationshipJobData(name: 'follow' | 'unfollow' | 'block' | 'unblock' | 'move', data: Omit<RelationshipJobData, 'type'>, opts: Bull.JobsOptions = {}): {
		name: string,
		data: RelationshipJobData,
		opts: Bull.JobsOptions,
	} {
		return {
			name,
			data: {
				type: name,
				from: { id: data.from.id },
				to: { id: data.to.id },
				silent: data.silent,
				requestId: data.requestId,
				withReplies: data.withReplies,
			},
			opts: {
				removeOnComplete: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 30,
				},
				removeOnFail: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 100,
				},
				...opts,
				deduplication: {
					id: `${name}_${data.from.id}_${data.to.id}_${data.requestId ?? ''}_${data.silent ? 'S' : ''}_${data.withReplies ? 'R' : ''}`,
				},
			},
		};
	}

	@bindThis
	public createDeleteObjectStorageFileJob(key: string) {
		return this.add('objectStorage', `deleteFile/${key}`, {
			type: 'deleteFile',
			key: key,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `deleteFile_${key}`,
			},
		});
	}

	@bindThis
	public createCleanRemoteFilesJob(olderThanSeconds: number = 0, keepFilesInUse: boolean = false) {
		return this.add('objectStorage', 'cleanRemoteFiles', {
			type: 'cleanRemoteFiles',
			keepFilesInUse,
			olderThanSeconds,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `cleanRemoteFiles_${olderThanSeconds}_${keepFilesInUse}`,
			},
		});
	}

	@bindThis
	public async createUpdateUserJob(userId: string) {
		return await this.createBackgroundTask({ type: 'update-user', userId }, userId);
	}

	@bindThis
	public async createUpdateFeaturedJob(userId: string) {
		return await this.createBackgroundTask({ type: 'update-featured', userId }, userId);
	}

	@bindThis
	public async createUpdateInstanceJob(host: string) {
		return await this.createBackgroundTask({ type: 'update-instance', host }, host);
	}

	@bindThis
	public async createPostDeliverJob(host: string, result: 'success' | 'temp-fail' | 'perm-fail') {
		return await this.createBackgroundTask({ type: 'post-deliver', host, result });
	}

	@bindThis
	public async createPostInboxJob(host: string) {
		return await this.createBackgroundTask({ type: 'post-inbox', host });
	}

	@bindThis
	public async createPostNoteJob(noteId: string, silent: boolean, type: 'create' | 'edit') {
		const edit = type === 'edit';
		const duplication = `${noteId}_${type}`;

		return await this.createBackgroundTask({ type: 'post-note', noteId, silent, edit }, duplication);
	}

	@bindThis
	public async createUpdateUserTagsJob(userId: string) {
		return await this.createBackgroundTask({ type: 'update-user-tags', userId }, userId);
	}

	@bindThis
	public async createUpdateNoteTagsJob(noteId: string) {
		return await this.createBackgroundTask({ type: 'update-note-tags', noteId }, noteId);
	}

	@bindThis
	public async createDeleteFileJob(fileId: string, isExpired?: boolean, deleterId?: string) {
		return await this.createBackgroundTask({ type: 'delete-file', fileId, isExpired, deleterId }, fileId);
	}

	@bindThis
	public async createUpdateLatestNoteJob(note: MinimalNote) {
		// Compact the note to avoid storing the entire thing in Redis, when all we need is minimal data for categorization
		const minimizedNote: MinimalNote = {
			id: note.id,
			visibility: note.visibility,
			userId: note.userId,
			replyId: note.replyId,
			renoteId: note.renoteId,
			hasPoll: note.hasPoll,
			text: note.text ? '1' : null,
			cw: note.text ? '1' : null,
			fileIds: note.fileIds.length > 0 ? ['1'] : [],
		};

		return await this.createBackgroundTask({ type: 'update-latest-note', note: minimizedNote }, note.id);
	}

	@bindThis
	public async createPostSuspendJob(userId: string) {
		return await this.createBackgroundTask({ type: 'post-suspend', userId }, userId);
	}

	@bindThis
	public async createPostUnsuspendJob(userId: string) {
		return await this.createBackgroundTask({ type: 'post-unsuspend', userId }, userId);
	}

	@bindThis
	public async createDeleteApLogsJob(dataType: 'inbox' | 'object', data: string | string[]) {
		return await this.createBackgroundTask({ type: 'delete-ap-logs', dataType, data });
	}

	protected async createBackgroundTask<T extends BackgroundTaskJobData>(data: T, duplication?: string | { id: string, ttl?: number }): Promise<void> {
		this.add(
			'backgroundTask',
			data.type,
			data,
			{
				// https://docs.bullmq.io/guide/retrying-failing-jobs#custom-back-off-strategies
				attempts: this.config.backgroundTaskJobMaxAttempts ?? 8,
				backoff: {
					// Resolves to QueueProcessorService::HttpRelatedBackoff()
					type: 'custom',
				},

				// https://docs.bullmq.io/guide/jobs/deduplication
				deduplication: typeof(duplication) === 'string'
					? { id: `${data.type}_${duplication}` }
					: duplication,
			},
		);
	};

	/**
	 * @see UserWebhookDeliverJobData
	 * @see UserWebhookDeliverProcessorService
	 */
	@bindThis
	public userWebhookDeliver<T extends WebhookEventTypes>(
		webhook: MiWebhook,
		type: T,
		content: UserWebhookPayload<T>,
		opts?: { attempts?: number },
	) {
		const data: UserWebhookDeliverJobData = {
			type,
			content,
			webhookId: webhook.id,
			userId: webhook.userId,
			to: webhook.url,
			secret: webhook.secret,
			createdAt: this.timeService.now,
			eventId: randomUUID(),
		};

		return this.add('userWebhookDeliver', webhook.id, data, {
			...opts,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	/**
	 * @see SystemWebhookDeliverJobData
	 * @see SystemWebhookDeliverProcessorService
	 */
	@bindThis
	public systemWebhookDeliver<T extends SystemWebhookEventType>(
		webhook: MiSystemWebhook,
		type: T,
		content: SystemWebhookPayload<T>,
		opts?: { attempts?: number },
	) {
		const data: SystemWebhookDeliverJobData = {
			type,
			content,
			webhookId: webhook.id,
			to: webhook.url,
			secret: webhook.secret,
			createdAt: this.timeService.now,
			eventId: randomUUID(),
		};

		return this.add('systemWebhookDeliver', webhook.id, data, {
			...opts,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	public getQueue<QT extends QueueType>(type: QT): Queues[QT] {
		return this.queues[type];
	}

	@bindThis
	public getQueueEvents(type: QueueType): Bull.QueueEvents {
		return this.queueEvents[type];
	}

	@bindThis
	public async queueClear(queueType: QueueType, state: '*' | 'completed' | 'wait' | 'active' | 'paused' | 'prioritized' | 'delayed' | 'failed') {
		const queue = this.getQueue(queueType);

		if (state === '*') {
			await Promise.all([
				queue.clean(0, 0, 'completed'),
				queue.clean(0, 0, 'wait'),
				queue.clean(0, 0, 'active'),
				queue.clean(0, 0, 'paused'),
				queue.clean(0, 0, 'prioritized'),
				queue.clean(0, 0, 'delayed'),
				queue.clean(0, 0, 'failed'),
			]);
		} else {
			await queue.clean(0, 0, state);
		}
	}

	@bindThis
	public async queuePromoteJobs(queueType: QueueType) {
		const queue = this.getQueue(queueType);
		await queue.promoteJobs();
	}

	@bindThis
	public async queueRetryJob(queueType: QueueType, jobId: string) {
		const queue = this.getQueue(queueType);
		const job: Bull.Job | undefined = await queue.getJob(jobId);
		if (job) {
			if (job.finishedOn != null) {
				await job.retry();
			} else {
				await job.promote();
			}
		}
	}

	@bindThis
	public async queueRemoveJob(queueType: QueueType, jobId: string) {
		const queue = this.getQueue(queueType);
		const job: Bull.Job | undefined = await queue.getJob(jobId);
		if (job) {
			await job.remove();
		}
	}

	@bindThis
	private packJobData(job: Bull.Job) {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		const stacktrace = job.stacktrace ? job.stacktrace.filter(Boolean) : [];
		stacktrace.reverse();

		return {
			id: job.id,
			name: job.name,
			data: job.data,
			opts: job.opts,
			timestamp: job.timestamp,
			processedOn: job.processedOn,
			processedBy: job.processedBy,
			finishedOn: job.finishedOn,
			progress: job.progress,
			attempts: job.attemptsMade,
			delay: job.delay,
			failedReason: job.failedReason,
			stacktrace: stacktrace,
			returnValue: job.returnvalue,
			isFailed: !!job.failedReason || (Array.isArray(stacktrace) && stacktrace.length > 0),
		};
	}

	@bindThis
	public async queueGetJob(queueType: QueueType, jobId: string) {
		const queue = this.getQueue(queueType);
		const job: Bull.Job | undefined = await queue.getJob(jobId);
		if (job) {
			return this.packJobData(job);
		} else {
			throw new Error(`Job not found: ${jobId}`);
		}
	}

	@bindThis
	public async queueGetJobs(queueType: QueueType, jobTypes: Bull.JobType[], search?: string) {
		const RETURN_LIMIT = 100;
		const queue = this.getQueue(queueType);
		let jobs: (Bull.Job | null)[];

		if (search) {
			jobs = await queue.getJobs(jobTypes, 0, 1000);

			jobs = jobs.filter(job => {
				const jobString = JSON.stringify(job).toLowerCase();
				return search.toLowerCase().split(' ').every(term => {
					return jobString.includes(term);
				});
			});

			jobs = jobs.slice(0, RETURN_LIMIT);
		} else {
			jobs = await queue.getJobs(jobTypes, 0, RETURN_LIMIT);
		}

		return jobs
			.filter(job => job != null) // not sure how this happens, but it does
			.map(job => this.packJobData(job));
	}

	@bindThis
	public async queueGetQueues(): Promise<Packed<'QueueStats'>> {
		const queues = QUEUE_TYPES.reduce((qs, qt) => {
			qs[qt] = this.queueGetQueue(qt);
			return qs;
		}, {} as Record<QueueType, Promise<Packed<'QueueStat'>>>);
		return awaitAll(queues);
	}

	@bindThis
	public async queueGetQueue(queueType: QueueType): Promise<Packed<'QueueStat'>> {
		const queue = this.getQueue(queueType);
		const counts = await queue.getJobCounts();
		const isPaused = await queue.isPaused();
		const metrics_completed = await queue.getMetrics('completed', 0, MetricsTime.ONE_WEEK);
		const metrics_failed = await queue.getMetrics('failed', 0, MetricsTime.ONE_WEEK);
		const db = parseRedisInfo(await (await queue.client).info());

		return {
			name: queueType,
			qualifiedName: queue.qualifiedName,
			counts: counts,
			isPaused,
			metrics: {
				completed: metrics_completed,
				failed: metrics_failed,
			},
			db: {
				version: db.redis_version,
				mode: db.redis_mode,
				runId: db.run_id,
				processId: db.process_id,
				port: parseInt(db.tcp_port),
				os: db.os,
				uptime: parseInt(db.uptime_in_seconds),
				memory: {
					total: parseInt(db.total_system_memory) || parseInt(db.maxmemory),
					used: parseInt(db.used_memory),
					fragmentationRatio: parseInt(db.mem_fragmentation_ratio),
					peak: parseInt(db.used_memory_peak),
				},
				clients: {
					connected: parseInt(db.connected_clients),
					blocked: parseInt(db.blocked_clients),
				},
			},
		};
	}

	@bindThis
	public async queueGetCounts(): Promise<Packed<'QueueCounts'>> {
		const queues = QUEUE_TYPES.reduce((qs, qt) => {
			qs[qt] = this.queueGetCount(qt);
			return qs;
		}, {} as Record<QueueType, Promise<Packed<'QueueCount'>>>);
		return awaitAll(queues);
	}

	@bindThis
	public async queueGetCount(queueType: QueueType): Promise<Packed<'QueueCount'>> {
		const queue = this.getQueue(queueType);
		const counts = await queue.getJobCounts() as Partial<Record<string, number>>;
		return {
			waiting: counts.waiting ?? 0,
			active: counts.active ?? 0,
			completed: counts.completed ?? 0,
			failed: counts.failed ?? 0,
			delayed: counts.delayed ?? 0,
		};
	}
}
