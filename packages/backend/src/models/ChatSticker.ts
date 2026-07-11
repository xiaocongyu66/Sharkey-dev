/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, Column, ManyToOne, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiChatStickerPack } from './ChatStickerPack.js';
import { MiDriveFile } from './DriveFile.js';

@Entity('chat_sticker')
export class MiChatSticker {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
	})
	public packId: MiChatStickerPack['id'];

	@ManyToOne(type => MiChatStickerPack, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public pack: MiChatStickerPack | null;

	@Column({
		...id(),
	})
	public fileId: MiDriveFile['id'];

	@ManyToOne(type => MiDriveFile, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public file: MiDriveFile | null;

	@Column('varchar', {
		length: 64,
		default: '',
	})
	public emoji: string;

	@Column('integer', {
		default: 0,
	})
	public sortOrder: number;
}
