/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class NoteIsHidden1775300000000 {
	name = 'NoteIsHidden1775300000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" ADD "isHidden" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`CREATE INDEX "IDX_note_isHidden" ON "note" ("isHidden") WHERE "isHidden" = true`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "isHidden" boolean NOT NULL DEFAULT false`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "isHidden"`);
		await queryRunner.query(`DROP INDEX "IDX_note_isHidden"`);
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "isHidden"`);
	}
}
