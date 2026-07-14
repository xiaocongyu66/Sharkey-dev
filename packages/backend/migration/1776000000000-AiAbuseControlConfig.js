/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AiAbuseControlConfig1776000000000 {
	name = 'AiAbuseControlConfig1776000000000';

	async up(queryRunner) {
		await queryRunner.query(`
			ALTER TABLE "meta"
			ADD COLUMN IF NOT EXISTS "aiAbuseControlConfig" jsonb
			NOT NULL
			DEFAULT '{"enabled":false,"baseUrl":null,"apiKey":null,"model":"gpt-4o-mini","apiStyle":"auto","requestTimeoutMs":10000,"systemPrompt":null,"failOpen":true,"checkOnSignin":true,"checkOnSignup":true,"minLinkedAccounts":3,"signinWindowMinutes":60,"maxSigninsInWindow":20,"autoSuspend":false,"hideNotesOnSuspend":true,"cooldownSeconds":300}'::jsonb
		`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "aiAbuseControlConfig"`);
	}
}
