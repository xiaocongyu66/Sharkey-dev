/*
 * SPDX-FileCopyrightText: dakkar and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class XAlgorithmConfig1774696127766 {
    name = 'XAlgorithmConfig1774696127766'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "xAlgorithmConfig" jsonb NOT NULL DEFAULT '{"enabled":false,"strictOriginalExperience":true,"homeMixerEndpoint":null,"scoredPostsEndpoint":null,"phoenixEndpoint":null,"thunderEndpoint":null,"groxEndpoint":null,"apiKey":null,"requestTimeoutMs":3000,"candidatesPerRequest":100,"includeInNetwork":true,"includeOutOfNetwork":true,"enableGroxContentUnderstanding":true,"enableAdsBlending":false,"modelArtifactsPath":null,"fallbackToSharkeyTimeline":false}'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "xAlgorithmConfig"`);
    }

}
