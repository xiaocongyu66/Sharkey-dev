/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

/**
 * Long-term ECDH public key for chat E2EE (one per local user).
 * Private key never leaves the client.
 */
@Entity('chat_e2ee_key')
export class MiChatE2eeKey {
	@PrimaryColumn(id())
	public userId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	/** JWK JSON string (public only) */
	@Column('text')
	public publicKey: string;

	@Column('timestamptz')
	public updatedAt: Date;
}
