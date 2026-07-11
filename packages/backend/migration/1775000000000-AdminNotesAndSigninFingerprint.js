/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class AdminNotesAndSigninFingerprint1775000000000 {
	name = 'AdminNotesAndSigninFingerprint1775000000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "signin" ADD "fingerprint" character varying(256)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "disableLocalNoteCreation" boolean NOT NULL DEFAULT false`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "disableLocalNoteCreation"`);
		await queryRunner.query(`ALTER TABLE "signin" DROP COLUMN "fingerprint"`);
	}
}
