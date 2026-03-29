/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import * as Bull from 'bullmq';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { baseQueueOptions, QUEUE } from '@/queue/const.js';
import { allSettled } from '@/misc/promise-tracker.js';
import Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import {
	DeliverJobData,
	EndedPollNotificationJobData,
	InboxJobData,
	RelationshipJobData,
	UserWebhookDeliverJobData,
	SystemWebhookDeliverJobData,
	ScheduleNotePostJobData,
	BackgroundTaskJobData,
} from '../queue/types.js';
import type { Provider } from '@nestjs/common';

export type SystemQueue = Bull.Queue<Record<string, unknown>>;
export type EndedPollNotificationQueue = Bull.Queue<EndedPollNotificationJobData>;
export type DeliverQueue = Bull.Queue<DeliverJobData>;
export type InboxQueue = Bull.Queue<InboxJobData>;
export type DbQueue = Bull.Queue;
export type RelationshipQueue = Bull.Queue<RelationshipJobData>;
export type ObjectStorageQueue = Bull.Queue;
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

@Module({
	imports: [
	],
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
	].flat(),
})
export class QueueModule implements OnApplicationShutdown {
	private readonly logger = new Logger('queue');

	constructor(
		@Inject('queue:system') public systemQueue: SystemQueue,
		@Inject('queue:system:events') public systemQueueEvents: Bull.QueueEvents,
		@Inject('queue:endedPollNotification') public endedPollNotificationQueue: EndedPollNotificationQueue,
		@Inject('queue:endedPollNotification:events') public endedPollNotificationQueueEvents: Bull.QueueEvents,
		@Inject('queue:deliver') public deliverQueue: DeliverQueue,
		@Inject('queue:deliver:events') public deliverQueueEvents: Bull.QueueEvents,
		@Inject('queue:inbox') public inboxQueue: InboxQueue,
		@Inject('queue:inbox:events') public inboxQueueEvents: Bull.QueueEvents,
		@Inject('queue:db') public dbQueue: DbQueue,
		@Inject('queue:db:events') public dbQueueEvents: Bull.QueueEvents,
		@Inject('queue:relationship') public relationshipQueue: RelationshipQueue,
		@Inject('queue:relationship:events') public relationshipQueueEvents: Bull.QueueEvents,
		@Inject('queue:objectStorage') public objectStorageQueue: ObjectStorageQueue,
		@Inject('queue:objectStorage:events') public objectStorageQueueEvents: Bull.QueueEvents,
		@Inject('queue:userWebhookDeliver') public userWebhookDeliverQueue: UserWebhookDeliverQueue,
		@Inject('queue:userWebhookDeliver:events') public userWebhookDeliverQueueEvents: Bull.QueueEvents,
		@Inject('queue:systemWebhookDeliver') public systemWebhookDeliverQueue: SystemWebhookDeliverQueue,
		@Inject('queue:systemWebhookDeliver:events') public systemWebhookDeliverQueueEvents: Bull.QueueEvents,
		@Inject('queue:scheduleNotePost') public scheduleNotePostQueue: ScheduleNotePostQueue,
		@Inject('queue:scheduleNotePost:events') public scheduleNotePostQueueEvents: Bull.QueueEvents,
		@Inject('queue:backgroundTask') public readonly backgroundTaskQueue: BackgroundTaskQueue,
		@Inject('queue:backgroundTask:events') public readonly backgroundTaskQueueEvents: Bull.QueueEvents,
	) {}

	public async dispose(): Promise<void> {
		// Wait for all potential queue jobs
		this.logger.info('Finalizing active promises...');
		await allSettled();
		// And then close all queues
		this.logger.info('Closing BullMQ queues...');
		await Promise.allSettled([
			this.systemQueue.close(),
			this.systemQueueEvents.close(),
			this.endedPollNotificationQueue.close(),
			this.endedPollNotificationQueueEvents.close(),
			this.deliverQueue.close(),
			this.deliverQueueEvents.close(),
			this.inboxQueue.close(),
			this.inboxQueueEvents.close(),
			this.dbQueue.close(),
			this.dbQueueEvents.close(),
			this.relationshipQueue.close(),
			this.relationshipQueueEvents.close(),
			this.objectStorageQueue.close(),
			this.objectStorageQueueEvents.close(),
			this.userWebhookDeliverQueue.close(),
			this.userWebhookDeliverQueueEvents.close(),
			this.systemWebhookDeliverQueue.close(),
			this.systemWebhookDeliverQueueEvents.close(),
			this.scheduleNotePostQueue.close(),
			this.scheduleNotePostQueueEvents.close(),
			this.backgroundTaskQueue.close(),
			this.backgroundTaskQueueEvents.close(),
		]).then(res => {
			for (const result of res) {
				if (result.status === 'rejected') {
					this.logger.error(`Error closing queue: ${renderInlineError(result.reason)}`);
				}
			}
		});
		this.logger.info('Queue module disposed.');
	}

	@bindThis
	async onApplicationShutdown(signal: string): Promise<void> {
		await this.dispose();
	}
}
