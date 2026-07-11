/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class ChatEnhancements1774800000000 {
	name = 'ChatEnhancements1774800000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "joinPolicy" character varying(32) NOT NULL DEFAULT 'invite'`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "inviteCode" character varying(64)`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "announcement" character varying(2048) NOT NULL DEFAULT ''`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "isMutedAll" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_chat_room_inviteCode" ON "chat_room" ("inviteCode") WHERE "inviteCode" IS NOT NULL`);

		await queryRunner.query(`ALTER TABLE "chat_room_membership" ADD "role" character varying(16) NOT NULL DEFAULT 'member'`);

		await queryRunner.query(`ALTER TABLE "chat_message" ADD "replyId" character varying(32)`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_message_replyId" ON "chat_message" ("replyId")`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD CONSTRAINT "FK_chat_message_replyId" FOREIGN KEY ("replyId") REFERENCES "chat_message"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" DROP CONSTRAINT "FK_chat_message_replyId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_message_replyId"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "replyId"`);

		await queryRunner.query(`ALTER TABLE "chat_room_membership" DROP COLUMN "role"`);

		await queryRunner.query(`DROP INDEX "public"."IDX_chat_room_inviteCode"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "isMutedAll"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "announcement"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "inviteCode"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "joinPolicy"`);
	}
}
