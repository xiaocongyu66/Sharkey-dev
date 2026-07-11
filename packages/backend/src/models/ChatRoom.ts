/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('chat_room')
export class MiChatRoom {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 256,
	})
	public name: string;

	@Index()
	@Column({
		...id(),
	})
	public ownerId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public owner: MiUser | null;

	@Column('varchar', {
		length: 2048, default: '',
	})
	public description: string;

	/**
	 * public: anyone with room id can join
	 * link: anyone with inviteCode can join
	 * invite: invitation required
	 * closed: joining disabled
	 */
	@Column('varchar', {
		length: 32, default: 'invite',
	})
	public joinPolicy: 'public' | 'link' | 'invite' | 'closed';

	@Column('varchar', {
		length: 64, nullable: true,
	})
	public inviteCode: string | null;

	@Column('varchar', {
		length: 2048, default: '',
	})
	public announcement: string;

	/** When true, only owner/admins (and instance moderators) may post. */
	@Column('boolean', {
		default: false,
	})
	public isMutedAll: boolean;

	/**
	 * Slow mode: minimum seconds between messages for normal members.
	 * 0 = unlimited. Owner / room admins / instance moderators are exempt.
	 */
	@Column('integer', {
		default: 0,
	})
	public messageRateLimitSeconds: number;

	@Column('boolean', {
		default: false,
	})
	public isArchived: boolean;
}
