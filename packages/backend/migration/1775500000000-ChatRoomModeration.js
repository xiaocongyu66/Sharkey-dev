/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomModeration1775500000000 {
	name = 'ChatRoomModeration1775500000000';

	async up(queryRunner) {
		// Per-member timed mute (null = not muted by moderators)
		await queryRunner.query(`
			ALTER TABLE "chat_room_membership"
			ADD COLUMN IF NOT EXISTS "mutedUntil" TIMESTAMP WITH TIME ZONE NULL
		`);

		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "chat_room_ban" (
				"id" character varying(32) NOT NULL,
				"roomId" character varying(32) NOT NULL,
				"userId" character varying(32) NOT NULL,
				"bannedById" character varying(32),
				"reason" character varying(512),
				CONSTRAINT "PK_chat_room_ban" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "IDX_chat_room_ban_room_user"
			ON "chat_room_ban" ("roomId", "userId")
		`);
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_chat_room_ban_roomId"
			ON "chat_room_ban" ("roomId")
		`);
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_chat_room_ban_userId"
			ON "chat_room_ban" ("userId")
		`);

		// FKs (ignore if already present)
		await queryRunner.query(`
			DO $$ BEGIN
				ALTER TABLE "chat_room_ban"
				ADD CONSTRAINT "FK_chat_room_ban_room"
				FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE;
			EXCEPTION WHEN duplicate_object THEN null; END $$;
		`);
		await queryRunner.query(`
			DO $$ BEGIN
				ALTER TABLE "chat_room_ban"
				ADD CONSTRAINT "FK_chat_room_ban_user"
				FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
			EXCEPTION WHEN duplicate_object THEN null; END $$;
		`);
		await queryRunner.query(`
			DO $$ BEGIN
				ALTER TABLE "chat_room_ban"
				ADD CONSTRAINT "FK_chat_room_ban_bannedBy"
				FOREIGN KEY ("bannedById") REFERENCES "user"("id") ON DELETE SET NULL;
			EXCEPTION WHEN duplicate_object THEN null; END $$;
		`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE IF EXISTS "chat_room_ban"`);
		await queryRunner.query(`
			ALTER TABLE "chat_room_membership"
			DROP COLUMN IF EXISTS "mutedUntil"
		`);
	}
}
