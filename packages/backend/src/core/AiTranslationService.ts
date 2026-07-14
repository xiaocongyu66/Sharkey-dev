/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/Meta.js';
import {
	defaultAiTranslationConfig,
	defaultAiTranslationEndpointConfig,
	type AiTranslationConfig,
	type AiTranslationEndpointConfig,
} from '@/models/Meta.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { Logger } from '@/logger.js';

export type AiTranslationScope = 'notes' | 'chat';

export type AiTranslationUserOverride = {
	targetLang?: string | null;
	selective?: boolean | null;
	baseUrl?: string | null;
	apiKey?: string | null;
	model?: string | null;
} | null | undefined;

export type AiTranslateInput = {
	text: string;
	targetLang: string;
	scope: AiTranslationScope;
	/** selective: only translate segments not already in target language */
	selective?: boolean;
	userOverride?: AiTranslationUserOverride;
};

export type AiTranslateResult = {
	text: string;
	sourceLang?: string;
	provider: 'ai';
};

/**
 * Direct translator prompt (SillyTavern-inspired):
 * - No moralizing / refusal / safety lectures
 * - Output translation only
 * - Supports selective mixed-language translation
 */
const DEFAULT_SYSTEM_UNCENSORED = `You are a professional machine translation engine.
Your ONLY job is to translate text accurately and completely.
Rules:
1. Output ONLY the translated text. No preface, no quotes, no markdown fences, no explanations.
2. Do NOT refuse, lecture, moralize, or add content warnings. Never say you cannot translate.
3. Preserve meaning, tone, slang, profanity, and formatting (line breaks, emoji, URLs, @mentions, #hashtags, MFM/markdown syntax like **bold**, $[...], :emoji:).
4. Do not translate code blocks, URLs, or MFM/HTML tags themselves — keep them intact.
5. If the source is already fully in the target language, return it unchanged.
6. Never invent extra sentences or summarize.`;

const DEFAULT_SYSTEM_BASIC = `You are a translation engine. Translate the user text into the requested language. Output only the translation, no commentary.`;

@Injectable()
export class AiTranslationService {
	private readonly logger: Logger;

	constructor(
		@Inject(DI.meta)
		private readonly meta: MiMeta,

		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('ai-translate');
	}

	@bindThis
	public getConfig(): AiTranslationConfig {
		const c = this.meta.aiTranslationConfig;
		const mergeEp = (ep?: Partial<AiTranslationEndpointConfig> | null): AiTranslationEndpointConfig => ({
			...defaultAiTranslationEndpointConfig,
			...(ep ?? {}),
		});
		return {
			...defaultAiTranslationConfig,
			...(c ?? {}),
			shared: mergeEp(c?.shared),
			notes: mergeEp(c?.notes),
			chat: mergeEp(c?.chat),
		};
	}

	@bindThis
	public isScopeEnabled(scope: AiTranslationScope): boolean {
		const c = this.getConfig();
		return scope === 'notes' ? c.enableNotes === true : c.enableChat === true;
	}

	@bindThis
	public resolveEndpoint(
		scope: AiTranslationScope,
		userOverride?: AiTranslationUserOverride,
	): AiTranslationEndpointConfig | null {
		const c = this.getConfig();
		const inst = c.useSharedCredentials
			? c.shared
			: (scope === 'notes' ? c.notes : c.chat);

		// User-supplied credentials take priority when allowed and complete enough
		if (c.allowUserApiKey && userOverride?.apiKey && userOverride.apiKey.trim()) {
			const baseUrl = (userOverride.baseUrl && userOverride.baseUrl.trim())
				? userOverride.baseUrl.trim()
				: (inst.baseUrl?.trim() || null);
			if (!baseUrl) {
				// User key alone is not enough without a base URL
				return null;
			}
			return {
				baseUrl,
				apiKey: userOverride.apiKey.trim(),
				model: (userOverride.model && userOverride.model.trim())
					? userOverride.model.trim()
					: (inst.model || 'gpt-4o-mini'),
				apiStyle: inst.apiStyle || 'auto',
				systemPrompt: inst.systemPrompt,
				requestTimeoutMs: inst.requestTimeoutMs || 20000,
			};
		}

		if (inst.baseUrl && inst.baseUrl.trim() && inst.apiKey && inst.apiKey.trim() && inst.model) {
			return inst;
		}
		return null;
	}

	@bindThis
	public isAvailable(scope: AiTranslationScope, userOverride?: AiTranslationUserOverride): boolean {
		if (!this.isScopeEnabled(scope)) return false;
		return this.resolveEndpoint(scope, userOverride) != null;
	}

	/** Instance-level note AI available (ignores user key) — for public translatorAvailable */
	@bindThis
	public isInstanceNotesAvailable(): boolean {
		const c = this.getConfig();
		if (!c.enableNotes) return false;
		const ep = c.useSharedCredentials ? c.shared : c.notes;
		return !!(ep.baseUrl?.trim() && ep.apiKey?.trim() && ep.model?.trim());
	}

	@bindThis
	public isInstanceChatAvailable(): boolean {
		const c = this.getConfig();
		if (!c.enableChat) return false;
		const ep = c.useSharedCredentials ? c.shared : c.chat;
		return !!(ep.baseUrl?.trim() && ep.apiKey?.trim() && ep.model?.trim());
	}

	@bindThis
	public profileToOverride(profile: MiUserProfile | null | undefined): AiTranslationUserOverride {
		return profile?.aiTranslationConfig ?? null;
	}

	@bindThis
	public async translate(input: AiTranslateInput): Promise<AiTranslateResult | null> {
		const text = (input.text ?? '').trim();
		if (!text) return { text: '', provider: 'ai' };

		if (!this.isScopeEnabled(input.scope)) {
			return null;
		}

		const ep = this.resolveEndpoint(input.scope, input.userOverride);
		if (!ep) {
			this.logger.warn(`AI translation enabled for ${input.scope} but no credentials`);
			return null;
		}

		const c = this.getConfig();
		const selective = input.selective ?? input.userOverride?.selective ?? c.selectiveByDefault;
		const targetLang = this.normalizeLang(
			input.userOverride?.targetLang?.trim() || input.targetLang,
		);

		const system = this.buildSystemPrompt(ep, c);
		const userContent = this.buildUserContent(text, targetLang, selective === true);

		try {
			const raw = await this.callOpenAiCompatible(ep, system, userContent);
			const out = this.cleanOutput(raw);
			if (!out) return null;
			return {
				text: out,
				sourceLang: undefined,
				provider: 'ai',
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.warn(`AI translation failed: ${msg}`);
			return null;
		}
	}

	@bindThis
	private buildSystemPrompt(ep: AiTranslationEndpointConfig, c: AiTranslationConfig): string {
		if (ep.systemPrompt && ep.systemPrompt.trim()) {
			return ep.systemPrompt.trim();
		}
		return c.uncensored ? DEFAULT_SYSTEM_UNCENSORED : DEFAULT_SYSTEM_BASIC;
	}

	@bindThis
	private buildUserContent(text: string, targetLang: string, selective: boolean): string {
		const langName = this.langDisplay(targetLang);
		if (selective) {
			return [
				`Target language: ${langName} (${targetLang}).`,
				`Selective translation mode:`,
				`- Translate ONLY the parts written in other languages into ${langName}.`,
				`- Keep text that is already in ${langName} unchanged.`,
				`- For mixed bilingual content (e.g. Chinese + English), only convert the non-${langName} segments.`,
				`- Preserve original structure, punctuation, and untranslated segments in place.`,
				``,
				`Source text:`,
				text.slice(0, 14_000),
			].join('\n');
		}
		return [
			`Translate the following text into ${langName} (${targetLang}).`,
			`Output only the translation.`,
			``,
			text.slice(0, 14_000),
		].join('\n');
	}

	@bindThis
	private normalizeLang(lang: string): string {
		let t = (lang || 'en').trim().replace('_', '-');
		if (t.includes('-')) {
			// keep zh-CN / zh-TW useful for models; short code also ok
			const lower = t.toLowerCase();
			if (lower.startsWith('zh-hant') || lower.startsWith('zh-tw') || lower.startsWith('zh-hk')) return 'zh-TW';
			if (lower.startsWith('zh')) return 'zh-CN';
		}
		return t;
	}

	@bindThis
	private langDisplay(code: string): string {
		try {
			const names = new Intl.DisplayNames(['en'], { type: 'language' });
			return names.of(code) ?? code;
		} catch {
			return code;
		}
	}

	@bindThis
	private cleanOutput(raw: string): string {
		let s = (raw ?? '').trim();
		// strip common markdown fences
		s = s.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```$/i, '').trim();
		// strip accidental "Translation:" prefix
		s = s.replace(/^(?:translation|translated text)\s*:\s*/i, '').trim();
		// detect refusal-ish model output — treat as failure so caller can fallback
		if (this.looksLikeRefusal(s)) {
			this.logger.warn('AI translation looked like a refusal/policy message');
			return '';
		}
		return s;
	}

	@bindThis
	private looksLikeRefusal(s: string): boolean {
		if (s.length > 800 && /as an ai|i cannot|i'm unable|i am unable|against my|content policy|cannot assist/i.test(s)) {
			return true;
		}
		const lower = s.toLowerCase();
		const refusalStarts = [
			'i cannot',
			"i can't",
			'i am unable',
			"i'm unable",
			'as an ai',
			'sorry, i',
			'i must refuse',
			'i won\'t translate',
			'i will not translate',
		];
		// Only short outputs that are pure refusals
		if (s.length < 400) {
			for (const p of refusalStarts) {
				if (lower.startsWith(p)) return true;
			}
		}
		return false;
	}

	@bindThis
	private normalizeBaseUrl(baseUrl: string): string {
		let u = baseUrl.trim().replace(/\/+$/, '');
		if (!/\/v1$/i.test(u)) {
			u = `${u}/v1`;
		}
		return u;
	}

	@bindThis
	private async callOpenAiCompatible(
		ep: AiTranslationEndpointConfig,
		system: string,
		userContent: string,
	): Promise<string> {
		const base = this.normalizeBaseUrl(ep.baseUrl!);
		const timeoutMs = Math.max(1000, Math.min(ep.requestTimeoutMs || 20000, 120_000));
		const style = ep.apiStyle || 'auto';

		const tryChat = async () => {
			const url = `${base}/chat/completions`;
			const body = {
				model: ep.model,
				temperature: 0.2,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: userContent },
				],
			};
			return await this.fetchText(url, body, ep.apiKey!, timeoutMs);
		};

		const tryResponses = async () => {
			const url = `${base}/responses`;
			const body = {
				model: ep.model,
				temperature: 0.2,
				input: [
					{ role: 'system', content: system },
					{ role: 'user', content: userContent },
				],
			};
			return await this.fetchText(url, body, ep.apiKey!, timeoutMs);
		};

		if (style === 'chat.completions') return await tryChat();
		if (style === 'responses') return await tryResponses();
		try {
			return await tryChat();
		} catch (e1) {
			this.logger.debug(`chat.completions failed, trying responses: ${e1 instanceof Error ? e1.message : e1}`);
			return await tryResponses();
		}
	}

	@bindThis
	private async fetchText(url: string, body: unknown, apiKey: string, timeoutMs: number): Promise<string> {
		const controller = new AbortController();
		const t = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${apiKey}`,
					accept: 'application/json',
				},
				body: JSON.stringify(body),
				signal: controller.signal,
			});
			const text = await res.text();
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
			}
			let json: any;
			try {
				json = JSON.parse(text);
			} catch {
				return text;
			}
			const chatContent = json?.choices?.[0]?.message?.content;
			if (typeof chatContent === 'string') return chatContent;
			if (Array.isArray(chatContent)) {
				return chatContent.map((p: any) => p?.text ?? p?.content ?? '').join('');
			}
			if (typeof json?.output_text === 'string') return json.output_text;
			if (Array.isArray(json?.output)) {
				const bits: string[] = [];
				for (const item of json.output) {
					if (item?.type === 'message' && Array.isArray(item.content)) {
						for (const c of item.content) {
							if (typeof c?.text === 'string') bits.push(c.text);
							else if (typeof c?.content === 'string') bits.push(c.content);
						}
					}
				}
				if (bits.length) return bits.join('');
			}
			if (typeof json?.result === 'string') return json.result;
			if (typeof json?.content === 'string') return json.content;
			return text;
		} finally {
			clearTimeout(t);
		}
	}
}
