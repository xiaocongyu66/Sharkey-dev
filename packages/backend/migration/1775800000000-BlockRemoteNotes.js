/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class BlockRemoteNotes1775800000000 {
	name = 'BlockRemoteNotes1775800000000';

	async up(queryRunner) {
		await queryRunner.query(`
			ALTER TABLE "meta"
			ADD COLUMN IF NOT EXISTS "blockRemoteNotes" boolean NOT NULL DEFAULT false
		`);
	}

	async down(queryRunner) {
		await queryRunner.query(`
			ALTER TABLE "meta"
			DROP COLUMN IF EXISTS "blockRemoteNotes"
		`);
	}
}
