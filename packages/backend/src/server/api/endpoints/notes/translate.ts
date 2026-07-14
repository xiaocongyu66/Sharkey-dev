/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

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
import { AiTranslationService } from '@/core/AiTranslationService.js';
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
			if (targetLang.includes('-')) {
				// keep zh-CN/zh-TW for AI; classic engines often want short codes
			}
			const classicLang = targetLang.includes('-') ? targetLang.split('-')[0] : targetLang;

			const selective = ps.selective ?? userOverride?.selective ?? this.aiTranslationService.getConfig().selectiveByDefault;
			const preferAi = ps.preferAi ?? this.aiTranslationService.getConfig().preferAiOverClassic;
			// User key forces AI path
			const forceAi = !!(userOverride?.apiKey && userOverride.apiKey.trim());

			const cacheSuffix = canAi && (preferAi || forceAi || !canDeepl && !canLibre)
				? `ai:${selective ? 's' : 'f'}`
				: 'classic';
			const cacheLang = canAi && (preferAi || forceAi || !canDeepl && !canLibre) ? targetLang : classicLang;

			let response = await this.getCachedTranslation(note, `${cacheLang}@${cacheSuffix}`);
			if (!response) {
				this.loggerService.logger.debug(`Fetching new translation for note=${note.id} lang=${targetLang}`);
				response = await this.fetchTranslation(note, targetLang, classicLang, {
					canAi,
					preferAi: preferAi || forceAi,
					canDeepl,
					canLibre,
					userOverride,
					selective: selective === true,
				});
				if (!response) {
					throw new ApiError(meta.errors.translationFailed);
				}

				await this.setCachedTranslation(note, `${cacheLang}@${cacheSuffix}`, response);
			}
			return response;
		});

		this.translationsCache = cacheManagementService.createRedisKVCache<CachedTranslationEntity>('translations', {
			lifetime: 1000 * 60 * 60 * 24 * 7, // 1 week,
			memoryCacheLifetime: 1000 * 60, // 1 minute
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

		try {
			if (opts.preferAi && opts.canAi) {
				const ai = await tryAi();
				if (ai) return ai;
				// fallback classic
				const classic = await tryClassic();
				if (classic) return classic;
			} else {
				const classic = await tryClassic();
				if (classic) return classic;
				const ai = await tryAi();
				if (ai) return ai;
			}
		} catch (e) {
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
	private async getCachedTranslation(note: MiNote, targetLang: string): Promise<CachedTranslation | null> {
		const cacheKey = `${note.id}@${targetLang}`;

		// Use cached translation, if present and up-to-date
		const cached = await this.translationsCache.get(cacheKey);
		if (cached && cached.u === note.updatedAt?.valueOf()) {
			return {
				sourceLang: cached.l,
				text: cached.t,
			};
		}

		// No cache entry :(
		return null;
	}

	@bindThis
	private async setCachedTranslation(note: MiNote, targetLang: string, translation: CachedTranslation): Promise<void> {
		const cacheKey = `${note.id}@${targetLang}`;

		await this.translationsCache.set(cacheKey, {
			l: translation.sourceLang,
			t: translation.text,
			u: note.updatedAt?.valueOf(),
		});
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
