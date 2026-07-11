/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Brackets } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { QueueService } from '@/core/QueueService.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { bindThis } from '@/decorators.js';
import type { ChatApprovalsRepository, ChatMessagesRepository, ChatRoomInvitationsRepository, ChatRoomMembershipsRepository, ChatRoomsRepository, MiChatMessage, MiChatRoom, MiChatRoomMembership, MiDriveFile, MiUser, MutingsRepository, UsersRepository } from '@/models/_.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { MiChatRoomInvitation } from '@/models/ChatRoomInvitation.js';
import { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { NotificationService } from '@/core/NotificationService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { TimeService } from '@/global/TimeService.js';
import { CacheService } from '@/core/CacheService.js';
import { isLocalUser } from '@/models/User.js';

const MAX_ROOM_MEMBERS = 200;
const MAX_REACTIONS_PER_MESSAGE = 100;
const isCustomEmojiRegexp = /^:([\w+-]+)(?:@\.)?:$/;

function generateInviteCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
	let out = '';
	for (let i = 0; i < 16; i++) {
		out += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return out;
}

// TODO: ReactionServiceのやつと共通化
function normalizeEmojiString(x: string) {
	const match = emojiRegex.exec(x);
	if (match) {
		// 合字を含む1つの絵文字
		const unicode = match[0];

		// 異体字セレクタ除去
		return unicode.match('\u200d') ? unicode : unicode.replace(/\ufe0f/g, '');
	} else {
		throw new Error('invalid emoji');
	}
}

@Injectable()
export class ChatService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatApprovalsRepository)
		private chatApprovalsRepository: ChatApprovalsRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		private userEntityService: UserEntityService,
		private chatEntityService: ChatEntityService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private apRendererService: ApRendererService,
		private queueService: QueueService,
		private pushNotificationService: PushNotificationService,
		private notificationService: NotificationService,
		private userBlockingService: UserBlockingService,
		private queryService: QueryService,
		private roleService: RoleService,
		private userFollowingService: UserFollowingService,
		private customEmojiService: CustomEmojiService,
		private moderationLogService: ModerationLogService,
		private readonly timeService: TimeService,
		private readonly cacheService: CacheService,
	) {
	}

	@bindThis
	public async getChatAvailability(userId: MiUser['id']): Promise<{ read: boolean; write: boolean; }> {
		const policies = await this.roleService.getUserPolicies(userId);

		switch (policies.chatAvailability) {
			case 'available':
				return {
					read: true,
					write: true,
				};
			case 'readonly':
				return {
					read: true,
					write: false,
				};
			case 'unavailable':
				return {
					read: false,
					write: false,
				};
			default:
				throw new Error('invalid chat availability (unreachable)');
		}
	}

	/** getChatAvailabilityの糖衣。主にAPI呼び出し時に走らせて、権限的に問題ない場合はそのまま続行する */
	@bindThis
	public async checkChatAvailability(userId: MiUser['id'], permission: 'read' | 'write') {
		const policy = await this.getChatAvailability(userId);
		if (policy[permission] === false) {
			throw new Error('ROLE_PERMISSION_DENIED');
		}
	}

	@bindThis
	public async getRoomRole(room: MiChatRoom, userId: MiUser['id']): Promise<'owner' | 'admin' | 'member' | null> {
		if (room.ownerId === userId) return 'owner';
		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
		if (membership == null) return null;
		return membership.role === 'admin' ? 'admin' : 'member';
	}

	@bindThis
	public async canModerateRoom(room: MiChatRoom, userId: MiUser['id']): Promise<boolean> {
		const role = await this.getRoomRole(room, userId);
		if (role === 'owner' || role === 'admin') return true;
		const user = await this.usersRepository.findOneBy({ id: userId });
		if (user && await this.roleService.isModerator(user)) return true;
		return false;
	}

	@bindThis
	public async canPostInRoom(room: MiChatRoom, userId: MiUser['id']): Promise<boolean> {
		if (!(await this.isRoomMember(room, userId))) return false;
		if (!room.isMutedAll) return true;
		const role = await this.getRoomRole(room, userId);
		if (role === 'owner' || role === 'admin') return true;
		const user = await this.usersRepository.findOneBy({ id: userId });
		if (user && await this.roleService.isModerator(user)) return true;
		return false;
	}

	/**
	 * Owner / room admin / instance admin&moderator skip slow-mode rate limit.
	 */
	@bindThis
	public async isRoomRateLimitExempt(room: MiChatRoom, userId: MiUser['id']): Promise<boolean> {
		const role = await this.getRoomRole(room, userId);
		if (role === 'owner' || role === 'admin') return true;
		const user = await this.usersRepository.findOneBy({ id: userId });
		if (user && await this.roleService.isModerator(user)) return true;
		return false;
	}

	/**
	 * Enforce room slow mode. Returns remaining wait seconds if rate-limited, else 0.
	 * 0 messageRateLimitSeconds = unlimited.
	 */
	@bindThis
	public async checkRoomMessageRateLimit(room: MiChatRoom, userId: MiUser['id']): Promise<number> {
		const sec = Math.max(0, Math.floor(Number(room.messageRateLimitSeconds ?? 0)));
		if (sec <= 0) return 0;
		if (await this.isRoomRateLimitExempt(room, userId)) return 0;

		const key = `chatRoomMsgRate:${room.id}:${userId}`;
		const last = await this.redisClient.get(key);
		if (last != null) {
			const elapsedMs = Date.now() - Number(last);
			const needMs = sec * 1000;
			if (elapsedMs < needMs) {
				return Math.ceil((needMs - elapsedMs) / 1000);
			}
		}
		return 0;
	}

	@bindThis
	public async markRoomMessageRateLimit(room: MiChatRoom, userId: MiUser['id']): Promise<void> {
		const sec = Math.max(0, Math.floor(Number(room.messageRateLimitSeconds ?? 0)));
		if (sec <= 0) return;
		if (await this.isRoomRateLimitExempt(room, userId)) return;
		const key = `chatRoomMsgRate:${room.id}:${userId}`;
		await this.redisClient.set(key, String(Date.now()), 'EX', Math.max(sec * 2, sec + 5));
	}

	@bindThis
	public async createMessageToUser(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toUser: MiUser, params: {
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
		replyId?: string | null;
		isE2ee?: boolean;
		ciphertext?: string | null;
	}): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		if (fromUser.id === toUser.id) {
			throw new Error('yourself');
		}

		const approvals = await this.chatApprovalsRepository.createQueryBuilder('approval')
			.where(new Brackets(qb => { // 自分が相手を許可しているか
				qb.where('approval.userId = :fromUserId', { fromUserId: fromUser.id })
					.andWhere('approval.otherId = :toUserId', { toUserId: toUser.id });
			}))
			.orWhere(new Brackets(qb => { // 相手が自分を許可しているか
				qb.where('approval.userId = :toUserId', { toUserId: toUser.id })
					.andWhere('approval.otherId = :fromUserId', { fromUserId: fromUser.id });
			}))
			.take(2)
			.getMany();

		const otherApprovedMe = approvals.some(approval => approval.userId === toUser.id);
		const iApprovedOther = approvals.some(approval => approval.userId === fromUser.id);

		if (!otherApprovedMe) {
			if (toUser.chatScope === 'none') {
				throw new Error('recipient is cannot chat (none)');
			} else if (toUser.chatScope === 'followers') {
				const isFollower = await this.userFollowingService.isFollowing(fromUser.id, toUser.id);
				if (!isFollower) {
					throw new Error('recipient is cannot chat (followers)');
				}
			} else if (toUser.chatScope === 'following') {
				const isFollowing = await this.userFollowingService.isFollowing(toUser.id, fromUser.id);
				if (!isFollowing) {
					throw new Error('recipient is cannot chat (following)');
				}
			} else if (toUser.chatScope === 'mutual') {
				const isMutual = await this.userFollowingService.isMutual(fromUser.id, toUser.id);
				if (!isMutual) {
					throw new Error('recipient is cannot chat (mutual)');
				}
			}
		}

		if (!(await this.getChatAvailability(toUser.id)).write) {
			throw new Error('recipient is cannot chat (policy)');
		}

		const blocked = await this.userBlockingService.checkBlocked(toUser.id, fromUser.id);
		if (blocked) {
			throw new Error('blocked');
		}

		let replyId: string | null = null;
		if (params.replyId) {
			const reply = await this.chatMessagesRepository.findOneBy({ id: params.replyId, toUserId: toUser.id, fromUserId: fromUser.id });
			const replyAlt = reply ?? await this.chatMessagesRepository.findOneBy({
				id: params.replyId,
			});
			if (replyAlt && (
				(replyAlt.toUserId === toUser.id && replyAlt.fromUserId === fromUser.id) ||
				(replyAlt.toUserId === fromUser.id && replyAlt.fromUserId === toUser.id)
			)) {
				replyId = replyAlt.id;
			} else {
				throw new Error('no such reply target');
			}
		}

		const isE2ee = params.isE2ee === true;
		if (isE2ee) {
			if (!params.ciphertext || params.ciphertext.trim().length === 0) {
				throw new Error('ciphertext required for e2ee');
			}
		} else if (!params.text && !params.file) {
			// same as API: need content — leave validation to caller if only file
		}

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toUserId: toUser.id,
			// Never store plaintext for E2EE; ciphertext is opaque to the server
			text: isE2ee ? null : (params.text ? params.text.trim() : null),
			isE2ee,
			ciphertext: isE2ee ? params.ciphertext!.trim() : null,
			fileId: params.file ? params.file.id : null,
			reads: [],
			uri: params.uri ?? null,
			replyId,
		} satisfies Partial<MiChatMessage>;

		const inserted = await this.chatMessagesRepository.insertOne(message);

		// 相手を許可しておく
		if (!iApprovedOther) {
			this.chatApprovalsRepository.insertOne({
				id: this.idService.gen(),
				userId: fromUser.id,
				otherId: toUser.id,
			});
		}

		const packedMessage = await this.chatEntityService.packMessageLiteFor1on1(inserted);

		if (isLocalUser(toUser)) {
			const redisPipeline = this.redisClient.pipeline();
			redisPipeline.set(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`, message.id);
			redisPipeline.sadd(`newChatMessagesExists:${toUser.id}`, `user:${fromUser.id}`);
			redisPipeline.exec();
		}

		if (isLocalUser(fromUser)) {
			// 自分のストリーム
			this.globalEventService.publishChatUserStream(fromUser.id, toUser.id, 'message', packedMessage);
		}

		if (isLocalUser(toUser)) {
			// 相手のストリーム
			this.globalEventService.publishChatUserStream(toUser.id, fromUser.id, 'message', packedMessage);
		}

		// 3秒経っても既読にならなかったらイベント発行
		if (isLocalUser(toUser)) {
			this.timeService.startTimer(async () => {
				const marker = await this.redisClient.get(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`);

				if (marker == null) return; // 既読

				const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted, toUser);
				this.globalEventService.publishMainStream(toUser.id, 'newChatMessage', packedMessageForTo);
				this.pushNotificationService.pushNotification(toUser.id, 'newChatMessage', packedMessageForTo);
			}, 3000);
		}

		return packedMessage;
	}

	@bindThis
	public async createMessageToRoom(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toRoom: MiChatRoom, params: {
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
		replyId?: string | null;
	}): Promise<Packed<'ChatMessageLiteForRoom'>> {
		const memberships = (await this.chatRoomMembershipsRepository.findBy({ roomId: toRoom.id })).map(m => ({
			userId: m.userId,
			isMuted: m.isMuted,
		})).concat({ // ownerはmembershipレコードを作らないため
			userId: toRoom.ownerId,
			isMuted: false,
		});

		if (!memberships.some(member => member.userId === fromUser.id)) {
			throw new Error('you are not a member of the room');
		}

		if (!(await this.canPostInRoom(toRoom, fromUser.id))) {
			throw new Error('room is muted for all');
		}

		const rateWait = await this.checkRoomMessageRateLimit(toRoom, fromUser.id);
		if (rateWait > 0) {
			const err = new Error(`rate limited: wait ${rateWait}s`) as Error & { code?: string; remainingSeconds?: number };
			err.code = 'ROOM_RATE_LIMITED';
			err.remainingSeconds = rateWait;
			throw err;
		}

		let replyId: string | null = null;
		if (params.replyId) {
			const replyTarget = await this.chatMessagesRepository.findOneBy({ id: params.replyId, toRoomId: toRoom.id });
			if (replyTarget == null) {
				throw new Error('no such reply target');
			}
			replyId = replyTarget.id;
		}

		const membershipsOtherThanMe = memberships.filter(member => member.userId !== fromUser.id);

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toRoomId: toRoom.id,
			text: params.text ? params.text.trim() : null,
			fileId: params.file ? params.file.id : null,
			reads: [],
			uri: params.uri ?? null,
			replyId,
		} satisfies Partial<MiChatMessage>;

		const inserted = await this.chatMessagesRepository.insertOne(message);
		await this.markRoomMessageRateLimit(toRoom, fromUser.id);

		const packedMessage = await this.chatEntityService.packMessageLiteForRoom(inserted);

		this.globalEventService.publishChatRoomStream(toRoom.id, 'message', packedMessage);

		const redisPipeline = this.redisClient.pipeline();
		for (const membership of membershipsOtherThanMe) {
			if (membership.isMuted) continue;

			redisPipeline.set(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`, message.id);
			redisPipeline.sadd(`newChatMessagesExists:${membership.userId}`, `room:${toRoom.id}`);
		}
		redisPipeline.exec();

		// 3秒経っても既読にならなかったらイベント発行
		this.timeService.startTimer(async () => {
			const redisPipeline = this.redisClient.pipeline();
			for (const membership of membershipsOtherThanMe) {
				redisPipeline.get(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`);
			}
			const markers = await redisPipeline.exec();
			if (markers == null) throw new Error('redis error');

			if (markers.every(marker => marker[1] == null)) return;

			const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted);

			for (let i = 0; i < membershipsOtherThanMe.length; i++) {
				const marker = markers[i][1];
				if (marker == null) continue;

				this.globalEventService.publishMainStream(membershipsOtherThanMe[i].userId, 'newChatMessage', packedMessageForTo);
				this.pushNotificationService.pushNotification(membershipsOtherThanMe[i].userId, 'newChatMessage', packedMessageForTo);
			}
		}, 3000);

		return packedMessage;
	}

	@bindThis
	public async readUserChatMessage(
		readerId: MiUser['id'],
		senderId: MiUser['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newUserChatMessageExists:${readerId}:${senderId}`);
		redisPipeline.srem(`newChatMessagesExists:${readerId}`, `user:${senderId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public async readRoomChatMessage(
		readerId: MiUser['id'],
		roomId: MiChatRoom['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newRoomChatMessageExists:${readerId}:${roomId}`);
		redisPipeline.srem(`newChatMessagesExists:${readerId}`, `room:${roomId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public findMessageById(messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId });
	}

	@bindThis
	public findMyMessageById(userId: MiUser['id'], messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId, fromUserId: userId });
	}

	@bindThis
	public async hasPermissionToViewRoomTimeline(me: MiUser, room: MiChatRoom) {
		if (await this.isRoomMember(room, me.id)) {
			return true;
		} else {
			const iAmModerator = await this.roleService.isModerator(me);
			if (iAmModerator) {
				return true;
			}

			return false;
		}
	}

	@bindThis
	public async deleteMessage(message: MiChatMessage) {
		await this.chatMessagesRepository.delete(message.id);

		if (message.toUserId) {
			const [fromUser, toUser] = await Promise.all([
				this.cacheService.findUserById(message.fromUserId),
				this.cacheService.findUserById(message.toUserId),
			]);

			if (isLocalUser(fromUser)) this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId, 'deleted', message.id);
			if (isLocalUser(toUser)) this.globalEventService.publishChatUserStream(message.toUserId, message.fromUserId, 'deleted', message.id);

			if (isLocalUser(fromUser) && this.userEntityService.isRemoteUser(toUser)) {
				//const activity = this.apRendererService.addContext(this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${message.id}`), fromUser));
				//this.queueService.deliver(fromUser, activity, toUser.inbox);
			}
		} else if (message.toRoomId) {
			this.globalEventService.publishChatRoomStream(message.toRoomId, 'deleted', message.id);
		}
	}

	@bindThis
	public async userTimeline(meId: MiUser['id'], otherId: MiUser['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatMessagesRepository.createQueryBuilder('message'), sinceId, untilId)
			.andWhere(new Brackets(qb => {
				qb
					.where(new Brackets(qb => {
						qb
							.where('message.fromUserId = :meId')
							.andWhere('message.toUserId = :otherId');
					}))
					.orWhere(new Brackets(qb => {
						qb
							.where('message.fromUserId = :otherId')
							.andWhere('message.toUserId = :meId');
					}));
			}))
			.andWhere('message.isHidden = false')
			.setParameter('meId', meId)
			.setParameter('otherId', otherId);

		const messages = await query.take(limit).getMany();

		return messages;
	}

	@bindThis
	public async roomTimeline(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatMessagesRepository.createQueryBuilder('message'), sinceId, untilId)
			.andWhere('message.toRoomId = :roomId', { roomId })
			.andWhere('message.isHidden = false')
			.leftJoinAndSelect('message.file', 'file')
			.leftJoinAndSelect('message.fromUser', 'fromUser');

		const messages = await query.take(limit).getMany();

		return messages;
	}

	@bindThis
	public async userHistory(meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
		const history: MiChatMessage[] = [];

		const mutingQuery = this.mutingsRepository.createQueryBuilder('muting')
			.select('muting.muteeId')
			.where('muting.muterId = :muterId', { muterId: meId });

		for (let i = 0; i < limit; i++) {
			const found = history.map(m => (m.fromUserId === meId) ? m.toUserId! : m.fromUserId!);

			const query = this.chatMessagesRepository.createQueryBuilder('message')
				.orderBy('message.id', 'DESC')
				.where(new Brackets(qb => {
					qb
						.where('message.fromUserId = :meId', { meId: meId })
						.orWhere('message.toUserId = :meId', { meId: meId });
				}))
				.andWhere('message.toRoomId IS NULL')
				.andWhere(`message.fromUserId NOT IN (${ mutingQuery.getQuery() })`)
				.andWhere(`message.toUserId NOT IN (${ mutingQuery.getQuery() })`);

			if (found.length > 0) {
				query.andWhere('message.fromUserId NOT IN (:...found)', { found: found });
				query.andWhere('message.toUserId NOT IN (:...found)', { found: found });
			}

			query.setParameters(mutingQuery.getParameters());

			const message = await query.getOne();

			if (message) {
				history.push(message);
			} else {
				break;
			}
		}

		return history;
	}

	@bindThis
	public async roomHistory(meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
		// TODO: 一回のクエリにまとめられるかも
		const [memberRoomIds, ownedRoomIds] = await Promise.all([
			this.chatRoomMembershipsRepository.findBy({
				userId: meId,
			}).then(xs => xs.map(x => x.roomId)),
			this.chatRoomsRepository.findBy({
				ownerId: meId,
			}).then(xs => xs.map(x => x.id)),
		]);

		const roomIds = memberRoomIds.concat(ownedRoomIds);

		if (memberRoomIds.length === 0 && ownedRoomIds.length === 0) {
			return [];
		}

		const history: MiChatMessage[] = [];

		for (let i = 0; i < limit; i++) {
			const found = history.map(m => m.toRoomId!);

			const query = this.chatMessagesRepository.createQueryBuilder('message')
				.orderBy('message.id', 'DESC')
				.where('message.toRoomId IN (:...roomIds)', { roomIds });

			if (found.length > 0) {
				query.andWhere('message.toRoomId NOT IN (:...found)', { found: found });
			}

			const message = await query.getOne();

			if (message) {
				history.push(message);
			} else {
				break;
			}
		}

		return history;
	}

	@bindThis
	public async getUserReadStateMap(userId: MiUser['id'], otherIds: MiUser['id'][]) {
		const readStateMap: Record<MiUser['id'], boolean> = {};

		const redisPipeline = this.redisClient.pipeline();

		for (const otherId of otherIds) {
			redisPipeline.get(`newUserChatMessageExists:${userId}:${otherId}`);
		}

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < otherIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[otherIds[i]] = marker == null;
		}

		return readStateMap;
	}

	@bindThis
	public async getRoomReadStateMap(userId: MiUser['id'], roomIds: MiChatRoom['id'][]) {
		const readStateMap: Record<MiChatRoom['id'], boolean> = {};

		const redisPipeline = this.redisClient.pipeline();

		for (const roomId of roomIds) {
			redisPipeline.get(`newRoomChatMessageExists:${userId}:${roomId}`);
		}

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < roomIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[roomIds[i]] = marker == null;
		}

		return readStateMap;
	}

	@bindThis
	public async hasUnreadMessages(userId: MiUser['id']) {
		const card = await this.redisClient.scard(`newChatMessagesExists:${userId}`);
		return card > 0;
	}

	@bindThis
	public async createRoom(owner: MiUser, params: Partial<{
		name: string;
		description: string;
		joinPolicy: MiChatRoom['joinPolicy'];
		announcement: string;
	}>) {
		const room = {
			id: this.idService.gen(),
			name: params.name,
			description: params.description,
			ownerId: owner.id,
			joinPolicy: params.joinPolicy ?? 'invite',
			inviteCode: generateInviteCode(),
			announcement: params.announcement ?? '',
			isMutedAll: false,
		} satisfies Partial<MiChatRoom>;

		const created = await this.chatRoomsRepository.insertOne(room);

		return created;
	}

	@bindThis
	public async hasPermissionToDeleteRoom(me: MiUser, room: MiChatRoom) {
		if (room.ownerId === me.id) {
			return true;
		}

		const iAmModerator = await this.roleService.isModerator(me);
		if (iAmModerator) {
			return true;
		}

		return false;
	}

	/**
	 * Delete all messages in a room (owner / room admin / instance moderator).
	 * Broadcasts `cleared` so clients wipe local timelines.
	 */
	@bindThis
	public async clearRoomMessages(room: MiChatRoom, actor: MiUser): Promise<{ deleted: number }> {
		if (!(await this.canModerateRoom(room, actor.id))) {
			throw new Error('access denied');
		}

		const result = await this.chatMessagesRepository.delete({ toRoomId: room.id });
		const deleted = typeof result.affected === 'number' ? result.affected : 0;

		this.globalEventService.publishChatRoomStream(room.id, 'cleared', {
			roomId: room.id,
		});

		// Clear unread markers for members
		const memberships = await this.chatRoomMembershipsRepository.findBy({ roomId: room.id });
		const redisPipeline = this.redisClient.pipeline();
		for (const membership of memberships) {
			redisPipeline.del(`newRoomChatMessageExists:${membership.userId}:${room.id}`);
			redisPipeline.srem(`newChatMessagesExists:${membership.userId}`, `room:${room.id}`);
		}
		redisPipeline.del(`newRoomChatMessageExists:${room.ownerId}:${room.id}`);
		redisPipeline.srem(`newChatMessagesExists:${room.ownerId}`, `room:${room.id}`);
		await redisPipeline.exec();

		try {
			const actorIsModerator = await this.roleService.isModerator(actor);
			if (actorIsModerator) {
				await this.moderationLogService.log(actor, 'deleteChatRoom', {
					roomId: room.id,
					room: { ...room, _clearedMessages: deleted } as any,
				});
			}
		} catch {
			// non-fatal: room already cleared
		}

		return { deleted };
	}

	@bindThis
	public async deleteRoom(room: MiChatRoom, deleter?: MiUser) {
		await this.chatRoomsRepository.delete(room.id);

		// Erase any message notifications for this room
		const redisPipeline = this.redisClient.pipeline();
		const memberships = await this.chatRoomMembershipsRepository.findBy({ roomId: room.id });
		for (const membership of memberships) {
			redisPipeline.del(`newRoomChatMessageExists:${membership.userId}:${room.id}`);
			redisPipeline.srem(`newChatMessagesExists:${membership.userId}`, `room:${room.id}`);
		}
		await redisPipeline.exec();

		if (deleter) {
			const deleterIsModerator = await this.roleService.isModerator(deleter);

			if (deleterIsModerator) {
				await this.moderationLogService.log(deleter, 'deleteChatRoom', {
					roomId: room.id,
					room: room,
				});
			}
		}
	}

	@bindThis
	public async findMyRoomById(ownerId: MiUser['id'], roomId: MiChatRoom['id']) {
		return await this.chatRoomsRepository.findOneBy({ id: roomId, ownerId: ownerId });
	}

	@bindThis
	public async findRoomById(roomId: MiChatRoom['id']) {
		return await this.chatRoomsRepository.findOne({ where: { id: roomId }, relations: ['owner'] });
	}

	@bindThis
	public async isRoomMember(room: MiChatRoom, userId: MiUser['id']) {
		if (room.ownerId === userId) return true;
		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
		return membership != null;
	}

	@bindThis
	public async createRoomInvitation(inviterId: MiUser['id'], roomId: MiChatRoom['id'], inviteeId: MiUser['id']) {
		if (inviterId === inviteeId) {
			throw new Error('yourself');
		}

		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		if (!(await this.canModerateRoom(room, inviterId))) {
			throw new Error('no permission');
		}

		if (await this.isRoomMember(room, inviteeId)) {
			throw new Error('already member');
		}

		const existingInvitation = await this.chatRoomInvitationsRepository.findOneBy({ roomId, userId: inviteeId });
		if (existingInvitation) {
			throw new Error('already invited');
		}

		const membershipsCount = await this.chatRoomMembershipsRepository.countBy({ roomId });
		if (membershipsCount >= MAX_ROOM_MEMBERS) {
			throw new Error('room is full');
		}

		// TODO: cehck block

		const invitation = {
			id: this.idService.gen(),
			roomId: room.id,
			userId: inviteeId,
		} satisfies Partial<MiChatRoomInvitation>;

		const created = await this.chatRoomInvitationsRepository.insertOne(invitation);

		this.notificationService.createNotification(inviteeId, 'chatRoomInvitationReceived', {
			invitationId: invitation.id,
		}, inviterId);

		return created;
	}

	@bindThis
	public async getSentRoomInvitationsWithPagination(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.roomId = :roomId', { roomId });

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async getOwnedRoomsWithPagination(ownerId: MiUser['id'], limit: number, sinceId?: MiChatRoom['id'] | null, untilId?: MiChatRoom['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomsRepository.createQueryBuilder('room'), sinceId, untilId)
			.andWhere('room.ownerId = :ownerId', { ownerId });

		const rooms = await query.take(limit).getMany();

		return rooms;
	}

	@bindThis
	public async getReceivedRoomInvitationsWithPagination(userId: MiUser['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.userId = :userId', { userId })
			.andWhere('invitation.ignored = FALSE');

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async joinToRoom(userId: MiUser['id'], roomId: MiChatRoom['id'], opts?: { inviteCode?: string | null }) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });

		if (await this.isRoomMember(room, userId)) {
			return;
		}

		if (room.joinPolicy === 'closed') {
			throw new Error('joining closed');
		}

		const membershipsCount = await this.chatRoomMembershipsRepository.countBy({ roomId });
		if (membershipsCount >= MAX_ROOM_MEMBERS) {
			throw new Error('room is full');
		}

		if (room.joinPolicy === 'public') {
			// open join by room id
		} else if (room.joinPolicy === 'link') {
			if (!opts?.inviteCode || opts.inviteCode !== room.inviteCode) {
				throw new Error('invalid invite code');
			}
		} else {
			// invite policy (default): require invitation
			const invitation = await this.chatRoomInvitationsRepository.findOneBy({ roomId, userId });
			if (invitation == null) {
				throw new Error('no invitation');
			}
			await this.chatRoomInvitationsRepository.delete(invitation.id);
		}

		const membership = {
			id: this.idService.gen(),
			roomId: roomId,
			userId: userId,
			role: 'member' as const,
		} satisfies Partial<MiChatRoomMembership>;

		await this.chatRoomMembershipsRepository.insertOne(membership);
	}

	@bindThis
	public async joinByInviteCode(userId: MiUser['id'], inviteCode: string) {
		const room = await this.chatRoomsRepository.findOneBy({ inviteCode });
		if (room == null) {
			throw new Error('no such room');
		}
		if (room.joinPolicy !== 'link' && room.joinPolicy !== 'public') {
			throw new Error('joining closed');
		}
		await this.joinToRoom(userId, room.id, { inviteCode });
		return room;
	}

	@bindThis
	public async setMemberRole(actorId: MiUser['id'], roomId: MiChatRoom['id'], targetUserId: MiUser['id'], role: 'member' | 'admin') {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		if (room.ownerId !== actorId) {
			// only owner can promote/demote admins
			throw new Error('no permission');
		}
		if (targetUserId === room.ownerId) {
			throw new Error('cannot change owner role');
		}
		const membership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId: targetUserId });
		await this.chatRoomMembershipsRepository.update(membership.id, { role });
		return await this.chatRoomMembershipsRepository.findOneByOrFail({ id: membership.id });
	}

	@bindThis
	public async regenerateInviteCode(actorId: MiUser['id'], roomId: MiChatRoom['id']) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		if (!(await this.canModerateRoom(room, actorId))) {
			throw new Error('no permission');
		}
		const inviteCode = generateInviteCode();
		return this.chatRoomsRepository.createQueryBuilder().update()
			.set({ inviteCode })
			.where('id = :id', { id: room.id })
			.returning('*')
			.execute()
			.then((response) => response.raw[0] as MiChatRoom);
	}

	@bindThis
	public async ignoreRoomInvitation(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const invitation = await this.chatRoomInvitationsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomInvitationsRepository.update(invitation.id, { ignored: true });
	}

	@bindThis
	public async leaveRoom(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const membership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomMembershipsRepository.delete(membership.id);
	}

	@bindThis
	public async muteRoom(userId: MiUser['id'], roomId: MiChatRoom['id'], mute: boolean) {
		const membership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomMembershipsRepository.update(membership.id, { isMuted: mute });
	}

	@bindThis
	public async updateRoom(room: MiChatRoom, params: {
		name?: string;
		description?: string;
		joinPolicy?: MiChatRoom['joinPolicy'];
		announcement?: string;
		isMutedAll?: boolean;
		messageRateLimitSeconds?: number;
	}): Promise<MiChatRoom> {
		const set: Partial<MiChatRoom> = {};
		if (params.name !== undefined) set.name = params.name;
		if (params.description !== undefined) set.description = params.description;
		if (params.joinPolicy !== undefined) set.joinPolicy = params.joinPolicy;
		if (params.announcement !== undefined) set.announcement = params.announcement;
		if (params.isMutedAll !== undefined) set.isMutedAll = params.isMutedAll;
		if (params.messageRateLimitSeconds !== undefined) {
			const n = Math.floor(Number(params.messageRateLimitSeconds));
			set.messageRateLimitSeconds = Number.isFinite(n) ? Math.max(0, Math.min(n, 86400)) : 0;
		}

		return this.chatRoomsRepository.createQueryBuilder().update()
			.set(set)
			.where('id = :id', { id: room.id })
			.returning('*')
			.execute()
			.then((response) => {
				return response.raw[0];
			});
	}

	@bindThis
	public async getRoomMembershipsWithPagination(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomMembership['id'] | null, untilId?: MiChatRoomMembership['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomMembershipsRepository.createQueryBuilder('membership'), sinceId, untilId)
			.andWhere('membership.roomId = :roomId', { roomId });

		const memberships = await query.take(limit).getMany();

		return memberships;
	}

	@bindThis
	public async searchMessages(meId: MiUser['id'], query: string, limit: number, params: {
		userId?: MiUser['id'] | null;
		roomId?: MiChatRoom['id'] | null;
		/** Filter by message author (speaker) */
		fromUserId?: MiUser['id'] | null;
	}) {
		const q = this.chatMessagesRepository.createQueryBuilder('message');

		if (params.userId) {
			// 1:1 conversation between me and userId
			q.andWhere(new Brackets(qb => {
				qb
					.where(new Brackets(qb => {
						qb
							.where('message.fromUserId = :meId')
							.andWhere('message.toUserId = :otherId');
					}))
					.orWhere(new Brackets(qb => {
						qb
							.where('message.fromUserId = :otherId')
							.andWhere('message.toUserId = :meId');
					}));
			}))
				.setParameter('meId', meId)
				.setParameter('otherId', params.userId);
		} else if (params.roomId) {
			q.where('message.toRoomId = :roomId', { roomId: params.roomId });
		} else {
			const membershipsQuery = this.chatRoomMembershipsRepository.createQueryBuilder('membership')
				.select('membership.roomId')
				.where('membership.userId = :meId', { meId: meId });

			const ownedRoomsQuery = this.chatRoomsRepository.createQueryBuilder('room')
				.select('room.id')
				.where('room.ownerId = :meId', { meId });

			q.andWhere(new Brackets(qb => {
				qb
					.where('message.fromUserId = :meId')
					.orWhere('message.toUserId = :meId')
					.orWhere(`message.toRoomId IN (${membershipsQuery.getQuery()})`)
					.orWhere(`message.toRoomId IN (${ownedRoomsQuery.getQuery()})`);
			}));

			q.setParameters(membershipsQuery.getParameters());
			q.setParameters(ownedRoomsQuery.getParameters());
		}

		// Optional: only messages from a specific speaker
		if (params.fromUserId) {
			q.andWhere('message.fromUserId = :fromUserId', { fromUserId: params.fromUserId });
		}

		// Text query optional: empty + fromUserId → recent messages from that speaker
		const qText = (query ?? '').trim();
		if (qText.length > 0) {
			q.andWhere('LOWER(message.text) LIKE :q', { q: `%${ sqlLikeEscape(qText.toLowerCase()) }%` });
		} else if (!params.fromUserId) {
			// No text and no speaker filter — nothing useful to return
			return [];
		}

		q.andWhere('message.isHidden = false');

		q.leftJoinAndSelect('message.file', 'file');
		q.leftJoinAndSelect('message.fromUser', 'fromUser');
		q.leftJoinAndSelect('message.toUser', 'toUser');
		q.leftJoinAndSelect('message.toRoom', 'toRoom');
		q.leftJoinAndSelect('toRoom.owner', 'toRoomOwner');

		const messages = await q.orderBy('message.id', 'DESC').take(limit).getMany();

		return messages;
	}

	@bindThis
	public async react(messageId: MiChatMessage['id'], userId: MiUser['id'], reaction_: string) {
		let reaction;

		const custom = reaction_.match(isCustomEmojiRegexp);

		if (custom == null) {
			reaction = normalizeEmojiString(reaction_);
		} else {
			const name = custom[1];
			const emoji = await this.customEmojiService.emojisByKeyCache.fetchMaybe(name);

			if (emoji == null) {
				throw new Error('no such emoji');
			} else {
				reaction = `:${name}:`;
			}
		}

		const message = await this.chatMessagesRepository.findOneByOrFail({ id: messageId });

		if (message.fromUserId === userId) {
			throw new Error('cannot react to own message');
		}

		if (message.toRoomId === null && message.toUserId !== userId) {
			throw new Error('cannot react to others message');
		}

		if (message.reactions.length >= MAX_REACTIONS_PER_MESSAGE) {
			throw new Error('too many reactions');
		}

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneByOrFail({ id: message.toRoomId }) : null;

		if (room) {
			if (!await this.isRoomMember(room, userId)) {
				throw new Error('cannot react to others message');
			}
		}

		await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => `array_append("reactions", '${userId}/${reaction}')`,
			})
			.where('id = :id', { id: message.id })
			.execute();

		if (room) {
			this.globalEventService.publishChatRoomStream(room.id, 'react', {
				messageId: message.id,
				user: await this.userEntityService.pack(userId),
				reaction,
			});
		} else {
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId!, 'react', {
				messageId: message.id,
				reaction,
			});
			this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'react', {
				messageId: message.id,
				reaction,
			});
		}
	}

	@bindThis
	public async unreact(messageId: MiChatMessage['id'], userId: MiUser['id'], reaction_: string) {
		let reaction;

		const custom = reaction_.match(isCustomEmojiRegexp);

		if (custom == null) {
			reaction = normalizeEmojiString(reaction_);
		} else { // 削除されたカスタム絵文字のリアクションを削除したいかもしれないので絵文字の存在チェックはする必要なし
			const name = custom[1];
			reaction = `:${name}:`;
		}

		// NOTE: 自分のリアクションを(あれば)削除するだけなので諸々の権限チェックは必要なし

		const message = await this.chatMessagesRepository.findOneByOrFail({ id: messageId });

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneByOrFail({ id: message.toRoomId }) : null;

		await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => `array_remove("reactions", '${userId}/${reaction}')`,
			})
			.where('id = :id', { id: message.id })
			.execute();

		// TODO: 実際に削除が行われたときのみイベントを発行する

		if (room) {
			this.globalEventService.publishChatRoomStream(room.id, 'unreact', {
				messageId: message.id,
				user: await this.userEntityService.pack(userId),
				reaction,
			});
		} else {
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId!, 'unreact', {
				messageId: message.id,
				reaction,
			});
			this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'unreact', {
				messageId: message.id,
				reaction,
			});
		}
	}

	@bindThis
	public async getMyMemberships(userId: MiUser['id'], limit: number, sinceId?: MiChatRoomMembership['id'] | null, untilId?: MiChatRoomMembership['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomMembershipsRepository.createQueryBuilder('membership'), sinceId, untilId)
			.andWhere('membership.userId = :userId', { userId });

		const memberships = await query.take(limit).getMany();

		return memberships;
	}
}
