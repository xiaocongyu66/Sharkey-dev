/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, Column, ManyToOne, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiDriveFile } from './DriveFile.js';

@Entity('chat_sticker_pack')
export class MiChatStickerPack {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 128,
	})
	public name: string;

	@Column('varchar', {
		length: 256,
		default: '',
	})
	public title: string;

	@Column('varchar', {
		length: 128,
		nullable: true,
	})
	public telegramName: string | null;

	@Index()
	@Column({
		...id(),
		nullable: true,
	})
	public ownerId: MiUser['id'] | null;

	@ManyToOne(type => MiUser, {
		onDelete: 'SET NULL',
		nullable: true,
	})
	@JoinColumn()
	public owner: MiUser | null;

	@Column('boolean', {
		default: true,
	})
	public isPublic: boolean;

	@Column({
		...id(),
		nullable: true,
	})
	public thumbnailFileId: MiDriveFile['id'] | null;

	@ManyToOne(type => MiDriveFile, {
		onDelete: 'SET NULL',
		nullable: true,
	})
	@JoinColumn()
	public thumbnailFile: MiDriveFile | null;
}
