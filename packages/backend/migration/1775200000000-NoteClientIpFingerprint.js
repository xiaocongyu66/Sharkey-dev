/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class NoteClientIpFingerprint1775200000000 {
	name = 'NoteClientIpFingerprint1775200000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" ADD "clientIp" character varying(128)`);
		await queryRunner.query(`ALTER TABLE "note" ADD "clientFingerprint" character varying(256)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "clientFingerprint"`);
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "clientIp"`);
	}
}
