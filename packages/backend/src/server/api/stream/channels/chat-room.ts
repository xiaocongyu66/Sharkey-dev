/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { ChatEventPayload } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import type { ChatRoomsRepository, DriveFilesRepository, MiDriveFile } from '@/models/_.js';
import type { Config } from '@/config.js';
import { Channel, type MiChannelService } from '../channel.js';

class ChatRoomChannel extends Channel {
	public readonly chName = 'chatRoom';
	public static shouldShare = false;
	public static requireCredential = true as const;
	// read for connect; write ops check availability + membership in handlers
	public static kind = 'read:chat';
	private roomId: string;

	constructor(
		id: string,
		connection: Channel['connection'],

		private chatRoomsRepository: ChatRoomsRepository,
		private driveFilesRepository: DriveFilesRepository,
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
		private config: Config,
	) {
		super(id, connection);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (typeof params.roomId !== 'string') return false;
		this.roomId = params.roomId;

		const exists = await this.chatRoomsRepository.findOne({
			select: { id: true },
			where: { id: this.roomId },
		}) != null;

		if (!exists) return true;

		this.subscriber.on(`chatRoomStream:${this.roomId}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: ChatEventPayload) {
		this.send(data.type, data.body);
	}

	@bindThis
	public async onMessage(type: string, body: any) {
		if (!this.user) return;

		switch (type) {
			case 'read':
				if (this.roomId) {
					this.chatService.readRoomChatMessage(this.user.id, this.roomId);
				}
				break;

			// Send message over WebSocket (preferred transport)
			case 'msg': {
				try {
					await this.chatService.checkChatAvailability(this.user.id, 'write');
					const room = await this.chatService.findRoomById(this.roomId);
					if (room == null) {
						this.send('msgError', { code: 'NO_SUCH_ROOM', message: 'No such room.' });
						return;
					}

					const text = typeof body?.text === 'string' ? body.text : null;
					const fileId = typeof body?.fileId === 'string' ? body.fileId : null;
					const replyId = typeof body?.replyId === 'string' ? body.replyId : null;
					const isE2ee = body?.isE2ee === true;
					const ciphertext = typeof body?.ciphertext === 'string' ? body.ciphertext : null;

					if (text && text.length > this.config.maxNoteLength && !isE2ee) {
						this.send('msgError', { code: 'MAX_LENGTH', message: 'Message too long.' });
						return;
					}

					let file: MiDriveFile | null = null;
					if (fileId != null) {
						file = await this.driveFilesRepository.findOneBy({
							id: fileId,
							userId: this.user.id,
						});
						if (file == null) {
							this.send('msgError', { code: 'NO_SUCH_FILE', message: 'No such file.' });
							return;
						}
					}

					if (!isE2ee && text == null && file == null) {
						this.send('msgError', { code: 'CONTENT_REQUIRED', message: 'Content required.' });
						return;
					}
					if (isE2ee && !ciphertext && file == null) {
						this.send('msgError', { code: 'CONTENT_REQUIRED', message: 'Ciphertext required.' });
						return;
					}

					// createMessageToRoom seals with chat escrow (chat only; not notes)
					await this.chatService.createMessageToRoom(this.user, room, {
						text: isE2ee ? null : text,
						file,
						replyId,
						isE2ee,
						ciphertext,
					});
					this.send('msgAck', { ok: true });
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'error';
					const errCode = (e as any)?.code;
					const remainingSeconds = (e as any)?.remainingSeconds;
					const mutedUntil = (e as any)?.mutedUntil;
					const code =
						msg === 'room is muted for all' ? 'ROOM_MUTED_ALL'
						: (errCode === 'ROOM_MEMBER_MUTED' || msg === 'you are muted in this room') ? 'ROOM_MEMBER_MUTED'
						: msg === 'no such reply target' ? 'NO_SUCH_REPLY'
						: msg === 'you are not a member of the room' ? 'NOT_A_MEMBER'
						: (errCode === 'ROOM_RATE_LIMITED' || msg.startsWith('rate limited')) ? 'ROOM_RATE_LIMITED'
						: 'SEND_FAILED';
					this.send('msgError', { code, message: msg, remainingSeconds, mutedUntil });
				}
				break;
			}

			case 'react': {
				try {
					await this.chatService.checkChatAvailability(this.user.id, 'write');
					const messageId = typeof body?.messageId === 'string' ? body.messageId : null;
					const reaction = typeof body?.reaction === 'string' ? body.reaction : null;
					if (!messageId || !reaction) {
						this.send('msgError', { code: 'CONTENT_REQUIRED', message: 'messageId and reaction required.' });
						return;
					}
					await this.chatService.react(messageId, this.user.id, reaction);
					this.send('msgAck', { ok: true });
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'error';
					this.send('msgError', { code: 'REACT_FAILED', message: msg });
				}
				break;
			}

			case 'unreact': {
				try {
					await this.chatService.checkChatAvailability(this.user.id, 'write');
					const messageId = typeof body?.messageId === 'string' ? body.messageId : null;
					const reaction = typeof body?.reaction === 'string' ? body.reaction : null;
					if (!messageId || !reaction) {
						this.send('msgError', { code: 'CONTENT_REQUIRED', message: 'messageId and reaction required.' });
						return;
					}
					await this.chatService.unreact(messageId, this.user.id, reaction);
					this.send('msgAck', { ok: true });
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'error';
					this.send('msgError', { code: 'UNREACT_FAILED', message: msg });
				}
				break;
			}

			case 'delete': {
				try {
					await this.chatService.checkChatAvailability(this.user.id, 'write');
					const messageId = typeof body?.messageId === 'string' ? body.messageId : null;
					if (!messageId) {
						this.send('msgError', { code: 'CONTENT_REQUIRED', message: 'messageId required.' });
						return;
					}
					// Author or room moderators (owner/admin/site mod)
					const message = await this.chatService.findMessageById(messageId);
					if (message == null || message.toRoomId !== this.roomId) {
						this.send('msgError', { code: 'NO_SUCH_MESSAGE', message: 'No such message.' });
						return;
					}
					if (!(await this.chatService.canDeleteMessage(message, this.user))) {
						this.send('msgError', { code: 'NO_PERMISSION', message: 'No permission.' });
						return;
					}
					await this.chatService.deleteMessage(message);
					this.send('msgAck', { ok: true });
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'error';
					this.send('msgError', { code: 'DELETE_FAILED', message: msg });
				}
				break;
			}

			// Admin: clear all messages via WS
			case 'clearMessages': {
				try {
					await this.chatService.checkChatAvailability(this.user.id, 'write');
					const room = await this.chatService.findRoomById(this.roomId);
					if (room == null) {
						this.send('msgError', { code: 'NO_SUCH_ROOM', message: 'No such room.' });
						return;
					}
					const result = await this.chatService.clearRoomMessages(room, this.user);
					this.send('clearAck', { ok: true, deleted: result.deleted });
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'error';
					this.send('msgError', { code: msg === 'access denied' ? 'ACCESS_DENIED' : 'CLEAR_FAILED', message: msg });
				}
				break;
			}

			// Page load: room timeline over WS (prefer over REST when channel is open)
			case 'history': {
				try {
					await this.chatService.checkChatAvailability(this.user.id, 'read');
					const room = await this.chatService.findRoomById(this.roomId);
					if (room == null) {
						this.send('historyError', { code: 'NO_SUCH_ROOM' });
						return;
					}
					if (!(await this.chatService.hasPermissionToViewRoomTimeline(this.user, room))) {
						this.send('historyError', { code: 'ACCESS_DENIED' });
						return;
					}
					const limit = Math.min(Math.max(1, Math.floor(Number(body?.limit) || 40)), 100);
					const untilId = typeof body?.untilId === 'string' ? body.untilId : null;
					const sinceId = typeof body?.sinceId === 'string' ? body.sinceId : null;
					const reqId = typeof body?.reqId === 'string' ? body.reqId : null;
					const messages = await this.chatService.roomTimeline(room.id, limit, sinceId, untilId);
					const packed = await this.chatEntityService.packMessagesLiteForRoom(messages);
					this.send('history', {
						reqId,
						messages: packed,
						hasMore: messages.length === limit,
						untilId: messages.length ? messages[messages.length - 1].id : untilId,
					});
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'error';
					this.send('historyError', { code: 'HISTORY_FAILED', message: msg, reqId: body?.reqId ?? null });
				}
				break;
			}

			// Page load: room metadata over WS
			case 'roomShow': {
				try {
					await this.chatService.checkChatAvailability(this.user.id, 'read');
					const room = await this.chatService.findRoomById(this.roomId);
					if (room == null) {
						this.send('roomError', { code: 'NO_SUCH_ROOM' });
						return;
					}
					if (!(await this.chatService.hasPermissionToViewRoomTimeline(this.user, room)) && !(await this.chatService.isRoomMember(room, this.user.id))) {
						// still allow show for join gate if public — packRoom handles membership flags
					}
					const packed = await this.chatEntityService.packRoom(room, this.user);
					const reqId = typeof body?.reqId === 'string' ? body.reqId : null;
					this.send('room', { reqId, room: packed });
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'error';
					this.send('roomError', { code: 'ROOM_FAILED', message: msg, reqId: body?.reqId ?? null });
				}
				break;
			}

			// Members list over WS
			case 'members': {
				try {
					await this.chatService.checkChatAvailability(this.user.id, 'read');
					const room = await this.chatService.findRoomById(this.roomId);
					if (room == null) {
						this.send('membersError', { code: 'NO_SUCH_ROOM' });
						return;
					}
					const isMember = await this.chatService.isRoomMember(room, this.user.id);
					const canMod = await this.chatService.canModerateRoom(room, this.user.id);
					if (!isMember && !canMod) {
						this.send('membersError', { code: 'ACCESS_DENIED' });
						return;
					}
					const limit = Math.min(Math.max(1, Math.floor(Number(body?.limit) || 100)), 100);
					const memberships = await this.chatService.getRoomMembershipsWithPagination(room.id, limit);
					const packed = await this.chatEntityService.packRoomMemberships(memberships, this.user, {
						populateUser: true,
						populateRoom: false,
					});
					const reqId = typeof body?.reqId === 'string' ? body.reqId : null;
					this.send('members', { reqId, memberships: packed });
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'error';
					this.send('membersError', { code: 'MEMBERS_FAILED', message: msg, reqId: body?.reqId ?? null });
				}
				break;
			}
		}
	}

	@bindThis
	public dispose() {
		this.subscriber.off(`chatRoomStream:${this.roomId}`, this.onEvent);
	}
}

@Injectable()
export class ChatRoomChannelService implements MiChannelService<true> {
	public readonly shouldShare = ChatRoomChannel.shouldShare;
	public readonly requireCredential = ChatRoomChannel.requireCredential;
	public readonly kind = ChatRoomChannel.kind;

	constructor(
		@Inject(DI.chatRoomsRepository)
		private readonly chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.driveFilesRepository)
		private readonly driveFilesRepository: DriveFilesRepository,

		@Inject(DI.config)
		private readonly config: Config,

		private readonly chatService: ChatService,
		private readonly chatEntityService: ChatEntityService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): ChatRoomChannel {
		return new ChatRoomChannel(
			id,
			connection,
			this.chatRoomsRepository,
			this.driveFilesRepository,
			this.chatService,
			this.chatEntityService,
			this.config,
		);
	}
}
