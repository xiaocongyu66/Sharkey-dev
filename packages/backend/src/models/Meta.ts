/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { type InstanceUnsignedFetchOption, instanceUnsignedFetchOptions } from '@/const.js';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export type XAlgorithmConfig = {
	enabled: boolean;
	strictOriginalExperience: boolean;
	homeMixerEndpoint: string | null;
	scoredPostsEndpoint: string | null;
	phoenixEndpoint: string | null;
	thunderEndpoint: string | null;
	groxEndpoint: string | null;
	apiKey: string | null;
	requestTimeoutMs: number;
	candidatesPerRequest: number;
	includeInNetwork: boolean;
	includeOutOfNetwork: boolean;
	enableGroxContentUnderstanding: boolean;
	enableAdsBlending: boolean;
	modelArtifactsPath: string | null;
	fallbackToSharkeyTimeline: boolean;
};

export const defaultXAlgorithmConfig: XAlgorithmConfig = {
	enabled: false,
	strictOriginalExperience: true,
	homeMixerEndpoint: null,
	scoredPostsEndpoint: null,
	phoenixEndpoint: null,
	thunderEndpoint: null,
	groxEndpoint: null,
	apiKey: null,
	requestTimeoutMs: 3000,
	candidatesPerRequest: 100,
	includeInNetwork: true,
	includeOutOfNetwork: true,
	enableGroxContentUnderstanding: true,
	enableAdsBlending: false,
	modelArtifactsPath: null,
	// Default true: dead/misconfigured gateway must not break home/hybrid TL
	fallbackToSharkeyTimeline: true,
};

/**
 * AI note moderation via OpenAI-compatible HTTP APIs
 * (chat/completions, responses, and generic /v1/* style bases).
 */
export type AiNoteModerationConfig = {
	/** Moderate local users' notes */
	enableLocalNotes: boolean;
	/** Moderate remote (federated) notes on ingest */
	enableRemoteNotes: boolean;
	/**
	 * OpenAI-compatible base URL ending with /v1 (or without; /v1 is appended).
	 * Examples: https://api.openai.com/v1 , https://api.x.ai/v1 , self-hosted gateway
	 */
	baseUrl: string | null;
	apiKey: string | null;
	/** Model id as required by the provider */
	model: string;
	/**
	 * chat.completions → POST {base}/chat/completions
	 * responses → POST {base}/responses
	 * auto → try chat.completions then responses
	 */
	apiStyle: 'chat.completions' | 'responses' | 'auto';
	requestTimeoutMs: number;
	/** Extra system instructions (optional) */
	systemPrompt: string | null;
	/**
	 * When AI flags content:
	 * reject = block create (local); remote may soft-hide instead if failOpen-like
	 * cw = force content warning
	 * hide = mark note isHidden
	 * home = downgrade public → home
	 */
	action: 'reject' | 'cw' | 'hide' | 'home';
	/** If AI call fails, allow the note (true) or block (false) */
	failOpen: boolean;
};

export const defaultAiNoteModerationConfig: AiNoteModerationConfig = {
	enableLocalNotes: false,
	enableRemoteNotes: false,
	baseUrl: null,
	apiKey: null,
	model: 'gpt-4o-mini',
	apiStyle: 'auto',
	requestTimeoutMs: 8000,
	systemPrompt: null,
	action: 'reject',
	failOpen: true,
};

/**
 * AI-assisted multi-account / abuse control (separate API key & switch from note mod).
 * Links accounts by real IP + browser fingerprint; AI judges behavior patterns.
 */
export type AiAbuseControlConfig = {
	/** Master switch for this feature */
	enabled: boolean;
	/** OpenAI-compatible base URL (/v1 optional) */
	baseUrl: string | null;
	/** Dedicated API key (not shared with note moderation) */
	apiKey: string | null;
	model: string;
	apiStyle: 'chat.completions' | 'responses' | 'auto';
	requestTimeoutMs: number;
	systemPrompt: string | null;
	/** If AI/API fails: true = do nothing; false = still apply heuristic-only suspend when over thresholds */
	failOpen: boolean;
	/** Run check after successful sign-in */
	checkOnSignin: boolean;
	/** Run check after registration completes */
	checkOnSignup: boolean;
	/** Minimum distinct local accounts sharing IP or fingerprint before AI/heuristic fires */
	minLinkedAccounts: number;
	/** Sign-in success count window (minutes) for burst detection */
	signinWindowMinutes: number;
	/** Max successful sign-ins in window (across linked accounts) before risk */
	maxSigninsInWindow: number;
	/** When true, auto-suspend all linked non-moderator local accounts if AI flags or heuristic hard-trip */
	autoSuspend: boolean;
	/** Pass hideNotes to UserSuspendService */
	hideNotesOnSuspend: boolean;
	/** Cooldown seconds before re-checking the same userId */
	cooldownSeconds: number;
};

export const defaultAiAbuseControlConfig: AiAbuseControlConfig = {
	enabled: false,
	baseUrl: null,
	apiKey: null,
	model: 'gpt-4o-mini',
	apiStyle: 'auto',
	requestTimeoutMs: 10000,
	systemPrompt: null,
	failOpen: true,
	checkOnSignin: true,
	checkOnSignup: true,
	minLinkedAccounts: 3,
	signinWindowMinutes: 60,
	maxSigninsInWindow: 20,
	autoSuspend: false,
	hideNotesOnSuspend: true,
	cooldownSeconds: 300,
};

/**
 * OpenAI-compatible endpoint credentials for AI translation.
 */
export type AiTranslationEndpointConfig = {
	baseUrl: string | null;
	apiKey: string | null;
	model: string;
	apiStyle: 'chat.completions' | 'responses' | 'auto';
	systemPrompt: string | null;
	requestTimeoutMs: number;
};

/**
 * Instance AI translation: notes + chat, shared or separate credentials.
 * Users may optionally supply their own API key (see UserProfile.aiTranslationConfig).
 */
export type AiTranslationConfig = {
	/** Allow translating notes/posts via AI */
	enableNotes: boolean;
	/** Allow translating chat / room messages via AI */
	enableChat: boolean;
	/**
	 * When true, notes and chat both use `shared`.
	 * When false, notes use `notes` and chat uses `chat`.
	 */
	useSharedCredentials: boolean;
	shared: AiTranslationEndpointConfig;
	notes: AiTranslationEndpointConfig;
	chat: AiTranslationEndpointConfig;
	/** Let users store and use their own API key / base / model */
	allowUserApiKey: boolean;
	/**
	 * When AI and classic (DeepL/Libre) are both available for notes,
	 * prefer AI first.
	 */
	preferAiOverClassic: boolean;
	/**
	 * Use direct/uncensored translator system prompt (SillyTavern-style:
	 * translate only, no moralizing refusals).
	 */
	uncensored: boolean;
	/**
	 * Default selective translation: only translate parts that are not already
	 * in the target language (e.g. EN→ZH in mixed CN+EN text).
	 */
	selectiveByDefault: boolean;
};

export const defaultAiTranslationEndpointConfig: AiTranslationEndpointConfig = {
	baseUrl: null,
	apiKey: null,
	model: 'gpt-4o-mini',
	apiStyle: 'auto',
	systemPrompt: null,
	requestTimeoutMs: 20000,
};

export const defaultAiTranslationConfig: AiTranslationConfig = {
	enableNotes: false,
	enableChat: false,
	useSharedCredentials: true,
	shared: { ...defaultAiTranslationEndpointConfig },
	notes: { ...defaultAiTranslationEndpointConfig },
	chat: { ...defaultAiTranslationEndpointConfig },
	allowUserApiKey: true,
	preferAiOverClassic: true,
	uncensored: true,
	selectiveByDefault: true,
};

@Entity('meta')
export class MiMeta {
	@PrimaryColumn({
		type: 'varchar',
		length: 32,
	})
	public id: string;

	@Column({
		...id(),
		nullable: true,
	})
	public rootUserId: MiUser['id'] | null;

	@ManyToOne(type => MiUser, {
		onDelete: 'SET NULL',
		nullable: true,
	})
	public rootUser: MiUser | null;

	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public name: string | null;

	@Column('varchar', {
		length: 64, nullable: true,
	})
	public shortName: string | null;

	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public description: string | null;

	@Column('text', {
		nullable: true,
	})
	public about: string | null;

	/**
	 * メンテナの名前
	 */
	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public maintainerName: string | null;

	/**
	 * メンテナの連絡先
	 */
	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public maintainerEmail: string | null;

	@Column('boolean', {
		default: true,
	})
	public disableRegistration: boolean;

	/** When true, local users cannot create notes (site-wide post ban). */
	@Column('boolean', {
		default: false,
	})
	public disableLocalNoteCreation: boolean;

	/**
	 * When true, remote (federated) notes are hidden from everyone except
	 * moderators and administrators (timelines, search, AP-facing packs, etc.).
	 * Staff can still manage them in admin notes UI.
	 */
	@Column('boolean', {
		default: false,
	})
	public blockRemoteNotes: boolean;

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public langs: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public pinnedUsers: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public hiddenTags: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public blockedHosts: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public sensitiveWords: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public prohibitedWords: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public prohibitedWordsForNameOfUser: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public silencedHosts: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public mediaSilencedHosts: string[];

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public themeColor: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mascotImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public bannerUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public backgroundImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public logoImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public iconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public app192IconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public app512IconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public sidebarLogoUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public serverErrorImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public notFoundImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public infoImageUrl: string | null;

	@Column('boolean', {
		default: false,
	})
	public cacheRemoteFiles: boolean;

	@Column('boolean', {
		default: true,
	})
	public cacheRemoteSensitiveFiles: boolean;

	@Column('boolean', {
		default: false,
	})
	public emailRequiredForSignup: boolean;

	@Column('boolean', {
		default: false,
	})
	public approvalRequiredForSignup: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableHcaptcha: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public hcaptchaSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public hcaptchaSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableMcaptcha: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mcaptchaSitekey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mcaptchaSecretKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mcaptchaInstanceUrl: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableRecaptcha: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public recaptchaSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public recaptchaSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableTurnstile: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public turnstileSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public turnstileSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableFC: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public fcSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public fcSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableTestcaptcha: boolean;

	// chaptcha系を追加した際にはnodeinfoのレスポンスに追加するのを忘れないようにすること

	@Column('enum', {
		enum: ['none', 'all', 'local', 'remote'],
		default: 'none',
	})
	public sensitiveMediaDetection: 'none' | 'all' | 'local' | 'remote';

	@Column('enum', {
		enum: ['medium', 'low', 'high', 'veryLow', 'veryHigh'],
		default: 'medium',
	})
	public sensitiveMediaDetectionSensitivity: 'medium' | 'low' | 'high' | 'veryLow' | 'veryHigh';

	@Column('boolean', {
		default: false,
	})
	public setSensitiveFlagAutomatically: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableSensitiveMediaDetectionForVideos: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableBotTrending: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableEmail: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public email: string | null;

	@Column('boolean', {
		default: false,
	})
	public smtpSecure: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public smtpHost: string | null;

	@Column('integer', {
		nullable: true,
	})
	public smtpPort: number | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public smtpUser: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public smtpPass: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableServiceWorker: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public swPublicKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public swPrivateKey: string | null;

	@Column('integer', {
		default: 5000,
		comment: 'Timeout in milliseconds for translation API requests',
	})
	public translationTimeout: number;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public deeplAuthKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public deeplIsPro: boolean;

	@Column('boolean', {
		default: false,
	})
	public deeplFreeMode: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public deeplFreeInstance: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public libreTranslateURL: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public libreTranslateKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public termsOfServiceUrl: string | null;

	@Column('varchar', {
		length: 1024,
		default: 'https://activitypub.software/TransFem-org/Sharkey/',
		nullable: true,
	})
	public repositoryUrl: string | null;

	@Column('varchar', {
		length: 1024,
		default: 'https://activitypub.software/TransFem-org/Sharkey/-/issues/new',
		nullable: true,
	})
	public feedbackUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public impressumUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public privacyPolicyUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public donationUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public inquiryUrl: string | null;

	@Column('varchar', {
		length: 8192,
		nullable: true,
	})
	public defaultLightTheme: string | null;

	@Column('varchar', {
		length: 8192,
		nullable: true,
	})
	public defaultDarkTheme: string | null;

	@Column('boolean', {
		default: false,
	})
	public useObjectStorage: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageBucket: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStoragePrefix: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageBaseUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageEndpoint: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageRegion: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageAccessKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageSecretKey: string | null;

	@Column('integer', {
		nullable: true,
	})
	public objectStoragePort: number | null;

	@Column('boolean', {
		default: true,
	})
	public objectStorageUseSSL: boolean;

	@Column('boolean', {
		default: true,
	})
	public objectStorageUseProxy: boolean;

	@Column('boolean', {
		default: false,
	})
	public objectStorageSetPublicRead: boolean;

	@Column('boolean', {
		default: true,
	})
	public objectStorageS3ForcePathStyle: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableIpLogging: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableActiveEmailValidation: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableVerifymailApi: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public verifymailAuthKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableTruemailApi: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public truemailInstance: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public truemailAuthKey: string | null;

	@Column('boolean', {
		default: true,
	})
	public enableChartsForRemoteUser: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableChartsForFederatedInstances: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableStatsForFederatedInstances: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableServerMachineStats: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableIdenticonGeneration: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableAchievements: boolean;

	@Column('text', {
		nullable: true,
	})
	public robotsTxt: string | null;

	@Column('jsonb', {
		default: { },
	})
	public policies: Record<string, any>;

	@Column('text', {
		array: true,
		default: '{}',
	})
	public serverRules: string[];

	@Column('varchar', {
		length: 8192,
		default: '{}',
	})
	public manifestJsonOverride: string;

	@Column('varchar', {
		length: 1024,
		array: true,
		default: '{}',
	})
	public bannedEmailDomains: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{admin,administrator,root,system,maintainer,host,mod,moderator,owner,superuser,staff,auth,i,me,everyone,all,mention,mentions,example,user,users,account,accounts,official,help,helps,support,supports,info,information,informations,announce,announces,announcement,announcements,notice,notification,notifications,dev,developer,developers,tech,misskey}',
	})
	public preservedUsernames: string[];

	@Column('boolean', {
		default: true,
	})
	public enableFanoutTimeline: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableFanoutTimelineDbFallback: boolean;

	@Column('integer', {
		default: 800,
	})
	public perLocalUserUserTimelineCacheMax: number;

	@Column('integer', {
		default: 800,
	})
	public perRemoteUserUserTimelineCacheMax: number;

	@Column('integer', {
		default: 800,
	})
	public perUserHomeTimelineCacheMax: number;

	@Column('integer', {
		default: 800,
	})
	public perUserListTimelineCacheMax: number;

	@Column('boolean', {
		default: false,
	})
	public enableReactionsBuffering: boolean;

	@Column('integer', {
		default: 0,
	})
	public notesPerOneAd: number;

	@Column('varchar', {
		length: 500,
		default: '❤️',
	})
	public defaultLike: string;

	@Column('varchar', {
		length: 256, array: true, default: '{}',
	})
	public bubbleInstances: string[];

	@Column('boolean', {
		default: true,
	})
	public urlPreviewEnabled: boolean;

	@Column('integer', {
		default: 10000,
	})
	public urlPreviewTimeout: number;

	@Column('bigint', {
		default: 1024 * 1024 * 10,
	})
	public urlPreviewMaximumContentLength: number;

	@Column('boolean', {
		default: false,
	})
	public urlPreviewRequireContentLength: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public urlPreviewSummaryProxyUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public urlPreviewUserAgent: string | null;

	@Column('varchar', {
		length: 3072,
		array: true,
		default: '{}',
		comment: 'An array of URL strings or regex that can be used to omit warnings about redirects to external sites. Separate them with spaces to specify AND, and enclose them with slashes to specify regular expressions. Each item is regarded as an OR.',
	})
	public trustedLinkUrlPatterns: string[];

	@Column('varchar', {
		length: 128,
		default: 'all',
	})
	public federation: 'all' | 'specified' | 'none';

	@Column('varchar', {
		length: 1024,
		array: true,
		default: '{}',
	})
	public federationHosts: string[];

	/**
	 * In combination with user.allowUnsignedFetch, controls enforcement of HTTP signatures for inbound ActivityPub fetches (GET requests).
	 */
	@Column('enum', {
		enum: instanceUnsignedFetchOptions,
		default: 'always',
	})
	public allowUnsignedFetch: InstanceUnsignedFetchOption;

	@Column('boolean', {
		default: false,
	})
	public enableProxyAccount: boolean;

	@Column('jsonb', {
		default: [],
	})
	public deliverSuspendedSoftware: SoftwareSuspension[];

	@Column('jsonb', {
		default: defaultXAlgorithmConfig,
	})
	public xAlgorithmConfig: XAlgorithmConfig;

	@Column('jsonb', {
		default: defaultAiNoteModerationConfig,
	})
	public aiNoteModerationConfig: AiNoteModerationConfig;

	@Column('jsonb', {
		default: defaultAiAbuseControlConfig,
	})
	public aiAbuseControlConfig: AiAbuseControlConfig;

	@Column('jsonb', {
		default: defaultAiTranslationConfig,
	})
	public aiTranslationConfig: AiTranslationConfig;

	/**
	 * Chat escrow (DM + rooms only; never notes/posts).
	 * When true and at least one key exists, new chat messages are sealed at rest.
	 */
	@Column('boolean', {
		default: true,
	})
	public chatEscrowEnabled: boolean;

	/** Active key id used for new messages (must exist in chatEscrowKeys or fallback cfg). */
	@Column('varchar', {
		length: 32,
		nullable: true,
	})
	public chatEscrowActiveKeyId: string | null;

	/**
	 * Escrow key ring: [{ id, secret, createdAt }].
	 * Secrets never returned by admin/meta (use dedicated chat-escrow endpoints).
	 */
	@Column('jsonb', {
		default: [],
	})
	public chatEscrowKeys: {
		id: string;
		secret: string;
		createdAt: string;
	}[];

	constructor(data?: Partial<MiMeta>) {
		if (data) {
			Object.assign(this, data);
		}
	}
}

export type SoftwareSuspension = {
	software: string,
	versionRange: string,
};
