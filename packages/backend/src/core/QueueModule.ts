/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	Global,
	Module,
	type Import,
	type Provider,
	type OnApplicationShutdown,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import * as Bull from 'bullmq';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { baseQueueOptions, QUEUE, QUEUE_TYPES } from '@/queue/const.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { allSettled } from '@/misc/promise-tracker.js';
import { promiseTry } from '@/misc/promise-try.js';
import { bindThis } from '@/decorators.js';
import { Logger } from '@/logger.js';
import { GlobalModule } from '@/GlobalModule.js';
import { LoggerService } from '@/core/LoggerService.js';
import type {
	DeliverJobData,
	EndedPollNotificationJobData,
	InboxJobData,
	RelationshipJobData,
	UserWebhookDeliverJobData,
	SystemWebhookDeliverJobData,
	ScheduleNotePostJobData,
	BackgroundTaskJobData,
	ObjectStorageJobData,
	DbJobType,
} from '../queue/types.js';

export type SystemQueue = Bull.Queue<{ type: string }>;
export type EndedPollNotificationQueue = Bull.Queue<EndedPollNotificationJobData>;
export type DeliverQueue = Bull.Queue<DeliverJobData>;
export type InboxQueue = Bull.Queue<InboxJobData>;
export type DbQueue = Bull.Queue<DbJobType>;
export type RelationshipQueue = Bull.Queue<RelationshipJobData>;
export type ObjectStorageQueue = Bull.Queue<ObjectStorageJobData>;
export type UserWebhookDeliverQueue = Bull.Queue<UserWebhookDeliverJobData>;
export type SystemWebhookDeliverQueue = Bull.Queue<SystemWebhookDeliverJobData>;
export type ScheduleNotePostQueue = Bull.Queue<ScheduleNotePostJobData>;
export type BackgroundTaskQueue = Bull.Queue<BackgroundTaskJobData>;

const $system: Provider[] = [{
	provide: 'queue:system',
	useFactory: (config: Config) => new Bull.Queue(QUEUE.SYSTEM, baseQueueOptions(config, QUEUE.SYSTEM)),
	inject: [DI.config],
}, {
	provide: 'queue:system:events',
	useFactory: (config: Config) => new Bull.QueueEvents(QUEUE.SYSTEM, baseQueueOptions(config, QUEUE.SYSTEM)),
	inject: [DI.config],
}, {
	provide: DI.systemQueue,
	useExisting: 'queue:system',
}, {
	provide: DI.systemQueueEvents,
	useExisting: 'queue:system:events',
}];

const $endedPollNotification: Provider[] = [{
	provide: 'queue:endedPollNotification',
	useFactory: (config: Config) => new Bull.Queue(QUEUE.ENDED_POLL_NOTIFICATION, baseQueueOptions(config, QUEUE.ENDED_POLL_NOTIFICATION)),
	inject: [DI.config],
}, {
	provide: 'queue:endedPollNotification:events',
	useFactory: (config: Config) => new Bull.QueueEvents(QUEUE.ENDED_POLL_NOTIFICATION, baseQueueOptions(config, QUEUE.ENDED_POLL_NOTIFICATION)),
	inject: [DI.config],
}, {
	provide: DI.endedPollNotificationQueue,
	useExisting: 'queue:endedPollNotification',
}, {
	provide: DI.endedPollNotificationQueueEvents,
	useExisting: 'queue:endedPollNotification:events',
}];

const $deliver: Provider[] = [{
	provide: 'queue:deliver',
	useFactory: (config: Config) => new Bull.Queue(QUEUE.DELIVER, baseQueueOptions(config, QUEUE.DELIVER)),
	inject: [DI.config],
}, {
	provide: 'queue:deliver:events',
	useFactory: (config: Config) => new Bull.QueueEvents(QUEUE.DELIVER, baseQueueOptions(config, QUEUE.DELIVER)),
	inject: [DI.config],
}, {
	provide: DI.deliverQueue,
	useExisting: 'queue:deliver',
}, {
	provide: DI.deliverQueueEvents,
	useExisting: 'queue:deliver:events',
}];

const $inbox: Provider[] = [{
	provide: 'queue:inbox',
	useFactory: (config: Config) => new Bull.Queue(QUEUE.INBOX, baseQueueOptions(config, QUEUE.INBOX)),
	inject: [DI.config],
}, {
	provide: 'queue:inbox:events',
	useFactory: (config: Config) => new Bull.QueueEvents(QUEUE.INBOX, baseQueueOptions(config, QUEUE.INBOX)),
	inject: [DI.config],
}, {
	provide: DI.inboxQueue,
	useExisting: 'queue:inbox',
}, {
	provide: DI.inboxQueueEvents,
	useExisting: 'queue:inbox:events',
}];

const $db: Provider[] = [{
	provide: 'queue:db',
	useFactory: (config: Config) => new Bull.Queue(QUEUE.DB, baseQueueOptions(config, QUEUE.DB)),
	inject: [DI.config],
}, {
	provide: 'queue:db:events',
	useFactory: (config: Config) => new Bull.QueueEvents(QUEUE.DB, baseQueueOptions(config, QUEUE.DB)),
	inject: [DI.config],
}, {
	provide: DI.dbQueue,
	useExisting: 'queue:db',
}, {
	provide: DI.dbQueueEvents,
	useExisting: 'queue:db:events',
}];

const $relationship: Provider[] = [{
	provide: 'queue:relationship',
	useFactory: (config: Config) => new Bull.Queue(QUEUE.RELATIONSHIP, baseQueueOptions(config, QUEUE.RELATIONSHIP)),
	inject: [DI.config],
}, {
	provide: 'queue:relationship:events',
	useFactory: (config: Config) => new Bull.QueueEvents(QUEUE.RELATIONSHIP, baseQueueOptions(config, QUEUE.RELATIONSHIP)),
	inject: [DI.config],
}, {
	provide: DI.relationshipQueue,
	useExisting: 'queue:relationship',
}, {
	provide: DI.relationshipQueueEvents,
	useExisting: 'queue:relationship:events',
}];

const $objectStorage: Provider[] = [{
	provide: 'queue:objectStorage',
	useFactory: (config: Config) => new Bull.Queue(QUEUE.OBJECT_STORAGE, baseQueueOptions(config, QUEUE.OBJECT_STORAGE)),
	inject: [DI.config],
}, {
	provide: 'queue:objectStorage:events',
	useFactory: (config: Config) => new Bull.QueueEvents(QUEUE.OBJECT_STORAGE, baseQueueOptions(config, QUEUE.OBJECT_STORAGE)),
	inject: [DI.config],
}, {
	provide: DI.objectStorageQueue,
	useExisting: 'queue:objectStorage',
}, {
	provide: DI.objectStorageQueueEvents,
	useExisting: 'queue:objectStorage:events',
}];

const $userWebhookDeliver: Provider[] = [{
	provide: 'queue:userWebhookDeliver',
	useFactory: (config: Config) => new Bull.Queue(QUEUE.USER_WEBHOOK_DELIVER, baseQueueOptions(config, QUEUE.USER_WEBHOOK_DELIVER)),
	inject: [DI.config],
}, {
	provide: 'queue:userWebhookDeliver:events',
	useFactory: (config: Config) => new Bull.QueueEvents(QUEUE.USER_WEBHOOK_DELIVER, baseQueueOptions(config, QUEUE.USER_WEBHOOK_DELIVER)),
	inject: [DI.config],
}, {
	provide: DI.userWebhookDeliverQueue,
	useExisting: 'queue:userWebhookDeliver',
}, {
	provide: DI.userWebhookDeliverQueueEvents,
	useExisting: 'queue:userWebhookDeliver:events',
}];

const $systemWebhookDeliver: Provider[] = [{
	provide: 'queue:systemWebhookDeliver',
	useFactory: (config: Config) => new Bull.Queue(QUEUE.SYSTEM_WEBHOOK_DELIVER, baseQueueOptions(config, QUEUE.SYSTEM_WEBHOOK_DELIVER)),
	inject: [DI.config],
}, {
	provide: 'queue:systemWebhookDeliver:events',
	useFactory: (config: Config) => new Bull.QueueEvents(QUEUE.SYSTEM_WEBHOOK_DELIVER, baseQueueOptions(config, QUEUE.SYSTEM_WEBHOOK_DELIVER)),
	inject: [DI.config],
}, {
	provide: DI.systemWebhookDeliverQueue,
	useExisting: 'queue:systemWebhookDeliver',
}, {
	provide: DI.systemWebhookDeliverQueueEvents,
	useExisting: 'queue:systemWebhookDeliver:events',
}];

const $scheduleNotePost: Provider[] = [{
	provide: 'queue:scheduleNotePost',
	useFactory: (config: Config) => new Bull.Queue(QUEUE.SCHEDULE_NOTE_POST, baseQueueOptions(config, QUEUE.SCHEDULE_NOTE_POST)),
	inject: [DI.config],
}, {
	provide: 'queue:scheduleNotePost:events',
	useFactory: (config: Config) => new Bull.QueueEvents(QUEUE.SCHEDULE_NOTE_POST, baseQueueOptions(config, QUEUE.SCHEDULE_NOTE_POST)),
	inject: [DI.config],
}, {
	provide: DI.scheduleNotePostQueue,
	useExisting: 'queue:scheduleNotePost',
}, {
	provide: DI.scheduleNotePostQueueEvents,
	useExisting: 'queue:scheduleNotePost:events',
}];

const $backgroundTask: Provider[] = [{
	provide: 'queue:backgroundTask',
	useFactory: (config: Config) => new Bull.Queue(QUEUE.BACKGROUND_TASK, baseQueueOptions(config, QUEUE.BACKGROUND_TASK)),
	inject: [DI.config],
}, {
	provide: 'queue:backgroundTask:events',
	useFactory: (config: Config) => new Bull.QueueEvents(QUEUE.BACKGROUND_TASK, baseQueueOptions(config, QUEUE.BACKGROUND_TASK)),
	inject: [DI.config],
}, {
	provide: DI.backgroundTaskQueue,
	useExisting: 'queue:backgroundTask',
}, {
	provide: DI.backgroundTaskQueueEvents,
	useExisting: 'queue:backgroundTask:events',
}];

/** External module dependencies */
const $Imports = [
	GlobalModule,
] as const satisfies Import[];

@Global()
@Module({
	imports: $Imports,
	providers: [
		$system,
		$endedPollNotification,
		$deliver,
		$inbox,
		$db,
		$relationship,
		$objectStorage,
		$userWebhookDeliver,
		$systemWebhookDeliver,
		$scheduleNotePost,
		$backgroundTask,
	].flat(),
	exports: [
		$system,
		$endedPollNotification,
		$deliver,
		$inbox,
		$db,
		$relationship,
		$objectStorage,
		$userWebhookDeliver,
		$systemWebhookDeliver,
		$scheduleNotePost,
		$backgroundTask,
		$Imports,
	].flat(),
})
export class QueueModule implements OnApplicationShutdown {
	private readonly logger: Logger;

	constructor(
		private readonly moduleRef: ModuleRef,

		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('queue');
	}

	@bindThis
	public async onApplicationShutdown(): Promise<void> {
		// Wait for all potential queue jobs
		this.logger.info('Finalizing active promises...');
		await allSettled();

		// And then close all queues in parallel
		this.logger.info('Closing BullMQ queue connections...');
		// TODO move QUEUE_TYPES to this class
		const tasks = QUEUE_TYPES.flatMap(qt => [
			promiseTry(() => this.moduleRef.get<Bull.Queue>(`queue:${qt}`).disconnect())
				.catch(err => this.logger.error(`Error closing queue ${qt}: ${renderInlineError(err)}`)),
			promiseTry(() => this.moduleRef.get<Bull.QueueEvents>(`queue:${qt}:events`).disconnect())
				.catch(err => this.logger.error(`Error closing events for queue ${qt}: ${renderInlineError(err)}`)),
		]);
		await Promise.all(tasks);
		this.logger.info('Queue module disposed.');
	}
}
