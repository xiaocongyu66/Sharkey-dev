/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiUser, ChatMessagesRepository, MiChatMessage, ChatRoomsRepository, MiChatRoom, MiChatRoomInvitation, ChatRoomInvitationsRepository, MiChatRoomMembership, ChatRoomMembershipsRepository } from '@/models/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import type { } from '@/models/Blocking.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from './UserEntityService.js';
import { DriveFileEntityService } from './DriveFileEntityService.js';
import { In } from 'typeorm';

@Injectable()
export class ChatEntityService {
	constructor(
		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async packMessageDetailed(
		src: MiChatMessage['id'] | MiChatMessage,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedFiles?: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers?: Map<MiChatMessage['id'], Packed<'UserLite'>>;
				packedRooms?: Map<MiChatMessage['toRoomId'], Packed<'ChatRoom'> | null>;
			};
		},
	): Promise<Packed<'ChatMessage'>> {
		const packedUsers = options?._hint_?.packedUsers;
		const packedFiles = options?._hint_?.packedFiles;
		const packedRooms = options?._hint_?.packedRooms;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		const reactions: { user: Packed<'UserLite'>; reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				user: packedUsers?.get(userId) ?? await this.userEntityService.pack(userId),
				reaction,
			});
		}

		const reply = message.replyId
			? (message.reply ?? await this.chatMessagesRepository.findOneBy({ id: message.replyId }))
			: null;

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.isE2ee ? null : message.text,
			isE2ee: message.isE2ee === true,
			ciphertext: message.isE2ee ? (message.ciphertext ?? null) : null,
			fromUserId: message.fromUserId,
			fromUser: packedUsers?.get(message.fromUserId) ?? await this.userEntityService.pack(message.fromUser ?? message.fromUserId, me),
			toUserId: message.toUserId,
			toUser: message.toUserId ? (packedUsers?.get(message.toUserId) ?? await this.userEntityService.pack(message.toUser ?? message.toUserId, me)) : undefined,
			toRoomId: message.toRoomId,
			toRoom: message.toRoomId ? (packedRooms?.get(message.toRoomId) ?? await this.packRoom(message.toRoom ?? message.toRoomId, me)) : undefined,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? await this.driveFileEntityService.pack(message.file ?? message.fileId)) : null,
			reactions,
			replyId: message.replyId,
			reply: reply ? await this.packReplyPreview(reply, packedUsers) : null,
		};
	}

	@bindThis
	private async packReplyPreview(
		reply: MiChatMessage,
		packedUsers?: Map<MiUser['id'], Packed<'UserLite'>>,
	) {
		const fromUser = packedUsers?.get(reply.fromUserId)
			?? await this.userEntityService.pack(reply.fromUser ?? reply.fromUserId);
		let file: Packed<'DriveFile'> | null = null;
		if (reply.fileId) {
			try {
				file = await this.driveFileEntityService.pack(reply.file ?? reply.fileId);
			} catch {
				file = null;
			}
		}
		return {
			id: reply.id,
			text: reply.isE2ee ? null : reply.text,
			isE2ee: reply.isE2ee === true,
			fromUserId: reply.fromUserId,
			fromUser,
			fromUsername: fromUser.username,
			fromName: fromUser.name,
			fileId: reply.fileId ?? null,
			file,
		};
	}

	@bindThis
	public async packMessagesDetailed(
		messages: MiChatMessage[],
		me: { id: MiUser['id'] },
	) {
		if (messages.length === 0) return [];

		const excludeMe = (x: MiUser | string) => {
			if (typeof x === 'string') {
				return x !== me.id;
			} else {
				return x.id !== me.id;
			}
		};

		const users = [
			...messages.map((m) => m.fromUser ?? m.fromUserId).filter(excludeMe),
			...messages.map((m) => m.toUser ?? m.toUserId).filter(x => x != null).filter(excludeMe),
		];

		const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]));

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		// reply authors for quote previews
		const replyIds = messages.map(m => m.replyId).filter((x): x is string => x != null);
		const replyMessages = replyIds.length > 0
			? await this.chatMessagesRepository.findBy({ id: In(replyIds) })
			: [];
		for (const rm of replyMessages) {
			if (!users.some(x => typeof x === 'string' ? x === rm.fromUserId : x.id === rm.fromUserId) && rm.fromUserId !== me.id) {
				users.push(rm.fromUserId);
			}
		}

		const [packedUsers, packedFiles, packedRooms] = await Promise.all([
			this.userEntityService.packMany(users, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
			this.packRooms(messages.map(m => m.toRoom ?? m.toRoomId).filter(x => x != null), me)
				.then(rooms => new Map(rooms.map(r => [r.id, r]))),
		]);

		return await Promise.all(messages.map(message => this.packMessageDetailed(message, me, { _hint_: { packedUsers, packedFiles, packedRooms } })));
	}

	@bindThis
	public async packMessageLiteFor1on1(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
			_hint_?: {
				packedFiles: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
			};
		},
	): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		const packedFiles = options?._hint_?.packedFiles;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		const reactions: { reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				reaction,
			});
		}

		const reply = message.replyId
			? (message.reply ?? await this.chatMessagesRepository.findOneBy({ id: message.replyId }))
			: null;

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.isE2ee ? null : message.text,
			isE2ee: message.isE2ee === true,
			ciphertext: message.isE2ee ? (message.ciphertext ?? null) : null,
			fromUserId: message.fromUserId,
			toUserId: message.toUserId!,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? await this.driveFileEntityService.pack(message.file ?? message.fileId)) : null,
			reactions,
			replyId: message.replyId,
			reply: reply ? await this.packReplyPreview(reply) : null,
		};
	}

	@bindThis
	public async packMessagesLiteFor1on1(
		messages: MiChatMessage[],
	) {
		if (messages.length === 0) return [];

		const [packedFiles] = await Promise.all([
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
		]);

		return await Promise.all(messages.map(message => this.packMessageLiteFor1on1(message, { _hint_: { packedFiles } })));
	}

	@bindThis
	public async packMessageLiteForRoom(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
			_hint_?: {
				packedFiles: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatMessageLiteForRoom'>> {
		const packedFiles = options?._hint_?.packedFiles;
		const packedUsers = options?._hint_?.packedUsers;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		const reactions: { user: Packed<'UserLite'>; reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				user: packedUsers?.get(userId) ?? await this.userEntityService.pack(userId),
				reaction,
			});
		}

		const reply = message.replyId
			? (message.reply ?? await this.chatMessagesRepository.findOneBy({ id: message.replyId }))
			: null;

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.isE2ee ? null : message.text,
			isE2ee: message.isE2ee === true,
			ciphertext: message.isE2ee ? (message.ciphertext ?? null) : null,
			fromUserId: message.fromUserId,
			fromUser: packedUsers?.get(message.fromUserId) ?? await this.userEntityService.pack(message.fromUser ?? message.fromUserId),
			toRoomId: message.toRoomId!,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? await this.driveFileEntityService.pack(message.file ?? message.fileId)) : null,
			reactions,
			replyId: message.replyId,
			reply: reply ? await this.packReplyPreview(reply, packedUsers) : null,
		};
	}

	@bindThis
	public async packMessagesLiteForRoom(
		messages: MiChatMessage[],
	) {
		if (messages.length === 0) return [];

		const users = messages.map(x => x.fromUser ?? x.fromUserId);
		const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]));

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		const replyIds = messages.map(m => m.replyId).filter((x): x is string => x != null);
		const replyMessages = replyIds.length > 0
			? await this.chatMessagesRepository.findBy({ id: In(replyIds) })
			: [];
		for (const rm of replyMessages) {
			if (!users.some(x => typeof x === 'string' ? x === rm.fromUserId : x.id === rm.fromUserId)) {
				users.push(rm.fromUserId);
			}
		}

		const [packedUsers, packedFiles] = await Promise.all([
			this.userEntityService.packMany(users)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
		]);

		return await Promise.all(messages.map(message => this.packMessageLiteForRoom(message, { _hint_: { packedFiles, packedUsers } })));
	}

	@bindThis
	public async packRoom(
		src: MiChatRoom['id'] | MiChatRoom,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedOwners: Map<MiChatRoom['id'], Packed<'UserLite'>>;
				memberships?: Map<MiChatRoom['id'], MiChatRoomMembership | null | undefined>;
			};
		},
	): Promise<Packed<'ChatRoom'>> {
		const room = typeof src === 'object' ? src : await this.chatRoomsRepository.findOneByOrFail({ id: src });

		const membership = me && me.id !== room.ownerId ? (options?._hint_?.memberships?.get(room.id) ?? await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: me.id })) : null;

		let myRole: 'owner' | 'admin' | 'member' | null = null;
		if (me) {
			if (me.id === room.ownerId) {
				myRole = 'owner';
			} else if (membership) {
				myRole = membership.role === 'admin' ? 'admin' : 'member';
			}
		}

		const canSeeInviteCode = myRole === 'owner' || myRole === 'admin';
		const isMember = myRole != null;
		const joinPolicy = room.joinPolicy ?? 'invite';
		// non-members may join public rooms by id; link rooms need code (handled client-side)
		const canJoin = !isMember && (joinPolicy === 'public' || joinPolicy === 'link');

		return {
			id: room.id,
			createdAt: this.idService.parse(room.id).date.toISOString(),
			name: room.name,
			description: room.description,
			ownerId: room.ownerId,
			owner: options?._hint_?.packedOwners.get(room.ownerId) ?? await this.userEntityService.pack(room.owner ?? room.ownerId, me),
			joinPolicy,
			inviteCode: canSeeInviteCode ? (room.inviteCode ?? null) : null,
			announcement: room.announcement ?? '',
			isMutedAll: room.isMutedAll ?? false,
			messageRateLimitSeconds: Math.max(0, room.messageRateLimitSeconds ?? 0),
			myRole,
			isMember,
			canJoin,
			isMuted: membership != null ? membership.isMuted : false,
		};
	}

	@bindThis
	public async packRooms(
		rooms: (MiChatRoom | MiChatRoom['id'])[],
		me: { id: MiUser['id'] },
	) {
		if (rooms.length === 0) return [];

		const _rooms = rooms.filter((room): room is MiChatRoom => typeof room !== 'string');
		if (_rooms.length !== rooms.length) {
			_rooms.push(
				...await this.chatRoomsRepository.find({
					where: {
						id: In(rooms.filter((room): room is string => typeof room === 'string')),
					},
					relations: ['owner'],
				}),
			);
		}

		const owners = _rooms.map(x => x.owner ?? x.ownerId);

		const [packedOwners, memberships] = await Promise.all([
			this.userEntityService.packMany(owners, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.chatRoomMembershipsRepository.find({
				where: {
					roomId: In(_rooms.map(x => x.id)),
					userId: me.id,
				},
			}).then(memberships => new Map(_rooms.map(r => [r.id, memberships.find(m => m.roomId === r.id)]))),
		]);

		return await Promise.all(_rooms.map(room => this.packRoom(room, me, { _hint_: { packedOwners, memberships } })));
	}

	@bindThis
	public async packRoomInvitation(
		src: MiChatRoomInvitation['id'] | MiChatRoomInvitation,
		me: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedRooms: Map<MiChatRoomInvitation['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiChatRoomInvitation['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomInvitation'>> {
		const invitation = typeof src === 'object' ? src : await this.chatRoomInvitationsRepository.findOneByOrFail({ id: src });

		return {
			id: invitation.id,
			createdAt: this.idService.parse(invitation.id).date.toISOString(),
			roomId: invitation.roomId,
			room: options?._hint_?.packedRooms.get(invitation.roomId) ?? await this.packRoom(invitation.room ?? invitation.roomId, me),
			userId: invitation.userId,
			user: options?._hint_?.packedUsers.get(invitation.userId) ?? await this.userEntityService.pack(invitation.user ?? invitation.userId, me),
		};
	}

	@bindThis
	public async packRoomInvitations(
		invitations: MiChatRoomInvitation[],
		me: { id: MiUser['id'] },
	) {
		if (invitations.length === 0) return [];

		return await Promise.all(invitations.map(invitation => this.packRoomInvitation(invitation, me)));
	}

	@bindThis
	public async packRoomMembership(
		src: MiChatRoomMembership['id'] | MiChatRoomMembership,
		me: { id: MiUser['id'] },
		options?: {
			populateUser?: boolean;
			populateRoom?: boolean;
			_hint_?: {
				packedRooms: Map<MiChatRoomMembership['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiChatRoomMembership['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomMembership'>> {
		const membership = typeof src === 'object' ? src : await this.chatRoomMembershipsRepository.findOneByOrFail({ id: src });

		return {
			id: membership.id,
			createdAt: this.idService.parse(membership.id).date.toISOString(),
			userId: membership.userId,
			user: options?.populateUser ? (options._hint_?.packedUsers.get(membership.userId) ?? await this.userEntityService.pack(membership.user ?? membership.userId, me)) : undefined,
			roomId: membership.roomId,
			room: options?.populateRoom ? (options._hint_?.packedRooms.get(membership.roomId) ?? await this.packRoom(membership.room ?? membership.roomId, me)) : undefined,
			role: membership.role ?? 'member',
		};
	}

	@bindThis
	public async packRoomMemberships(
		memberships: MiChatRoomMembership[],
		me: { id: MiUser['id'] },
		options: {
			populateUser?: boolean;
			populateRoom?: boolean;
		} = {},
	) {
		if (memberships.length === 0) return [];

		const users = memberships.map(x => x.user ?? x.userId);
		const rooms = memberships.map(x => x.room ?? x.roomId);

		const [packedUsers, packedRooms] = await Promise.all([
			this.userEntityService.packMany(users, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.packRooms(rooms, me)
				.then(rooms => new Map(rooms.map(r => [r.id, r]))),
		]);

		return await Promise.all(memberships.map(membership => this.packRoomMembership(membership, me, { ...options, _hint_: { packedUsers, packedRooms } })));
	}
}
