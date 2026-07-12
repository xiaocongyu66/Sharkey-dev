/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { ChatE2eeKeysRepository, ChatMessagesRepository, DriveFilesRepository, MiDriveFile } from '@/models/_.js';
import type { ChatEventPayload } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import type { Config } from '@/config.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { CacheService } from '@/core/CacheService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { Channel, type MiChannelService } from '../channel.js';

class ChatUserChannel extends Channel {
	public readonly chName = 'chatUser';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:chat';
	private otherId: string;

	constructor(
		id: string,
		connection: Channel['connection'],

		private chatMessagesRepository: ChatMessagesRepository,
		private driveFilesRepository: DriveFilesRepository,
		private chatE2eeKeysRepository: ChatE2eeKeysRepository,
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
		private cacheService: CacheService,
		private globalEventService: GlobalEventService,
		private config: Config,
	) {
		super(id, connection);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (!this.user) return false;
		if (typeof params.otherId !== 'string') return false;
		this.otherId = params.otherId;

		// Always allow connect for 1:1 (even with no prior messages) so WS send works for first message
		this.subscriber.on(`chatUserStream:${this.user.id}-${this.otherId}`, this.onEvent);

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
				if (this.otherId) {
					this.chatService.readUserChatMessage(this.user.id, this.otherId);
				}
				break;

			case 'msg': {
				try {
					await this.chatService.checkChatAvailability(this.user.id, 'write');
					const toUser = await this.cacheService.findUserById(this.otherId);
					if (toUser == null) {
						this.send('msgError', { code: 'NO_SUCH_USER', message: 'No such user.' });
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
					if (isE2ee && !ciphertext && !file) {
						this.send('msgError', { code: 'CONTENT_REQUIRED', message: 'Ciphertext required.' });
						return;
					}

					await this.chatService.createMessageToUser(this.user, toUser, {
						text: isE2ee ? null : text,
						file,
						replyId,
						isE2ee,
						ciphertext,
					});
					this.send('msgAck', { ok: true });
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'error';
					this.send('msgError', { code: 'SEND_FAILED', message: msg });
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
					// Only own messages (same as REST chat/messages/delete)
					const message = await this.chatService.findMyMessageById(this.user.id, messageId);
					if (message == null || message.toRoomId != null) {
						this.send('msgError', { code: 'NO_SUCH_MESSAGE', message: 'No such message.' });
						return;
					}
					const okPair =
						(message.fromUserId === this.user.id && message.toUserId === this.otherId) ||
						(message.fromUserId === this.otherId && message.toUserId === this.user.id);
					if (!okPair) {
						this.send('msgError', { code: 'ACCESS_DENIED', message: 'Message not in this chat.' });
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

			// Page load: 1:1 timeline over WS
			case 'history': {
				try {
					await this.chatService.checkChatAvailability(this.user.id, 'read');
					const limit = Math.min(Math.max(1, Math.floor(Number(body?.limit) || 40)), 100);
					const untilId = typeof body?.untilId === 'string' ? body.untilId : null;
					const sinceId = typeof body?.sinceId === 'string' ? body.sinceId : null;
					const reqId = typeof body?.reqId === 'string' ? body.reqId : null;
					const messages = await this.chatService.userTimeline(this.user.id, this.otherId, limit, sinceId, untilId);
					const packed = await this.chatEntityService.packMessagesLiteFor1on1(messages);
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

			// E2EE: fetch peer public key over open chat channel (no extra REST)
			case 'e2eeKeyGet': {
				try {
					await this.chatService.checkChatAvailability(this.user.id, 'read');
					const targetId = typeof body?.userId === 'string' ? body.userId : this.otherId;
					const reqId = typeof body?.reqId === 'string' ? body.reqId : null;
					const row = await this.chatE2eeKeysRepository.findOneBy({ userId: targetId });
					this.send('e2eeKey', {
						reqId,
						userId: targetId,
						publicKey: row?.publicKey ?? null,
						keyId: row?.keyId ?? null,
						updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
					});
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'error';
					this.send('e2eeKeyError', { code: 'KEY_FAILED', message: msg, reqId: body?.reqId ?? null });
				}
				break;
			}

			// E2EE: publish own public key over WS + notify self (other devices)
			case 'e2eeKeySet': {
				try {
					await this.chatService.checkChatAvailability(this.user.id, 'write');
					const publicKey = typeof body?.publicKey === 'string' ? body.publicKey : null;
					const reqId = typeof body?.reqId === 'string' ? body.reqId : null;
					if (!publicKey) {
						this.send('e2eeKeyError', { code: 'CONTENT_REQUIRED', message: 'publicKey required', reqId });
						return;
					}
					let parsed: any;
					try {
						parsed = JSON.parse(publicKey);
					} catch {
						this.send('e2eeKeyError', { code: 'INVALID_KEY', message: 'invalid json', reqId });
						return;
					}
					if (parsed?.kty !== 'EC' || !parsed?.x || !parsed?.y || parsed.d) {
						this.send('e2eeKeyError', { code: 'INVALID_KEY', message: 'invalid jwk', reqId });
						return;
					}
					const keyId = (typeof body?.keyId === 'string' && body.keyId.trim())
						? body.keyId.trim().slice(0, 64)
						: createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
					const updatedAt = new Date();
					const existing = await this.chatE2eeKeysRepository.findOneBy({ userId: this.user.id });
					if (existing) {
						await this.chatE2eeKeysRepository.update(this.user.id, { publicKey, keyId, updatedAt });
					} else {
						await this.chatE2eeKeysRepository.insert({
							userId: this.user.id,
							publicKey,
							keyId,
							updatedAt,
						});
					}
					const payload = {
						userId: this.user.id,
						keyId,
						updatedAt: updatedAt.toISOString(),
					};
					await this.globalEventService.publishMainStream(this.user.id, 'e2eeKeyUpdated', payload);
					// Both stream directions so either side of the 1:1 channel receives it
					await this.globalEventService.publishChatUserStream(this.user.id, this.otherId, 'e2eeKeyUpdated', payload);
					await this.globalEventService.publishChatUserStream(this.otherId, this.user.id, 'e2eeKeyUpdated', payload);
					this.send('e2eeKeySetAck', { reqId, ok: true, keyId });
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'error';
					this.send('e2eeKeyError', { code: 'KEY_SET_FAILED', message: msg, reqId: body?.reqId ?? null });
				}
				break;
			}
		}
	}

	@bindThis
	public dispose() {
		if (this.user) {
			this.subscriber.off(`chatUserStream:${this.user.id}-${this.otherId}`, this.onEvent);
		}
	}
}

@Injectable()
export class ChatUserChannelService implements MiChannelService<true> {
	public readonly shouldShare = ChatUserChannel.shouldShare;
	public readonly requireCredential = ChatUserChannel.requireCredential;
	public readonly kind = ChatUserChannel.kind;

	constructor(
		@Inject(DI.chatMessagesRepository)
		private readonly chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.driveFilesRepository)
		private readonly driveFilesRepository: DriveFilesRepository,

		@Inject(DI.chatE2eeKeysRepository)
		private readonly chatE2eeKeysRepository: ChatE2eeKeysRepository,

		@Inject(DI.config)
		private readonly config: Config,

		private readonly chatService: ChatService,
		private readonly chatEntityService: ChatEntityService,
		private readonly cacheService: CacheService,
		private readonly globalEventService: GlobalEventService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): ChatUserChannel {
		return new ChatUserChannel(
			id,
			connection,
			this.chatMessagesRepository,
			this.driveFilesRepository,
			this.chatE2eeKeysRepository,
			this.chatService,
			this.chatEntityService,
			this.cacheService,
			this.globalEventService,
			this.config,
		);
	}
}
