/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomMessageRateLimit1775400000000 {
	name = 'ChatRoomMessageRateLimit1775400000000';

	async up(queryRunner) {
		await queryRunner.query(`
			ALTER TABLE "chat_room"
			ADD COLUMN IF NOT EXISTS "messageRateLimitSeconds" integer NOT NULL DEFAULT 0
		`);
	}

	async down(queryRunner) {
		await queryRunner.query(`
			ALTER TABLE "chat_room"
			DROP COLUMN IF EXISTS "messageRateLimitSeconds"
		`);
	}
}
