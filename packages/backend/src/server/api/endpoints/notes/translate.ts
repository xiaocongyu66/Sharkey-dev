/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { URLSearchParams } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { GetterService } from '@/server/api/GetterService.js';
import type { MiMeta, MiNote, MiUserProfile } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { hasText } from '@/models/Note.js';
import { ApiLoggerService } from '@/server/api/ApiLoggerService.js';
import { NoteVisibilityService } from '@/core/NoteVisibilityService.js';
import { CacheManagementService, type ManagedRedisKVCache } from '@/global/CacheManagementService.js';
import { ApiError } from '@/server/api/error.js';
import { bindThis } from '@/decorators.js';
import { AiTranslationError, AiTranslationService } from '@/core/AiTranslationService.js';
import type { UserProfilesRepository } from '@/models/_.js';

export const meta = {
	tags: ['notes'],

	requireCredential: 'optional',
	kind: 'read:account',
	requiredRolePolicy: 'canUseTranslator',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			sourceLang: { type: 'string', optional: true, nullable: false },
			text: { type: 'string', optional: true, nullable: false },
		},
	},

	errors: {
		unavailable: {
			message: 'Translate of notes unavailable.',
			code: 'UNAVAILABLE',
			id: '50a70314-2d8a-431b-b433-efa5cc56444c',
		},
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'bea9b03f-36e0-49c5-a4db-627a029f8971',
		},
		cannotTranslateInvisibleNote: {
			message: 'Cannot translate invisible note.',
			code: 'CANNOT_TRANSLATE_INVISIBLE_NOTE',
			id: 'ea29f2ca-c368-43b3-aaf1-5ac3e74bbe5d',
		},
		translationFailed: {
			message: 'Failed to translate note. Please try again later or contact an administrator for assistance.',
			code: 'TRANSLATION_FAILED',
			id: '4e7a1a4f-521c-4ba2-b10a-69e5e2987b2f',
		},
		aiNotConfigured: {
			message: 'AI translation is not configured (missing endpoint or API key).',
			code: 'AI_NOT_CONFIGURED',
			id: 'a1t0c0n1-0001-4000-8000-000000000001',
			kind: 'server',
			httpStatusCode: 503,
		},
		aiAuthFailed: {
			message: 'AI provider rejected the API key (HTTP 401).',
			code: 'AI_AUTH_FAILED',
			id: 'a1t0c0n1-0001-4000-8000-000000000401',
			kind: 'server',
			httpStatusCode: 502,
		},
		aiForbidden: {
			message: 'AI provider denied access (HTTP 403).',
			code: 'AI_FORBIDDEN',
			id: 'a1t0c0n1-0001-4000-8000-000000000403',
			kind: 'server',
			httpStatusCode: 502,
		},
		aiRateLimited: {
			message: 'AI provider rate limit exceeded (HTTP 429).',
			code: 'AI_RATE_LIMITED',
			id: 'a1t0c0n1-0001-4000-8000-000000000429',
			kind: 'client',
			httpStatusCode: 429,
		},
		aiTimeout: {
			message: 'AI translation timed out.',
			code: 'AI_TIMEOUT',
			id: 'a1t0c0n1-0001-4000-8000-000000000408',
			kind: 'server',
			httpStatusCode: 504,
		},
		aiUpstreamError: {
			message: 'AI provider returned an error.',
			code: 'AI_UPSTREAM_ERROR',
			id: 'a1t0c0n1-0001-4000-8000-000000000502',
			kind: 'server',
			httpStatusCode: 502,
		},
		aiEmptyResponse: {
			message: 'AI returned an empty translation.',
			code: 'AI_EMPTY_RESPONSE',
			id: 'a1t0c0n1-0001-4000-8000-000000000204',
			kind: 'server',
			httpStatusCode: 502,
		},
		aiScopeDisabled: {
			message: 'AI translation is disabled for notes.',
			code: 'AI_SCOPE_DISABLED',
			id: 'a1t0c0n1-0001-4000-8000-000000000503',
			kind: 'client',
			httpStatusCode: 403,
		},
	},

	// 10 calls per 5 seconds
	limit: {
		duration: 1000 * 5,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		targetLang: { type: 'string' },
		/** Prefer AI path when available */
		preferAi: { type: 'boolean' },
		/** Selective mixed-language translation (AI only) */
		selective: { type: 'boolean' },
	},
	required: ['noteId', 'targetLang'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	private readonly translationsCache: ManagedRedisKVCache<CachedTranslationEntity>;

	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private getterService: GetterService,
		private httpRequestService: HttpRequestService,
		private readonly loggerService: ApiLoggerService,
		private readonly noteVisibilityService: NoteVisibilityService,
		private readonly aiTranslationService: AiTranslationService,

		cacheManagementService: CacheManagementService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			const { accessible } = await this.noteVisibilityService.checkNoteVisibilityAsync(note, me);
			if (!accessible) {
				throw new ApiError(meta.errors.cannotTranslateInvisibleNote);
			}

			if (!hasText(note)) {
				return {};
			}

			const canDeeplFree = this.serverSettings.deeplFreeMode && !!this.serverSettings.deeplFreeInstance;
			const canDeepl = !!this.serverSettings.deeplAuthKey || canDeeplFree;
			const canLibre = !!this.serverSettings.libreTranslateURL;

			let profile: MiUserProfile | null = null;
			if (me) {
				profile = await this.userProfilesRepository.findOneBy({ userId: me.id });
			}
			const userOverride = this.aiTranslationService.profileToOverride(profile);
			const canAi = this.aiTranslationService.isAvailable('notes', userOverride);

			if (!canDeepl && !canLibre && !canAi) throw new ApiError(meta.errors.unavailable);

			let targetLang = ps.targetLang;
			if (userOverride?.targetLang) targetLang = userOverride.targetLang;
			const classicLang = targetLang.includes('-') ? targetLang.split('-')[0] : targetLang;
			// User mother tongue: profile.lang → UI target → request
			const nativeLang = (profile?.lang?.trim() || userOverride?.targetLang?.trim() || targetLang) as string;

			const aiCfg = this.aiTranslationService.getConfig();
			const selective = ps.selective ?? userOverride?.selective ?? aiCfg.selectiveByDefault;
			const preferAi = ps.preferAi ?? aiCfg.preferAiOverClassic;
			const useAi = canAi && (preferAi || !canDeepl && !canLibre);

			// Content-hash cache: same text → same translation (admin TTL)
			const textHash = createHash('sha256').update(note.text.replace(/\r\n/g, '\n').trim(), 'utf8').digest('hex');
			const cacheKey = useAi
				? `${textHash}|${targetLang}|${selective ? 's' : 'f'}|notes|ai`
				: `${textHash}|${classicLang}|classic`;
			const cacheTtlMs = this.aiTranslationService.resolveCacheTtlMs(aiCfg);
			const cacheOn = aiCfg.cacheEnabled !== false;

			let response = cacheOn ? await this.getCachedByKey(cacheKey) : null;
			if (!response) {
				this.loggerService.logger.debug(`Fetching new translation for note=${note.id} lang=${targetLang} hash=${textHash.slice(0, 12)}`);
				response = await this.fetchTranslation(note, targetLang, classicLang, {
					canAi,
					preferAi: useAi,
					canDeepl,
					canLibre,
					userOverride,
					selective: selective === true,
					nativeLang,
				});
				if (!response) {
					throw new ApiError(meta.errors.translationFailed);
				}

				if (cacheOn) {
					await this.setCachedByKey(cacheKey, response, cacheTtlMs);
				}
			}
			return response;
		});

		// Floor 1m; per-entry TTL from admin cacheTtlSeconds
		this.translationsCache = cacheManagementService.createRedisKVCache<CachedTranslationEntity>('translations', {
			lifetime: 1000 * 60,
			memoryCacheLifetime: 1000 * 60,
		});
	}

	private async fetchTranslation(
		note: MiNote & { text: string },
		targetLang: string,
		classicLang: string,
		opts: {
			canAi: boolean;
			preferAi: boolean;
			canDeepl: boolean;
			canLibre: boolean;
			userOverride: ReturnType<AiTranslationService['profileToOverride']>;
			nativeLang?: string;
			selective: boolean;
		},
	) {
		const tryAi = async () => {
			if (!opts.canAi) return null;
			const r = await this.aiTranslationService.translate({
				text: note.text,
				targetLang,
				scope: 'notes',
				selective: opts.selective,
				userOverride: opts.userOverride,
				nativeLang: opts.nativeLang,
			});
			if (!r?.text) return null;
			return {
				sourceLang: r.sourceLang,
				text: r.text,
			};
		};

		const tryClassic = async () => {
			return await this.fetchClassic(note, classicLang);
		};

		const mapAiError = (e: unknown): never => {
			if (e instanceof AiTranslationError) {
				const table: Record<AiTranslationError['code'], typeof meta.errors[keyof typeof meta.errors]> = {
					AI_NOT_CONFIGURED: meta.errors.aiNotConfigured,
					AI_AUTH_FAILED: meta.errors.aiAuthFailed,
					AI_FORBIDDEN: meta.errors.aiForbidden,
					AI_RATE_LIMITED: meta.errors.aiRateLimited,
					AI_TIMEOUT: meta.errors.aiTimeout,
					AI_UPSTREAM_ERROR: meta.errors.aiUpstreamError,
					AI_EMPTY_RESPONSE: meta.errors.aiEmptyResponse,
					AI_SCOPE_DISABLED: meta.errors.aiScopeDisabled,
				};
				throw new ApiError(table[e.code] ?? meta.errors.translationFailed, {
					httpStatus: e.httpStatus,
					detail: e.message,
				});
			}
			throw e;
		};

		try {
			if (opts.preferAi && opts.canAi) {
				try {
					const ai = await tryAi();
					if (ai) return ai;
				} catch (e) {
					// Prefer surfacing auth/config errors over silent classic fallback
					if (e instanceof AiTranslationError && (
						e.code === 'AI_AUTH_FAILED'
						|| e.code === 'AI_FORBIDDEN'
						|| e.code === 'AI_NOT_CONFIGURED'
						|| e.code === 'AI_SCOPE_DISABLED'
					)) {
						mapAiError(e);
					}
					// Other AI failures: try classic, then rethrow AI error if classic missing
					const classic = await tryClassic();
					if (classic) return classic;
					mapAiError(e);
				}
				const classic = await tryClassic();
				if (classic) return classic;
			} else {
				const classic = await tryClassic();
				if (classic) return classic;
				try {
					const ai = await tryAi();
					if (ai) return ai;
				} catch (e) {
					mapAiError(e);
				}
			}
		} catch (e) {
			if (e instanceof ApiError) throw e;
			if (e instanceof AiTranslationError) mapAiError(e);
			this.loggerService.logger.error('Unhandled error from translation API: ', { e });
		}

		return null;
	}

	private async fetchClassic(note: MiNote & { text: string }, targetLang: string) {
		try {
			// Ignore deeplFreeInstance unless deeplFreeMode is set
			const deeplFreeInstance = this.serverSettings.deeplFreeMode ? this.serverSettings.deeplFreeInstance : null;

			// DeepL/DeepLX handling
			if (this.serverSettings.deeplAuthKey || deeplFreeInstance) {
				const params = new URLSearchParams();
				params.append('text', note.text);
				params.append('target_lang', targetLang);
				const headers: Record<string, string> = {
					'Content-Type': 'application/x-www-form-urlencoded',
					Accept: 'application/json, */*',
				};
				if (this.serverSettings.deeplAuthKey) headers['Authorization'] = `DeepL-Auth-Key ${this.serverSettings.deeplAuthKey}`;
				const endpoint = deeplFreeInstance ?? ( this.serverSettings.deeplIsPro ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate' );

				const res = await this.httpRequestService.send(endpoint, {
					method: 'POST',
					headers,
					body: params.toString(),
					timeout: this.serverSettings.translationTimeout,
				});
				if (this.serverSettings.deeplAuthKey) {
					const json = (await res.json()) as {
						translations: {
							detected_source_language: string;
							text: string;
						}[];
					};

					return {
						sourceLang: json.translations[0].detected_source_language,
						text: json.translations[0].text,
					};
				} else {
					const json = (await res.json()) as {
						code: number,
						message: string,
						data: string,
						source_lang: string,
						target_lang: string,
						alternatives: string[],
					};

					const languageNames = new Intl.DisplayNames(['en'], {
						type: 'language',
					});

					return {
						sourceLang: languageNames.of(json.source_lang),
						text: json.data,
					};
				}
			}

			// LibreTranslate handling
			if (this.serverSettings.libreTranslateURL) {
				const res = await this.httpRequestService.send(this.serverSettings.libreTranslateURL, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json, */*',
					},
					body: JSON.stringify({
						q: note.text,
						source: 'auto',
						target: targetLang,
						format: 'text',
						api_key: this.serverSettings.libreTranslateKey ?? '',
					}),
					timeout: this.serverSettings.translationTimeout,
				});

				const json = (await res.json()) as {
					alternatives: string[],
					detectedLanguage: { [key: string]: string | number },
					translatedText: string,
				};

				const languageNames = new Intl.DisplayNames(['en'], {
					type: 'language',
				});

				return {
					sourceLang: languageNames.of(json.detectedLanguage.language as string),
					text: json.translatedText,
				};
			}
		} catch (e) {
			this.loggerService.logger.error('Unhandled error from classic translation API: ', { e });
		}

		return null;
	}

	@bindThis
	private async getCachedByKey(cacheKey: string): Promise<CachedTranslation | null> {
		const cached = await this.translationsCache.get(cacheKey);
		if (cached?.t) {
			return {
				sourceLang: cached.l,
				text: cached.t,
			};
		}
		return null;
	}

	@bindThis
	private async setCachedByKey(cacheKey: string, translation: CachedTranslation, ttlMs: number): Promise<void> {
		await this.translationsCache.set(cacheKey, {
			l: translation.sourceLang,
			t: translation.text,
		}, ttlMs);
	}
}

interface CachedTranslation {
	sourceLang: string | undefined;
	text: string | undefined;
}

interface CachedTranslationEntity {
	l?: string;
	t?: string;
	u?: number;
}
