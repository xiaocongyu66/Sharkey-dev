/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AiTranslationConfig1776100000000 {
	name = 'AiTranslationConfig1776100000000';

	async up(queryRunner) {
		await queryRunner.query(`
			ALTER TABLE "meta"
			ADD COLUMN IF NOT EXISTS "aiTranslationConfig" jsonb
			DEFAULT '{"enableNotes":false,"enableChat":false,"useSharedCredentials":true,"shared":{"baseUrl":null,"apiKey":null,"model":"gpt-4o-mini","apiStyle":"auto","systemPrompt":null,"requestTimeoutMs":20000},"notes":{"baseUrl":null,"apiKey":null,"model":"gpt-4o-mini","apiStyle":"auto","systemPrompt":null,"requestTimeoutMs":20000},"chat":{"baseUrl":null,"apiKey":null,"model":"gpt-4o-mini","apiStyle":"auto","systemPrompt":null,"requestTimeoutMs":20000},"allowUserApiKey":true,"preferAiOverClassic":true,"uncensored":true,"selectiveByDefault":true}'::jsonb
		`);
		await queryRunner.query(`
			ALTER TABLE "user_profile"
			ADD COLUMN IF NOT EXISTS "aiTranslationConfig" jsonb
			DEFAULT NULL
		`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "aiTranslationConfig"`);
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "aiTranslationConfig"`);
	}
}
