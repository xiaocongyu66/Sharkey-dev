/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as WebSocket from 'ws';
import type { MiUser } from '@/models/User.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { Packed } from '@/misc/json-schema.js';
import type { NotificationService } from '@/core/NotificationService.js';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';
import type { MiFollowing, MiUserProfile, NoteFavoritesRepository, NoteReactionsRepository, NotesRepository } from '@/models/_.js';
import type { StreamEventEmitter, GlobalEvents } from '@/core/GlobalEventService.js';
import { ChannelFollowingService } from '@/core/ChannelFollowingService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { isJsonObject } from '@/misc/json-value.js';
import { IdentifiableError, errorCodes } from '@/misc/identifiable-error.js';
import type { JsonObject, JsonValue } from '@/misc/json-value.js';
import { LoggerService } from '@/core/LoggerService.js';
import { TimeService, type TimerHandle } from '@/global/TimeService.js';
import type Logger from '@/logger.js';
import { QueryService } from '@/core/QueryService.js';
import type { ChannelsService } from './ChannelsService.js';
import type { EventEmitter } from 'events';
import type Channel from './channel.js';

const MAX_CHANNELS_PER_CONNECTION = 32;
const MAX_SUBSCRIPTIONS_PER_CONNECTION = 512;

/**
 * Main stream connection
 */
// eslint-disable-next-line import/no-default-export
export default class Connection {
	public user?: MiUser;
	public token?: MiAccessToken;
	private wsConnection?: WebSocket.WebSocket;
	public subscriber?: StreamEventEmitter;
	private channels = new Map<string, Channel>();
	private subscribingNotes = new Map<string, number>();
	public userProfile: MiUserProfile | null = null;
	public followingChannels: Set<string> = new Set();
	public userMutedInstances: Set<string> = new Set();
	public userMutedThreads: Set<string> = new Set();
	public userMutedNotes: Set<string> = new Set();
	public myRecentReactions: Map<string, string> = new Map();
	public myRecentRenotes: Set<string> = new Set();
	public myRecentFavorites: Set<string> = new Set();
	private fetchIntervalId: TimerHandle | null = null;
	private closingConnection = false;
	private logger: Logger;

	constructor(
		private readonly noteReactionsRepository: NoteReactionsRepository,
		private readonly noteFavoritesRepository: NoteFavoritesRepository,
		private readonly queryService: QueryService,
		private channelsService: ChannelsService,
		private notificationService: NotificationService,
		public readonly cacheService: CacheService,
		private channelFollowingService: ChannelFollowingService,
		private notesRepository: NotesRepository,
		private noteEntityService: NoteEntityService,
		private readonly timeService: TimeService,

		loggerService: LoggerService,

		user: MiUser | null | undefined,
		token: MiAccessToken | null | undefined,
		private ip: string,
		private readonly rateLimiter: () => Promise<boolean>,
	) {
		if (user) this.user = user;
		if (token) this.token = token;

		this.logger = loggerService.getLogger('streaming', 'coral');
	}

	@bindThis
	public async fetch() {
		if (this.user == null) return;
		const [myRecentReactions, myRecentFavorites, myRecentRenotes] = await Promise.all([
			this.noteReactionsRepository.find({
				where: { userId: this.user.id },
				select: { noteId: true, reaction: true },
				order: { id: 'desc' },
				take: 100,
			}),
			this.noteFavoritesRepository.find({
				where: { userId: this.user.id },
				select: { noteId: true },
				order: { id: 'desc' },
				take: 100,
			}),
			this.queryService
				.andIsRenote(this.notesRepository.createQueryBuilder('note'), 'note')
				.andWhere({ userId: this.user.id })
				.orderBy({ id: 'DESC' })
				.limit(100)
				.select('note.renoteId', 'renoteId')
				.getRawMany<{ renoteId: string }>(),
		]);
		this.myRecentReactions = new Map(myRecentReactions.map(r => [r.noteId, r.reaction]));
		this.myRecentFavorites = new Set(myRecentFavorites.map(f => f.noteId ));
		this.myRecentRenotes = new Set(myRecentRenotes.map(r => r.renoteId ));
	}

	@bindThis
	public async init() {
		if (this.user != null) {
			// This sets up an automatic sync, so don't call it from the fetch timer!
			await this.setupCacheService();
			await this.fetch();

			if (!this.fetchIntervalId) {
				this.fetchIntervalId = this.timeService.startTimer(this.fetch, 1000 * 10, { repeated: true });
			}
		}
	}

	@bindThis
	private async setupCacheService(): Promise<void> {
		if (this.user == null) return;

		// Fetch initial values
		await Promise.all([
			this.onUserByIdCacheChanged({ keys: [this.user.id] }),
			this.onUserProfileCacheChanged({ keys: [this.user.id] }),
			this.onUserFollowingChannelsCacheChanged({ keys: [this.user.id] }),
			this.onThreadMutingsCacheChanged({ keys: [this.user.id] }),
			this.onNoteMutingsCacheChanged({ keys: [this.user.id] }),
		]);

		// Bind events to automatically sync
		this.connectCacheService();
	}

	@bindThis
	private connectCacheService(): void {
		this.cacheService.userByIdCache.on('changed', this.onUserByIdCacheChanged);
		this.cacheService.userProfileCache.on('changed', this.onUserProfileCacheChanged);
		this.cacheService.userFollowingChannelsCache.on('changed', this.onUserFollowingChannelsCacheChanged);
		this.cacheService.threadMutingsCache.on('changed', this.onThreadMutingsCacheChanged);
		this.cacheService.noteMutingsCache.on('changed', this.onNoteMutingsCacheChanged);
	}

	@bindThis
	private disconnectCacheService(): void {
		this.cacheService.userByIdCache.off('changed', this.onUserByIdCacheChanged);
		this.cacheService.userProfileCache.off('changed', this.onUserProfileCacheChanged);
		this.cacheService.userFollowingChannelsCache.off('changed', this.onUserFollowingChannelsCacheChanged);
		this.cacheService.threadMutingsCache.off('changed', this.onThreadMutingsCacheChanged);
		this.cacheService.noteMutingsCache.off('changed', this.onNoteMutingsCacheChanged);
	}

	@bindThis
	private async onUserByIdCacheChanged(body: { keys: string[] }): Promise<void> {
		if (!this.user) return;
		if (!body.keys.includes(this.user.id)) return;

		// Will be undefined if user has been deleted
		this.user = await this.cacheService.userByIdCache.fetchMaybe(this.user.id);

		// If user is deleted, then clear out the auth token too
		if (this.user == null) {
			this.token = undefined;
		}
	}

	@bindThis
	private async onUserProfileCacheChanged(body: { keys: string[] }): Promise<void> {
		if (!this.user) return;
		if (!body.keys.includes(this.user.id)) return;

		// Will be undefined if user has been deleted
		this.userProfile = await this.cacheService.userProfileCache.fetchMaybe(this.user.id) ?? null;
		this.userMutedInstances = this.userProfile ? new Set(this.userProfile.mutedInstances) : new Set();
	}

	@bindThis
	private async onUserFollowingChannelsCacheChanged(body: { keys: string[] }): Promise<void> {
		if (!this.user) return;
		if (!body.keys.includes(this.user.id)) return;

		this.followingChannels = await this.cacheService.userFollowingChannelsCache.fetch(this.user.id);
	}

	@bindThis
	private async onThreadMutingsCacheChanged(body: { keys: string[] }): Promise<void> {
		if (!this.user) return;
		if (!body.keys.includes(this.user.id)) return;

		this.userMutedThreads = await this.cacheService.threadMutingsCache.fetch(this.user.id);
	}

	@bindThis
	private async onNoteMutingsCacheChanged(body: { keys: string[] }): Promise<void> {
		if (!this.user) return;
		if (!body.keys.includes(this.user.id)) return;

		this.userMutedNotes = await this.cacheService.noteMutingsCache.fetch(this.user.id);
	}

	@bindThis
	public async listen(subscriber: EventEmitter, wsConnection: WebSocket.WebSocket) {
		this.subscriber = subscriber;

		this.wsConnection = wsConnection;
		this.wsConnection.on('message', this.onWsConnectionMessage);
		this.subscriber.on('broadcast', this.onBroadcastMessage);
	}

	/**
	 * クライアントからメッセージ受信時
	 */
	@bindThis
	private async onWsConnectionMessage(data: WebSocket.RawData) {
		let obj: JsonObject;

		if (this.closingConnection) return;

		// The rate limit is very high, so we can safely disconnect any client that hits it.
		if (await this.rateLimiter()) {
			this.logger.warn(`Closing a connection from ${this.ip} (user=${this.user?.id}}) due to an excessive influx of messages.`);

			this.closingConnection = true;
			this.wsConnection?.close(1008, 'Disconnected - too many requests');
			return;
		}

		try {
			obj = JSON.parse(data.toString());
		} catch (e) {
			return;
		}

		const { type, body } = obj;

		switch (type) {
			case 'readNotification': await this.onReadNotification(); break;
			case 'subNote': await this.onSubscribeNote(body); break;
			case 's': await this.onSubscribeNote(body); break; // alias
			case 'sr': await this.onSubscribeNote(body); break; // alias
			case 'unsubNote': this.onUnsubscribeNote(body); break;
			case 'un': this.onUnsubscribeNote(body); break; // alias
			case 'connect': this.onChannelConnectRequested(body); break;
			case 'disconnect': this.onChannelDisconnectRequested(body); break;
			case 'channel': this.onChannelMessageRequested(body); break;
			case 'ch': this.onChannelMessageRequested(body); break; // alias
		}
	}

	@bindThis
	private async onBroadcastMessage(data: GlobalEvents['broadcast']['payload']) {
		await this.sendMessageToWs(data.type, data.body);
	}

	@bindThis
	private async onReadNotification() {
		if (!this.user) return;
		await this.notificationService.readAllNotification(this.user.id);
	}

	/**
	 * 投稿購読要求時
	 */
	@bindThis
	private async onSubscribeNote(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		if (!payload.id || typeof payload.id !== 'string') return;

		// If already connected, then just bump count and skip other checks.
		const oldSubCount = this.subscribingNotes.get(payload.id);
		if (oldSubCount) {
			// Remove and re-insert to fix map ordering.
			const newSubCount = oldSubCount + 1;
			this.subscribingNotes.delete(payload.id);
			this.subscribingNotes.set(payload.id, newSubCount);
			return;
		}

		// Make sure the note exists.
		const note = await this.notesRepository.findOneBy({ id: payload.id });
		if (!note) {
			return;
		}

		// Make sure the user can access the note.
		const { accessible } = await this.noteVisibilityService.checkNoteVisibilityAsync(note, this.user);
		if (!accessible) {
			return;
		}

		// Checks ok; set up the connection.
		this.subscriber?.on(`noteStream:${payload.id}`, this.onNoteStreamMessage);

		// Limit the number of distinct notes that can be subscribed to.
		while (this.subscribingNotes.size > MAX_SUBSCRIPTIONS_PER_CONNECTION) {
			// Map maintains insertion order, so first key is always the oldest
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const oldestKey = this.subscribingNotes.keys().next().value!;
			this.disconnectNoteEvents(oldestKey);
		}
	}

	/**
	 * 投稿購読解除要求時
	 */
	@bindThis
	private onUnsubscribeNote(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		if (!payload.id || typeof payload.id !== 'string') return;

		const oldSubCount = this.subscribingNotes.get(payload.id) ?? 0;
		const newSubCount = oldSubCount - 1;
		if (newSubCount > 0) {
			this.subscribingNotes.set(payload.id, newSubCount);
		} else {
			this.disconnectNoteEvents(payload.id);
		}
	}

	@bindThis
	private async onNoteStreamMessage(data: GlobalEvents['note']['payload']) {
		// If the event involves a third user, then we need to check access.
		// Reply visibility checks can be skipped since we don't actually send the contents - just ID.
		if ('userId' in data.body && typeof(data.body.userId) === 'string') {
			if (this.user) {
				// If client is logged in, then check user blocks.
				const relation = await this.cacheService.getUserRelation(this.user, data.body.userId);
				if (relation.isBlocked) {
					return;
				}
			} else {
				// If client is anonymous (not logged in), then check privacy settings.
				const otherUser = await this.cacheService.findUserById(data.body.userId);
				if (otherUser.requireSigninToViewContents) {
					return;
				}
			}
		}

		// Unsubscribe when note is deleted, but make sure we still send the message!
		if (data.type === 'deleted') {
			this.disconnectNoteEvents(data.body.id);
		}

		// Checks ok; send the message.
		await this.sendMessageToWs('noteUpdated', {
			id: data.body.id,
			type: data.type,
			body: data.body.body,
		});
	}

	/**
	 * Stops tracking the provided note and cleans up all related state.
	 * Does nothing if the note isn't tracked.
	 */
	@bindThis
	private disconnectNoteEvents(noteId: string): void {
		this.subscribingNotes.delete(noteId);
		this.subscriber?.off(`noteStream:${noteId}`, this.onNoteStreamMessage);
	}

	/**
	 * チャンネル接続要求時
	 */
	@bindThis
	private onChannelConnectRequested(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		const { channel, id, params, pong } = payload;
		if (typeof id !== 'string') return;
		if (typeof channel !== 'string') return;
		if (typeof pong !== 'boolean' && typeof pong !== 'undefined' && pong !== null) return;
		if (typeof params !== 'undefined' && !isJsonObject(params)) return;
		this.connectChannel(id, params, channel, pong ?? undefined);
	}

	/**
	 * チャンネル切断要求時
	 */
	@bindThis
	private onChannelDisconnectRequested(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		const { id } = payload;
		if (typeof id !== 'string') return;
		this.disconnectChannel(id);
	}

	/**
	 * クライアントにメッセージ送信
	 */
	@bindThis
	public async sendMessageToWs(type: string, payload: JsonObject): Promise<void> {
		const message = JSON.stringify({
			type: type,
			body: payload,
		});

		await new Promise<void>((resolve, reject) => {
			// This is inside to make TypeScript happy
			if (!this.wsConnection) {
				throw new IdentifiableError(errorCodes.websocketError, 'Cannot send: not connected');
			}

			// Manually wrap the async call
			this.wsConnection.send(message, err => {
				if (err) reject(err);
				else resolve();
			});
		});
	}

	/**
	 * チャンネルに接続
	 */
	@bindThis
	public async connectChannel(id: string, params: JsonObject | undefined, channel: string, pong = false) {
		if (this.channels.has(id)) {
			this.disconnectChannel(id);
		}

		if (this.channels.size >= MAX_CHANNELS_PER_CONNECTION) {
			return;
		}

		const channelService = this.channelsService.getChannelService(channel);

		if (channelService.requireCredential && this.user == null) {
			return;
		}

		if (this.token && ((channelService.kind && !this.token.permission.some(p => p === channelService.kind))
			|| (!channelService.kind && channelService.requireCredential))) {
			return;
		}

		// 共有可能チャンネルに接続しようとしていて、かつそのチャンネルに既に接続していたら無意味なので無視
		if (channelService.shouldShare) {
			for (const c of this.channels.values()) {
				if (c.chName === channel) {
					return;
				}
			}
		}

		const ch: Channel = channelService.create(id, this);
		this.channels.set(ch.id, ch);
		const valid = await ch.init(params ?? {});
		if (valid === false) {
			this.disconnectChannel(id);
			return;
		}

		if (pong) {
			await this.sendMessageToWs('connected', {
				id: id,
			});
		}
	}

	/**
	 * チャンネルから切断
	 * @param id チャンネルコネクションID
	 */
	@bindThis
	public disconnectChannel(id: string) {
		const channel = this.channels.get(id);

		if (channel) {
			if (channel.dispose) channel.dispose();
			this.channels.delete(id);
		}
	}

	/**
	 * チャンネルへメッセージ送信要求時
	 * @param data メッセージ
	 */
	@bindThis
	private onChannelMessageRequested(data: JsonValue | undefined) {
		if (!isJsonObject(data)) return;
		if (typeof data.id !== 'string') return;
		if (typeof data.type !== 'string') return;
		if (typeof data.body === 'undefined') return;

		const channel = this.channels.get(data.id);
		if (channel != null && channel.onMessage != null) {
			channel.onMessage(data.type, data.body);
		}
	}

	/**
	 * ストリームが切れたとき
	 */
	@bindThis
	public dispose() {
		this.disconnectCacheService();
		if (this.fetchIntervalId) this.timeService.stopTimer(this.fetchIntervalId);
		for (const c of this.channels.values()) {
			if (c.dispose) c.dispose();
		}
		for (const k of this.subscribingNotes.keys()) {
			this.subscriber?.off(`noteStream:${k}`, this.onNoteStreamMessage);
		}
		this.subscriber?.off('broadcast', this.onBroadcastMessage);
		this.wsConnection?.off('message', this.onWsConnectionMessage);

		this.fetchIntervalId = null;
		this.channels.clear();
		this.subscribingNotes.clear();
	}
}
