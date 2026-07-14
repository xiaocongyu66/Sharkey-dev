/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { defaultXAlgorithmConfig, defaultAiNoteModerationConfig, defaultAiAbuseControlConfig, defaultAiTranslationConfig, defaultAiTranslationEndpointConfig, type MiMeta } from '@/models/Meta.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { instanceUnsignedFetchOptions } from '@/const.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		disableRegistration: { type: 'boolean', nullable: true },
		disableLocalNoteCreation: { type: 'boolean', nullable: true },
		blockRemoteNotes: { type: 'boolean', nullable: true },
		pinnedUsers: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		hiddenTags: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		blockedHosts: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		sensitiveWords: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		prohibitedWords: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		prohibitedWordsForNameOfUser: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		themeColor: { type: 'string', nullable: true, pattern: '^#[0-9a-fA-F]{6}$' },
		mascotImageUrl: { type: 'string', nullable: true },
		bannerUrl: { type: 'string', nullable: true },
		serverErrorImageUrl: { type: 'string', nullable: true },
		infoImageUrl: { type: 'string', nullable: true },
		notFoundImageUrl: { type: 'string', nullable: true },
		iconUrl: { type: 'string', nullable: true },
		app192IconUrl: { type: 'string', nullable: true },
		app512IconUrl: { type: 'string', nullable: true },
		sidebarLogoUrl: { type: 'string', nullable: true },
		backgroundImageUrl: { type: 'string', nullable: true },
		logoImageUrl: { type: 'string', nullable: true },
		name: { type: 'string', nullable: true },
		shortName: { type: 'string', nullable: true },
		description: { type: 'string', nullable: true },
		about: { type: 'string', nullable: true },
		defaultLightTheme: { type: 'string', nullable: true },
		defaultDarkTheme: { type: 'string', nullable: true },
		defaultLike: { type: 'string' },
		cacheRemoteFiles: { type: 'boolean' },
		cacheRemoteSensitiveFiles: { type: 'boolean' },
		emailRequiredForSignup: { type: 'boolean' },
		approvalRequiredForSignup: { type: 'boolean' },
		enableHcaptcha: { type: 'boolean' },
		hcaptchaSiteKey: { type: 'string', nullable: true },
		hcaptchaSecretKey: { type: 'string', nullable: true },
		enableMcaptcha: { type: 'boolean' },
		mcaptchaSiteKey: { type: 'string', nullable: true },
		mcaptchaInstanceUrl: { type: 'string', nullable: true },
		mcaptchaSecretKey: { type: 'string', nullable: true },
		enableRecaptcha: { type: 'boolean' },
		recaptchaSiteKey: { type: 'string', nullable: true },
		recaptchaSecretKey: { type: 'string', nullable: true },
		enableTurnstile: { type: 'boolean' },
		turnstileSiteKey: { type: 'string', nullable: true },
		turnstileSecretKey: { type: 'string', nullable: true },
		enableFC: { type: 'boolean' },
		fcSiteKey: { type: 'string', nullable: true },
		fcSecretKey: { type: 'string', nullable: true },
		enableTestcaptcha: { type: 'boolean' },
		sensitiveMediaDetection: { type: 'string', enum: ['none', 'all', 'local', 'remote'] },
		sensitiveMediaDetectionSensitivity: { type: 'string', enum: ['medium', 'low', 'high', 'veryLow', 'veryHigh'] },
		setSensitiveFlagAutomatically: { type: 'boolean' },
		enableSensitiveMediaDetectionForVideos: { type: 'boolean' },
		enableBotTrending: { type: 'boolean' },
		maintainerName: { type: 'string', nullable: true },
		maintainerEmail: { type: 'string', nullable: true },
		langs: {
			type: 'array', items: {
				type: 'string',
			},
		},
		translationTimeout: { type: 'number' },
		deeplAuthKey: { type: 'string', nullable: true },
		deeplIsPro: { type: 'boolean' },
		deeplFreeMode: { type: 'boolean' },
		deeplFreeInstance: { type: 'string', nullable: true },
		libreTranslateURL: { type: 'string', nullable: true },
		libreTranslateKey: { type: 'string', nullable: true },
		enableEmail: { type: 'boolean' },
		email: { type: 'string', nullable: true },
		smtpSecure: { type: 'boolean' },
		smtpHost: { type: 'string', nullable: true },
		smtpPort: { type: 'integer', nullable: true },
		smtpUser: { type: 'string', nullable: true },
		smtpPass: { type: 'string', nullable: true },
		enableServiceWorker: { type: 'boolean' },
		swPublicKey: { type: 'string', nullable: true },
		swPrivateKey: { type: 'string', nullable: true },
		tosUrl: { type: 'string', nullable: true },
		repositoryUrl: { type: 'string', nullable: true },
		feedbackUrl: { type: 'string', nullable: true },
		impressumUrl: { type: 'string', nullable: true },
		donationUrl: { type: 'string', nullable: true },
		privacyPolicyUrl: { type: 'string', nullable: true },
		inquiryUrl: { type: 'string', nullable: true },
		useObjectStorage: { type: 'boolean' },
		objectStorageBaseUrl: { type: 'string', nullable: true },
		objectStorageBucket: { type: 'string', nullable: true },
		objectStoragePrefix: { type: 'string', pattern: /^[a-zA-Z0-9-._\/]*$/.source, nullable: true },
		objectStorageEndpoint: { type: 'string', nullable: true },
		objectStorageRegion: { type: 'string', nullable: true },
		objectStoragePort: { type: 'integer', nullable: true },
		objectStorageAccessKey: { type: 'string', nullable: true },
		objectStorageSecretKey: { type: 'string', nullable: true },
		objectStorageUseSSL: { type: 'boolean' },
		objectStorageUseProxy: { type: 'boolean' },
		objectStorageSetPublicRead: { type: 'boolean' },
		objectStorageS3ForcePathStyle: { type: 'boolean' },
		enableIpLogging: { type: 'boolean' },
		enableActiveEmailValidation: { type: 'boolean' },
		enableVerifymailApi: { type: 'boolean' },
		verifymailAuthKey: { type: 'string', nullable: true },
		enableTruemailApi: { type: 'boolean' },
		truemailInstance: { type: 'string', nullable: true },
		truemailAuthKey: { type: 'string', nullable: true },
		enableChartsForRemoteUser: { type: 'boolean' },
		enableChartsForFederatedInstances: { type: 'boolean' },
		enableStatsForFederatedInstances: { type: 'boolean' },
		enableServerMachineStats: { type: 'boolean' },
		enableAchievements: { type: 'boolean' },
		robotsTxt: { type: 'string', nullable: true },
		enableIdenticonGeneration: { type: 'boolean' },
		serverRules: { type: 'array', items: { type: 'string' } },
		bannedEmailDomains: { type: 'array', items: { type: 'string' } },
		preservedUsernames: { type: 'array', items: { type: 'string' } },
		bubbleInstances: { type: 'array', items: { type: 'string' } },
		manifestJsonOverride: { type: 'string' },
		enableFanoutTimeline: { type: 'boolean' },
		enableFanoutTimelineDbFallback: { type: 'boolean' },
		perLocalUserUserTimelineCacheMax: { type: 'integer' },
		perRemoteUserUserTimelineCacheMax: { type: 'integer' },
		perUserHomeTimelineCacheMax: { type: 'integer' },
		perUserListTimelineCacheMax: { type: 'integer' },
		enableReactionsBuffering: { type: 'boolean' },
		notesPerOneAd: { type: 'integer' },
		silencedHosts: {
			type: 'array',
			nullable: true,
			items: {
				type: 'string',
			},
		},
		mediaSilencedHosts: {
			type: 'array',
			nullable: true,
			items: {
				type: 'string',
			},
		},
		summalyProxy: {
			type: 'string', nullable: true,
			description: '[Deprecated] Use "urlPreviewSummaryProxyUrl" instead.',
		},
		urlPreviewEnabled: { type: 'boolean' },
		urlPreviewTimeout: { type: 'integer' },
		urlPreviewMaximumContentLength: { type: 'integer' },
		urlPreviewRequireContentLength: { type: 'boolean' },
		urlPreviewUserAgent: { type: 'string', nullable: true },
		urlPreviewSummaryProxyUrl: { type: 'string', nullable: true },
		trustedLinkUrlPatterns: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		federation: {
			type: 'string',
			enum: ['all', 'none', 'specified'],
		},
		federationHosts: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
		allowUnsignedFetch: {
			type: 'string',
			enum: instanceUnsignedFetchOptions,
			nullable: false,
		},
		enableProxyAccount: {
			type: 'boolean',
			nullable: false,
		},
		deliverSuspendedSoftware: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					software: { type: 'string' },
					versionRange: { type: 'string' },
				},
				required: ['software', 'versionRange'],
			},
		},
		xAlgorithmConfig: {
			type: 'object',
			nullable: true,
			properties: {
				enabled: { type: 'boolean' },
				strictOriginalExperience: { type: 'boolean' },
				homeMixerEndpoint: { type: 'string', nullable: true },
				scoredPostsEndpoint: { type: 'string', nullable: true },
				phoenixEndpoint: { type: 'string', nullable: true },
				thunderEndpoint: { type: 'string', nullable: true },
				groxEndpoint: { type: 'string', nullable: true },
				apiKey: { type: 'string', nullable: true },
				requestTimeoutMs: { type: 'integer', minimum: 100 },
				candidatesPerRequest: { type: 'integer', minimum: 1, maximum: 1000 },
				includeInNetwork: { type: 'boolean' },
				includeOutOfNetwork: { type: 'boolean' },
				enableGroxContentUnderstanding: { type: 'boolean' },
				enableAdsBlending: { type: 'boolean' },
				modelArtifactsPath: { type: 'string', nullable: true },
				fallbackToSharkeyTimeline: { type: 'boolean' },
			},
		},
		aiNoteModerationConfig: {
			type: 'object',
			nullable: true,
			properties: {
				enableLocalNotes: { type: 'boolean' },
				enableRemoteNotes: { type: 'boolean' },
				baseUrl: { type: 'string', nullable: true },
				apiKey: { type: 'string', nullable: true },
				model: { type: 'string' },
				apiStyle: { type: 'string', enum: ['chat.completions', 'responses', 'auto'] },
				requestTimeoutMs: { type: 'integer', minimum: 1000, maximum: 60000 },
				systemPrompt: { type: 'string', nullable: true },
				action: { type: 'string', enum: ['reject', 'cw', 'hide', 'home'] },
				failOpen: { type: 'boolean' },
			},
		},
		aiAbuseControlConfig: {
			type: 'object',
			nullable: true,
			properties: {
				enabled: { type: 'boolean' },
				baseUrl: { type: 'string', nullable: true },
				apiKey: { type: 'string', nullable: true },
				model: { type: 'string' },
				apiStyle: { type: 'string', enum: ['chat.completions', 'responses', 'auto'] },
				requestTimeoutMs: { type: 'integer', minimum: 1000, maximum: 60000 },
				systemPrompt: { type: 'string', nullable: true },
				failOpen: { type: 'boolean' },
				checkOnSignin: { type: 'boolean' },
				checkOnSignup: { type: 'boolean' },
				minLinkedAccounts: { type: 'integer', minimum: 2, maximum: 100 },
				requireIpAndFingerprint: { type: 'boolean' },
				signinWindowMinutes: { type: 'integer', minimum: 1, maximum: 10080 },
				maxSigninsInWindow: { type: 'integer', minimum: 1, maximum: 10000 },
				autoSuspend: { type: 'boolean' },
				hideNotesOnSuspend: { type: 'boolean' },
				cooldownSeconds: { type: 'integer', minimum: 0, maximum: 86400 },
			},
		},
		aiTranslationConfig: {
			type: 'object',
			nullable: true,
			properties: {
				enableNotes: { type: 'boolean' },
				enableChat: { type: 'boolean' },
				useSharedCredentials: { type: 'boolean' },
				shared: {
					type: 'object',
					nullable: true,
					properties: {
						baseUrl: { type: 'string', nullable: true },
						apiKey: { type: 'string', nullable: true },
						model: { type: 'string' },
						apiStyle: { type: 'string', enum: ['chat.completions', 'responses', 'auto'] },
						systemPrompt: { type: 'string', nullable: true },
						requestTimeoutMs: { type: 'integer', minimum: 1000, maximum: 120000 },
					},
				},
				notes: {
					type: 'object',
					nullable: true,
					properties: {
						baseUrl: { type: 'string', nullable: true },
						apiKey: { type: 'string', nullable: true },
						model: { type: 'string' },
						apiStyle: { type: 'string', enum: ['chat.completions', 'responses', 'auto'] },
						systemPrompt: { type: 'string', nullable: true },
						requestTimeoutMs: { type: 'integer', minimum: 1000, maximum: 120000 },
					},
				},
				chat: {
					type: 'object',
					nullable: true,
					properties: {
						baseUrl: { type: 'string', nullable: true },
						apiKey: { type: 'string', nullable: true },
						model: { type: 'string' },
						apiStyle: { type: 'string', enum: ['chat.completions', 'responses', 'auto'] },
						systemPrompt: { type: 'string', nullable: true },
						requestTimeoutMs: { type: 'integer', minimum: 1000, maximum: 120000 },
					},
				},
				allowUserApiKey: { type: 'boolean' },
				preferAiOverClassic: { type: 'boolean' },
				uncensored: { type: 'boolean' },
				jailbreakPrompt: { type: 'string', nullable: true },
				selectiveByDefault: { type: 'boolean' },
				cacheEnabled: { type: 'boolean' },
				cacheTtlSeconds: { type: 'integer', minimum: 60, maximum: 2592000 },
			},
		},
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private readonly serverSettings: MiMeta,

		private metaService: MetaService,
		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const set = {} as Partial<MiMeta>;

			if (typeof ps.disableRegistration === 'boolean') {
				set.disableRegistration = ps.disableRegistration;
			}

			if (typeof ps.disableLocalNoteCreation === 'boolean') {
				set.disableLocalNoteCreation = ps.disableLocalNoteCreation;
			}

			if (typeof ps.blockRemoteNotes === 'boolean') {
				set.blockRemoteNotes = ps.blockRemoteNotes;
			}

			if (Array.isArray(ps.pinnedUsers)) {
				set.pinnedUsers = ps.pinnedUsers.filter(Boolean);
			}

			if (Array.isArray(ps.hiddenTags)) {
				set.hiddenTags = ps.hiddenTags.filter(Boolean);
			}

			if (Array.isArray(ps.blockedHosts)) {
				set.blockedHosts = ps.blockedHosts.filter(Boolean).map(x => x.toLowerCase());
			}

			if (Array.isArray(ps.sensitiveWords)) {
				set.sensitiveWords = ps.sensitiveWords.filter(Boolean);
			}
			if (Array.isArray(ps.prohibitedWords)) {
				set.prohibitedWords = ps.prohibitedWords.filter(Boolean);
			}
			if (Array.isArray(ps.prohibitedWordsForNameOfUser)) {
				set.prohibitedWordsForNameOfUser = ps.prohibitedWordsForNameOfUser.filter(Boolean);
			}
			if (Array.isArray(ps.silencedHosts)) {
				let lastValue = '';
				set.silencedHosts = ps.silencedHosts.sort().filter((h) => {
					const lv = lastValue;
					lastValue = h;
					return h !== '' && h !== lv && !set.blockedHosts?.includes(h);
				});
			}
			if (Array.isArray(ps.mediaSilencedHosts)) {
				let lastValue = '';
				set.mediaSilencedHosts = ps.mediaSilencedHosts.sort().filter((h) => {
					const lv = lastValue;
					lastValue = h;
					return h !== '' && h !== lv && !set.blockedHosts?.includes(h);
				});
			}
			if (ps.themeColor !== undefined) {
				set.themeColor = ps.themeColor;
			}

			if (ps.mascotImageUrl !== undefined) {
				set.mascotImageUrl = ps.mascotImageUrl;
			}

			if (ps.bannerUrl !== undefined) {
				set.bannerUrl = ps.bannerUrl;
			}

			if (ps.iconUrl !== undefined) {
				set.iconUrl = ps.iconUrl;
			}

			if (ps.app192IconUrl !== undefined) {
				set.app192IconUrl = ps.app192IconUrl;
			}

			if (ps.app512IconUrl !== undefined) {
				set.app512IconUrl = ps.app512IconUrl;
			}

			if (ps.sidebarLogoUrl !== undefined) {
				set.sidebarLogoUrl = ps.sidebarLogoUrl;
			}

			if (ps.serverErrorImageUrl !== undefined) {
				set.serverErrorImageUrl = ps.serverErrorImageUrl;
			}

			if (ps.infoImageUrl !== undefined) {
				set.infoImageUrl = ps.infoImageUrl;
			}

			if (ps.notFoundImageUrl !== undefined) {
				set.notFoundImageUrl = ps.notFoundImageUrl;
			}

			if (ps.backgroundImageUrl !== undefined) {
				set.backgroundImageUrl = ps.backgroundImageUrl;
			}

			if (ps.logoImageUrl !== undefined) {
				set.logoImageUrl = ps.logoImageUrl;
			}

			if (ps.name !== undefined) {
				set.name = ps.name;
			}

			if (ps.shortName !== undefined) {
				set.shortName = ps.shortName;
			}

			if (ps.description !== undefined) {
				set.description = ps.description;
			}

			if (ps.about !== undefined) {
				set.about = ps.about;
			}

			if (ps.defaultLightTheme !== undefined) {
				set.defaultLightTheme = ps.defaultLightTheme;
			}

			if (ps.defaultDarkTheme !== undefined) {
				set.defaultDarkTheme = ps.defaultDarkTheme;
			}

			if (ps.defaultLike !== undefined) {
				set.defaultLike = ps.defaultLike;
			}

			if (ps.cacheRemoteFiles !== undefined) {
				set.cacheRemoteFiles = ps.cacheRemoteFiles;
			}

			if (ps.cacheRemoteSensitiveFiles !== undefined) {
				set.cacheRemoteSensitiveFiles = ps.cacheRemoteSensitiveFiles;
			}

			if (ps.emailRequiredForSignup !== undefined) {
				set.emailRequiredForSignup = ps.emailRequiredForSignup;
			}

			if (ps.approvalRequiredForSignup !== undefined) {
				set.approvalRequiredForSignup = ps.approvalRequiredForSignup;
			}

			if (ps.enableHcaptcha !== undefined) {
				set.enableHcaptcha = ps.enableHcaptcha;
			}

			if (ps.hcaptchaSiteKey !== undefined) {
				set.hcaptchaSiteKey = ps.hcaptchaSiteKey;
			}

			if (ps.hcaptchaSecretKey !== undefined) {
				set.hcaptchaSecretKey = ps.hcaptchaSecretKey;
			}

			if (ps.enableMcaptcha !== undefined) {
				set.enableMcaptcha = ps.enableMcaptcha;
			}

			if (ps.mcaptchaSiteKey !== undefined) {
				set.mcaptchaSitekey = ps.mcaptchaSiteKey;
			}

			if (ps.mcaptchaInstanceUrl !== undefined) {
				set.mcaptchaInstanceUrl = ps.mcaptchaInstanceUrl;
			}

			if (ps.mcaptchaSecretKey !== undefined) {
				set.mcaptchaSecretKey = ps.mcaptchaSecretKey;
			}

			if (ps.enableRecaptcha !== undefined) {
				set.enableRecaptcha = ps.enableRecaptcha;
			}

			if (ps.recaptchaSiteKey !== undefined) {
				set.recaptchaSiteKey = ps.recaptchaSiteKey;
			}

			if (ps.recaptchaSecretKey !== undefined) {
				set.recaptchaSecretKey = ps.recaptchaSecretKey;
			}

			if (ps.enableTurnstile !== undefined) {
				set.enableTurnstile = ps.enableTurnstile;
			}

			if (ps.turnstileSiteKey !== undefined) {
				set.turnstileSiteKey = ps.turnstileSiteKey;
			}

			if (ps.turnstileSecretKey !== undefined) {
				set.turnstileSecretKey = ps.turnstileSecretKey;
			}

			if (ps.enableTestcaptcha !== undefined) {
				set.enableTestcaptcha = ps.enableTestcaptcha;
			}

			if (ps.enableFC !== undefined) {
				set.enableFC = ps.enableFC;
			}

			if (ps.fcSiteKey !== undefined) {
				set.fcSiteKey = ps.fcSiteKey;
			}

			if (ps.fcSecretKey !== undefined) {
				set.fcSecretKey = ps.fcSecretKey;
			}

			if (ps.enableBotTrending !== undefined) {
				set.enableBotTrending = ps.enableBotTrending;
			}

			if (ps.maintainerName !== undefined) {
				set.maintainerName = ps.maintainerName;
			}

			if (ps.maintainerEmail !== undefined) {
				set.maintainerEmail = ps.maintainerEmail;
			}

			if (Array.isArray(ps.langs)) {
				set.langs = ps.langs.filter(Boolean);
			}

			if (ps.enableEmail !== undefined) {
				set.enableEmail = ps.enableEmail;
			}

			if (ps.email !== undefined) {
				set.email = ps.email;
			}

			if (ps.smtpSecure !== undefined) {
				set.smtpSecure = ps.smtpSecure;
			}

			if (ps.smtpHost !== undefined) {
				set.smtpHost = ps.smtpHost;
			}

			if (ps.smtpPort !== undefined) {
				set.smtpPort = ps.smtpPort;
			}

			if (ps.smtpUser !== undefined) {
				set.smtpUser = ps.smtpUser;
			}

			if (ps.smtpPass !== undefined) {
				set.smtpPass = ps.smtpPass;
			}

			if (ps.enableServiceWorker !== undefined) {
				set.enableServiceWorker = ps.enableServiceWorker;
			}

			if (ps.swPublicKey !== undefined) {
				set.swPublicKey = ps.swPublicKey;
			}

			if (ps.swPrivateKey !== undefined) {
				set.swPrivateKey = ps.swPrivateKey;
			}

			if (ps.tosUrl !== undefined) {
				set.termsOfServiceUrl = ps.tosUrl;
			}

			if (ps.repositoryUrl !== undefined) {
				set.repositoryUrl = ps.repositoryUrl && URL.canParse(ps.repositoryUrl) ? ps.repositoryUrl : null;
			}

			if (ps.feedbackUrl !== undefined) {
				set.feedbackUrl = ps.feedbackUrl;
			}

			if (ps.impressumUrl !== undefined) {
				set.impressumUrl = ps.impressumUrl;
			}

			if (ps.donationUrl !== undefined) {
				set.donationUrl = ps.donationUrl;
			}

			if (ps.privacyPolicyUrl !== undefined) {
				set.privacyPolicyUrl = ps.privacyPolicyUrl;
			}

			if (ps.inquiryUrl !== undefined) {
				set.inquiryUrl = ps.inquiryUrl;
			}

			if (ps.useObjectStorage !== undefined) {
				set.useObjectStorage = ps.useObjectStorage;
			}

			if (ps.objectStorageBaseUrl !== undefined) {
				set.objectStorageBaseUrl = ps.objectStorageBaseUrl;
			}

			if (ps.objectStorageBucket !== undefined) {
				set.objectStorageBucket = ps.objectStorageBucket;
			}

			if (ps.objectStoragePrefix !== undefined) {
				set.objectStoragePrefix = ps.objectStoragePrefix;
			}

			if (ps.objectStorageEndpoint !== undefined) {
				set.objectStorageEndpoint = ps.objectStorageEndpoint;
			}

			if (ps.objectStorageRegion !== undefined) {
				set.objectStorageRegion = ps.objectStorageRegion;
			}

			if (ps.objectStoragePort !== undefined) {
				set.objectStoragePort = ps.objectStoragePort;
			}

			if (ps.objectStorageAccessKey !== undefined) {
				set.objectStorageAccessKey = ps.objectStorageAccessKey;
			}

			if (ps.objectStorageSecretKey !== undefined) {
				set.objectStorageSecretKey = ps.objectStorageSecretKey;
			}

			if (ps.objectStorageUseSSL !== undefined) {
				set.objectStorageUseSSL = ps.objectStorageUseSSL;
			}

			if (ps.objectStorageUseProxy !== undefined) {
				set.objectStorageUseProxy = ps.objectStorageUseProxy;
			}

			if (ps.objectStorageSetPublicRead !== undefined) {
				set.objectStorageSetPublicRead = ps.objectStorageSetPublicRead;
			}

			if (ps.objectStorageS3ForcePathStyle !== undefined) {
				set.objectStorageS3ForcePathStyle = ps.objectStorageS3ForcePathStyle;
			}

			if (ps.translationTimeout !== undefined) {
				set.translationTimeout = ps.translationTimeout;
			}

			if (ps.deeplAuthKey !== undefined) {
				if (ps.deeplAuthKey === '') {
					set.deeplAuthKey = null;
				} else {
					set.deeplAuthKey = ps.deeplAuthKey;
				}
			}

			if (ps.deeplIsPro !== undefined) {
				set.deeplIsPro = ps.deeplIsPro;
			}

			if (ps.deeplFreeMode !== undefined) {
				set.deeplFreeMode = ps.deeplFreeMode;
			}

			if (ps.deeplFreeInstance !== undefined) {
				if (ps.deeplFreeInstance === '') {
					set.deeplFreeInstance = null;
				} else {
					set.deeplFreeInstance = ps.deeplFreeInstance;
				}
			}

			if (ps.libreTranslateURL !== undefined) {
				if (ps.libreTranslateURL === '') {
					set.libreTranslateURL = null;
				} else {
					set.libreTranslateURL = ps.libreTranslateURL;
				}
			}

			if (ps.libreTranslateKey !== undefined) {
				if (ps.libreTranslateKey === '') {
					set.libreTranslateKey = null;
				} else {
					set.libreTranslateKey = ps.libreTranslateKey;
				}
			}

			if (ps.enableIpLogging !== undefined) {
				set.enableIpLogging = ps.enableIpLogging;
			}

			if (ps.enableActiveEmailValidation !== undefined) {
				set.enableActiveEmailValidation = ps.enableActiveEmailValidation;
			}

			if (ps.enableVerifymailApi !== undefined) {
				set.enableVerifymailApi = ps.enableVerifymailApi;
			}

			if (ps.verifymailAuthKey !== undefined) {
				if (ps.verifymailAuthKey === '') {
					set.verifymailAuthKey = null;
				} else {
					set.verifymailAuthKey = ps.verifymailAuthKey;
				}
			}

			if (ps.enableTruemailApi !== undefined) {
				set.enableTruemailApi = ps.enableTruemailApi;
			}

			if (ps.truemailInstance !== undefined) {
				if (ps.truemailInstance === '') {
					set.truemailInstance = null;
				} else {
					set.truemailInstance = ps.truemailInstance;
				}
			}

			if (ps.truemailAuthKey !== undefined) {
				if (ps.truemailAuthKey === '') {
					set.truemailAuthKey = null;
				} else {
					set.truemailAuthKey = ps.truemailAuthKey;
				}
			}

			if (ps.enableChartsForRemoteUser !== undefined) {
				set.enableChartsForRemoteUser = ps.enableChartsForRemoteUser;
			}

			if (ps.enableChartsForFederatedInstances !== undefined) {
				set.enableChartsForFederatedInstances = ps.enableChartsForFederatedInstances;
			}

			if (ps.enableStatsForFederatedInstances !== undefined) {
				set.enableStatsForFederatedInstances = ps.enableStatsForFederatedInstances;
			}

			if (ps.enableServerMachineStats !== undefined) {
				set.enableServerMachineStats = ps.enableServerMachineStats;
			}

			if (ps.enableAchievements !== undefined) {
				set.enableAchievements = ps.enableAchievements;
			}

			if (ps.robotsTxt !== undefined) {
				set.robotsTxt = ps.robotsTxt;
			}

			if (ps.enableIdenticonGeneration !== undefined) {
				set.enableIdenticonGeneration = ps.enableIdenticonGeneration;
			}

			if (ps.serverRules !== undefined) {
				set.serverRules = ps.serverRules;
			}

			if (ps.preservedUsernames !== undefined) {
				set.preservedUsernames = ps.preservedUsernames;
			}

			if (ps.bubbleInstances !== undefined) {
				set.bubbleInstances = ps.bubbleInstances;
			}

			if (ps.manifestJsonOverride !== undefined) {
				set.manifestJsonOverride = ps.manifestJsonOverride;
			}

			if (ps.enableFanoutTimeline !== undefined) {
				set.enableFanoutTimeline = ps.enableFanoutTimeline;
			}

			if (ps.enableFanoutTimelineDbFallback !== undefined) {
				set.enableFanoutTimelineDbFallback = ps.enableFanoutTimelineDbFallback;
			}

			if (ps.perLocalUserUserTimelineCacheMax !== undefined) {
				set.perLocalUserUserTimelineCacheMax = ps.perLocalUserUserTimelineCacheMax;
			}

			if (ps.perRemoteUserUserTimelineCacheMax !== undefined) {
				set.perRemoteUserUserTimelineCacheMax = ps.perRemoteUserUserTimelineCacheMax;
			}

			if (ps.perUserHomeTimelineCacheMax !== undefined) {
				set.perUserHomeTimelineCacheMax = ps.perUserHomeTimelineCacheMax;
			}

			if (ps.perUserListTimelineCacheMax !== undefined) {
				set.perUserListTimelineCacheMax = ps.perUserListTimelineCacheMax;
			}

			if (ps.enableReactionsBuffering !== undefined) {
				set.enableReactionsBuffering = ps.enableReactionsBuffering;
			}

			if (ps.notesPerOneAd !== undefined) {
				set.notesPerOneAd = ps.notesPerOneAd;
			}

			if (ps.bannedEmailDomains !== undefined) {
				set.bannedEmailDomains = ps.bannedEmailDomains;
			}

			if (ps.urlPreviewEnabled !== undefined) {
				set.urlPreviewEnabled = ps.urlPreviewEnabled;
			}

			if (ps.urlPreviewTimeout !== undefined) {
				set.urlPreviewTimeout = ps.urlPreviewTimeout;
			}

			if (ps.urlPreviewMaximumContentLength !== undefined) {
				set.urlPreviewMaximumContentLength = ps.urlPreviewMaximumContentLength;
			}

			if (ps.urlPreviewRequireContentLength !== undefined) {
				set.urlPreviewRequireContentLength = ps.urlPreviewRequireContentLength;
			}

			if (ps.urlPreviewUserAgent !== undefined) {
				const value = (ps.urlPreviewUserAgent ?? '').trim();
				set.urlPreviewUserAgent = value === '' ? null : ps.urlPreviewUserAgent;
			}

			if (ps.summalyProxy !== undefined || ps.urlPreviewSummaryProxyUrl !== undefined) {
				const value = ((ps.urlPreviewSummaryProxyUrl ?? ps.summalyProxy) ?? '').trim();
				set.urlPreviewSummaryProxyUrl = value === '' ? null : value;
			}

			if (Array.isArray(ps.trustedLinkUrlPatterns)) {
				set.trustedLinkUrlPatterns = ps.trustedLinkUrlPatterns.filter(Boolean);
			}

			if (ps.federation !== undefined) {
				set.federation = ps.federation;
			}

			if (ps.deliverSuspendedSoftware !== undefined) {
				set.deliverSuspendedSoftware = ps.deliverSuspendedSoftware;
			}

			if (ps.xAlgorithmConfig !== undefined) {
				const current = this.serverSettings.xAlgorithmConfig ?? defaultXAlgorithmConfig;
				set.xAlgorithmConfig = {
					...defaultXAlgorithmConfig,
					...current,
					...(ps.xAlgorithmConfig ?? {}),
				};
			}

			if (ps.aiNoteModerationConfig !== undefined) {
				const current = this.serverSettings.aiNoteModerationConfig ?? defaultAiNoteModerationConfig;
				const next = {
					...defaultAiNoteModerationConfig,
					...current,
					...(ps.aiNoteModerationConfig ?? {}),
				};
				// Keep existing apiKey when client sends empty/redacted placeholder
				const incomingKey = (ps.aiNoteModerationConfig as any)?.apiKey;
				if (incomingKey === '' || incomingKey === '<redacted>' || incomingKey == null) {
					next.apiKey = current.apiKey ?? null;
				}
				set.aiNoteModerationConfig = next;
			}

			if (ps.aiAbuseControlConfig !== undefined) {
				const current = this.serverSettings.aiAbuseControlConfig ?? defaultAiAbuseControlConfig;
				const next = {
					...defaultAiAbuseControlConfig,
					...current,
					...(ps.aiAbuseControlConfig ?? {}),
				};
				const incomingKey = (ps.aiAbuseControlConfig as any)?.apiKey;
				if (incomingKey === '' || incomingKey === '<redacted>' || incomingKey == null) {
					next.apiKey = current.apiKey ?? null;
				}
				set.aiAbuseControlConfig = next;
			}

			if (ps.aiTranslationConfig !== undefined) {
				const current = this.serverSettings.aiTranslationConfig ?? defaultAiTranslationConfig;
				const incoming = (ps.aiTranslationConfig ?? {}) as any;
				const mergeEp = (cur: any, inc: any) => {
					const base = { ...defaultAiTranslationEndpointConfig, ...(cur ?? {}), ...(inc ?? {}) };
					const k = inc?.apiKey;
					if (k === '' || k === '<redacted>' || k == null) {
						base.apiKey = cur?.apiKey ?? null;
					}
					return base;
				};
				set.aiTranslationConfig = {
					...defaultAiTranslationConfig,
					...current,
					...incoming,
					shared: mergeEp(current.shared, incoming.shared),
					notes: mergeEp(current.notes, incoming.notes),
					chat: mergeEp(current.chat, incoming.chat),
				};
			}

			if (Array.isArray(ps.federationHosts)) {
				set.federationHosts = ps.federationHosts.filter(Boolean).map(x => x.toLowerCase());
			}

			if (ps.allowUnsignedFetch !== undefined) {
				set.allowUnsignedFetch = ps.allowUnsignedFetch;
			}

			if (ps.enableProxyAccount !== undefined) {
				set.enableProxyAccount = ps.enableProxyAccount;
			}

			const before = Object.assign({}, this.serverSettings);
			const after = await this.metaService.update(set);

			this.moderationLogService.log(me, 'updateServerSettings', {
				before: sanitize(before),
				after: sanitize(after),
			});
		});
	}
}

function sanitize(meta: Partial<MiMeta & OnApplicationShutdown & OnApplicationBootstrap>): Partial<MiMeta> {
	meta = {
		...meta,
		hcaptchaSecretKey: '<redacted>',
		mcaptchaSecretKey: '<redacted>',
		recaptchaSecretKey: '<redacted>',
		turnstileSecretKey: '<redacted>',
		fcSecretKey: '<redacted>',
		smtpPass: '<redacted>',
		swPrivateKey: '<redacted>',
		objectStorageAccessKey: '<redacted>',
		objectStorageSecretKey: '<redacted>',
		xAlgorithmConfig: meta.xAlgorithmConfig == null ? undefined : {
			...meta.xAlgorithmConfig,
			apiKey: meta.xAlgorithmConfig.apiKey == null ? null : '<redacted>',
		},
		aiNoteModerationConfig: meta.aiNoteModerationConfig == null ? undefined : {
			...meta.aiNoteModerationConfig,
			apiKey: meta.aiNoteModerationConfig.apiKey == null ? null : '<redacted>',
		},
		aiAbuseControlConfig: meta.aiAbuseControlConfig == null ? undefined : {
			...meta.aiAbuseControlConfig,
			apiKey: meta.aiAbuseControlConfig.apiKey == null ? null : '<redacted>',
		},
		aiTranslationConfig: meta.aiTranslationConfig == null ? undefined : (() => {
			const redactEp = (ep: any) => ep == null ? ep : {
				...ep,
				apiKey: ep.apiKey == null ? null : '<redacted>',
			};
			return {
				...meta.aiTranslationConfig,
				shared: redactEp(meta.aiTranslationConfig.shared),
				notes: redactEp(meta.aiTranslationConfig.notes),
				chat: redactEp(meta.aiTranslationConfig.chat),
			};
		})(),
		deeplAuthKey: '<redacted>',
		libreTranslateKey: '<redacted>',
		verifymailAuthKey: '<redacted>',
		truemailAuthKey: '<redacted>',
		onApplicationBootstrap: undefined,
		onApplicationShutdown: undefined,
	};
	return meta;
}
