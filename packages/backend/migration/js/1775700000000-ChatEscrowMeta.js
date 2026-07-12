/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatEscrowMeta1775700000000 {
	name = 'ChatEscrowMeta1775700000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "chatEscrowEnabled" boolean NOT NULL DEFAULT true`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "chatEscrowActiveKeyId" character varying(32)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "chatEscrowKeys" jsonb NOT NULL DEFAULT '[]'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "chatEscrowKeys"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "chatEscrowActiveKeyId"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "chatEscrowEnabled"`);
	}
}
