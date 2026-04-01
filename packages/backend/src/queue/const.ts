/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MetricsTime } from 'bullmq';
import type { Config } from '@/config.js';
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
} from '@/queue/types.js';
import type * as Bull from 'bullmq';

export const QUEUE_TYPES = [
	'deliver',
	'inbox',
	'system',
	'endedPollNotification',
	'db',
	'relationship',
	'objectStorage',
	'userWebhookDeliver',
	'systemWebhookDeliver',
	'scheduleNotePost',
	'backgroundTask',
] as const;

export type QueueType = typeof QUEUE_TYPES[number];

export const QUEUE = {
	DELIVER: 'deliver',
	INBOX: 'inbox',
	SYSTEM: 'system',
	ENDED_POLL_NOTIFICATION: 'endedPollNotification',
	DB: 'db',
	RELATIONSHIP: 'relationship',
	OBJECT_STORAGE: 'objectStorage',
	USER_WEBHOOK_DELIVER: 'userWebhookDeliver',
	SYSTEM_WEBHOOK_DELIVER: 'systemWebhookDeliver',
	SCHEDULE_NOTE_POST: 'scheduleNotePost',
	BACKGROUND_TASK: 'backgroundTask',
} satisfies Record<string, QueueType>;

export type QueueData = {
	deliver: DeliverJobData;
	inbox: InboxJobData;
	system: { type: string };
	endedPollNotification: EndedPollNotificationJobData;
	db: DbJobType;
	relationship: RelationshipJobData;
	objectStorage: ObjectStorageJobData;
	userWebhookDeliver: UserWebhookDeliverJobData;
	systemWebhookDeliver: SystemWebhookDeliverJobData;
	scheduleNotePost: ScheduleNotePostJobData;
	backgroundTask: BackgroundTaskJobData;
};

// Keep in sync with all the YML configs!
export const QueueDefaults: Partial<Config> = {
	deliverJobConcurrency: 128,
	deliverJobMaxAttempts: 12,

	inboxJobConcurrency: 16,
	inboxJobMaxAttempts: 8,

	relationshipJobConcurrency: 16,
	relationshipJobPerSec: 64,

	objectStorageJobConcurrency: 16,
	objectStorageJobMaxAttempts: 4,

	userWebhookDeliverJobConcurrency: 64,
	userWebhookDeliverJobMaxAttempts: 4,

	systemWebhookDeliverJobConcurrency: 16,
	systemWebhookDeliverJobMaxAttempts: 4,

	backgroundTaskJobConcurrency: 32,
	backgroundTaskJobMaxAttempts: 8,
};

export const DefaultMaxAttempts = 1;
export const DefaultJobPerSec = 0;
export const DefaultJobConcurrency = 1;

export type Queues = {
	// <data type, result type, name type>
	[QT in QueueType]: Bull.Queue<QueueData[QT], FIXME, string>;
};

export function baseQueueOptions<QT extends QueueType>(config: Config, queueName: QT) {
	return {
		connection: {
			...config.redisForJobQueue,
			keyPrefix: undefined,
		},
		prefix: config.redisForJobQueue.prefix ? `${config.redisForJobQueue.prefix}:queue:${queueName}` : `queue:${queueName}`,
	} satisfies Bull.QueueOptions;
}

export function baseWorkerOptions<QT extends QueueType>(config: Config, queueName: QT) {
	const jobsPerSec = config[`${queueName}JobPerSec`] ?? QueueDefaults[`${queueName}JobPerSec`] ?? DefaultJobPerSec;
	const concurrency = config[`${queueName}JobConcurrency`] ?? QueueDefaults[`${queueName}JobConcurrency`] ?? DefaultJobConcurrency;

	return {
		...baseQueueOptions(config, queueName),
		metrics: {
			maxDataPoints: MetricsTime.ONE_WEEK,
		},
		concurrency,
		limiter: jobsPerSec < 1 ? undefined : {
			max: jobsPerSec,
			duration: 1000,
		},
		autorun: false,
	} satisfies Bull.WorkerOptions;
}

export function baseJobOptions<QT extends QueueType>(config: Config, queueName: QT) {
	const maxAttempts = config[`${queueName}JobMaxAttempts`] ?? QueueDefaults[`${queueName}JobMaxAttempts`] ?? DefaultMaxAttempts;

	return {
		// https://docs.bullmq.io/guide/retrying-failing-jobs#custom-back-off-strategies
		attempts: maxAttempts,
	} satisfies Bull.JobsOptions;
}
