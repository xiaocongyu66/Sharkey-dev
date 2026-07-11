/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiDriveFile } from './DriveFile.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_message')
export class MiChatMessage {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
	})
	public fromUserId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public fromUser: MiUser | null;

	@Index()
	@Column({
		...id(), nullable: true,
	})
	public toUserId: MiUser['id'] | null;

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public toUser: MiUser | null;

	@Index()
	@Column({
		...id(), nullable: true,
	})
	public toRoomId: MiChatRoom['id'] | null;

	@ManyToOne(type => MiChatRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public toRoom: MiChatRoom | null;

	@Column('text', {
		nullable: true,
	})
	public text: string | null;

	/** When true, body is in ciphertext; text is null/placeholder. Server cannot read plaintext. */
	@Column('boolean', {
		default: false,
	})
	public isE2ee: boolean;

	/** Opaque client ciphertext (base64 payload). */
	@Column('text', {
		nullable: true,
	})
	public ciphertext: string | null;

	/** Staff-hidden (e.g. after account suspend with hideChat). Invisible to non-staff. */
	@Column('boolean', {
		default: false,
	})
	public isHidden: boolean;

	@Column('varchar', {
		length: 512, nullable: true,
	})
	public uri: string | null;

	@Column({
		...id(),
		array: true, default: '{}',
	})
	public reads: MiUser['id'][];

	@Column({
		...id(),
		nullable: true,
	})
	public fileId: MiDriveFile['id'] | null;

	@ManyToOne(type => MiDriveFile, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public file: MiDriveFile | null;

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public reactions: string[];

	@Index()
	@Column({
		...id(),
		nullable: true,
	})
	public replyId: MiChatMessage['id'] | null;

	@ManyToOne(type => MiChatMessage, {
		onDelete: 'SET NULL',
		nullable: true,
	})
	@JoinColumn()
	public reply: MiChatMessage | null;
}
