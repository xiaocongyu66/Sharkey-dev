/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class ChatE2ee1775100000000 {
	name = 'ChatE2ee1775100000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "isE2ee" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "ciphertext" text`);
		await queryRunner.query(`
			CREATE TABLE "chat_e2ee_key" (
				"userId" character varying(32) NOT NULL,
				"publicKey" text NOT NULL,
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_chat_e2ee_key" PRIMARY KEY ("userId")
			)
		`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "chat_e2ee_key"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "ciphertext"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "isE2ee"`);
	}
}
