/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class ChatStickers1774900000000 {
	name = 'ChatStickers1774900000000'

	async up(queryRunner) {
		await queryRunner.query(`
			CREATE TABLE "chat_sticker_pack" (
				"id" character varying(32) NOT NULL,
				"name" character varying(128) NOT NULL,
				"title" character varying(256) NOT NULL DEFAULT '',
				"telegramName" character varying(128),
				"ownerId" character varying(32),
				"isPublic" boolean NOT NULL DEFAULT true,
				"thumbnailFileId" character varying(32),
				CONSTRAINT "PK_chat_sticker_pack" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_chat_sticker_pack_telegramName" ON "chat_sticker_pack" ("telegramName") WHERE "telegramName" IS NOT NULL`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_sticker_pack_ownerId" ON "chat_sticker_pack" ("ownerId")`);

		await queryRunner.query(`
			CREATE TABLE "chat_sticker" (
				"id" character varying(32) NOT NULL,
				"packId" character varying(32) NOT NULL,
				"fileId" character varying(32) NOT NULL,
				"emoji" character varying(64) NOT NULL DEFAULT '',
				"sortOrder" integer NOT NULL DEFAULT 0,
				CONSTRAINT "PK_chat_sticker" PRIMARY KEY ("id"),
				CONSTRAINT "FK_chat_sticker_packId" FOREIGN KEY ("packId") REFERENCES "chat_sticker_pack"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
				CONSTRAINT "FK_chat_sticker_fileId" FOREIGN KEY ("fileId") REFERENCES "drive_file"("id") ON DELETE CASCADE ON UPDATE NO ACTION
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_sticker_packId" ON "chat_sticker" ("packId")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "chat_sticker"`);
		await queryRunner.query(`DROP TABLE "chat_sticker_pack"`);
	}
}
