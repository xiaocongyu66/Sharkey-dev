/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/Meta.js';
import { defaultAiNoteModerationConfig, type AiNoteModerationConfig } from '@/models/Meta.js';
import type { MiUser } from '@/models/User.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { Logger } from '@/logger.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { assertSafeAiEndpointUrl, normalizeOpenAiV1Base } from '@/misc/ai-endpoint-url.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

export type AiNoteModerationInput = {
	text?: string | null;
	cw?: string | null;
	pollChoices?: string[] | null;
	/** Attached drive files (images used when includeImages is on) */
	files?: MiDriveFile[] | null;
	/** local user host === null */
	isRemote: boolean;
	userId: MiUser['id'];
};

export type AiNoteModerationResult = {
	/** Whether moderation should alter the note */
	flagged: boolean;
	reason?: string;
	/** Provider raw decision when available */
	raw?: string;
	/** Skip (disabled / not configured) */
	skipped?: boolean;
	/** AI call failed */
	error?: boolean;
};

const DEFAULT_SYSTEM = `You are a content moderation classifier for a microblogging server.
Decide if the user post should be flagged for violating community safety (spam, scams, severe harassment, CSAM, illegal weapons sales, gore, explicit sexual content involving minors, etc.).
When images are provided, review them as part of the post (text + images together).
Reply with ONLY a single JSON object, no markdown:
{"flagged":boolean,"reason":"short English reason or empty"}
Be conservative: do not flag ordinary opinions, jokes, memes, or mild language unless clearly abusive or illegal.`;

@Injectable()
export class AiNoteModerationService {
	private readonly logger: Logger;

	constructor(
		@Inject(DI.meta)
		private readonly meta: MiMeta,

		private readonly httpRequestService: HttpRequestService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('ai-note-mod');
	}

	@bindThis
	public getConfig(): AiNoteModerationConfig {
		const c = this.meta.aiNoteModerationConfig;
		return {
			...defaultAiNoteModerationConfig,
			...(c ?? {}),
		};
	}

	@bindThis
	public isEnabledFor(isRemote: boolean): boolean {
		const c = this.getConfig();
		if (isRemote) return c.enableRemoteNotes === true;
		return c.enableLocalNotes === true;
	}

	@bindThis
	public isConfigured(): boolean {
		const c = this.getConfig();
		return !!(c.baseUrl && c.baseUrl.trim() && c.apiKey && c.apiKey.trim() && c.model && c.model.trim());
	}

	/**
	 * Run AI moderation. Applies config action via returned flags;
	 * caller mutates note data / throws.
	 */
	@bindThis
	public async moderate(input: AiNoteModerationInput): Promise<AiNoteModerationResult> {
		if (!this.isEnabledFor(input.isRemote)) {
			return { flagged: false, skipped: true };
		}
		if (!this.isConfigured()) {
			this.logger.warn('AI note moderation enabled but baseUrl/apiKey/model missing');
			const c = this.getConfig();
			if (!c.failOpen) {
				throw new IdentifiableError(
					'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
					'AI moderation is not configured',
				);
			}
			return { flagged: false, skipped: true, error: true };
		}

		const textContent = this.buildUserContent(input);
		const imageUrls = this.collectImageUrls(input);
		// Skip empty text-only posts; image-only posts still moderated when vision is on
		if (!textContent.trim() && imageUrls.length === 0) {
			return { flagged: false, skipped: true };
		}

		try {
			const raw = await this.callOpenAiCompatible(textContent, imageUrls);
			const parsed = this.parseDecision(raw);
			return {
				flagged: parsed.flagged,
				reason: parsed.reason,
				raw,
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.warn(`AI moderation request failed: ${msg}`);
			const c = this.getConfig();
			if (!c.failOpen) {
				throw new IdentifiableError(
					'b2c3d4e5-f6a7-8901-bcde-f12345678901',
					'AI moderation temporarily unavailable',
				);
			}
			return { flagged: false, error: true };
		}
	}

	/**
	 * Apply action to note option-like object (mutates).
	 * Returns true if note was rejected (caller should throw).
	 */
	@bindThis
	public applyAction(
		data: {
			visibility?: string;
			cw?: string | null;
			isHidden?: boolean;
			mandatoryCW?: string | null;
		},
		result: AiNoteModerationResult,
		isRemote: boolean,
	): 'ok' | 'reject' {
		if (!result.flagged) return 'ok';
		const action = this.getConfig().action;
		const reason = (result.reason || 'AI moderation').slice(0, 200);

		switch (action) {
			case 'reject':
				// Remote reject can break federation hard; still honor config but log
				if (isRemote) {
					this.logger.info(`AI reject remote note: ${reason}`);
				}
				return 'reject';
			case 'cw': {
				const tag = `[AI] ${reason}`;
				if (data.cw == null || data.cw === '') {
					data.cw = tag;
				} else if (!data.cw.includes('[AI]')) {
					data.cw = `${data.cw} / ${tag}`;
				}
				return 'ok';
			}
			case 'hide':
				data.isHidden = true;
				return 'ok';
			case 'home':
				if (data.visibility === 'public') {
					data.visibility = 'home';
				}
				return 'ok';
			default:
				return 'ok';
		}
	}

	@bindThis
	private buildUserContent(input: AiNoteModerationInput): string {
		const parts: string[] = [];
		parts.push(`source: ${input.isRemote ? 'remote' : 'local'}`);
		parts.push(`userId: ${input.userId}`);
		if (input.cw) parts.push(`cw: ${input.cw}`);
		if (input.text) parts.push(`text: ${input.text}`);
		if (input.pollChoices?.length) {
			parts.push(`poll: ${input.pollChoices.join(' | ')}`);
		}
		// Cap size for API
		return parts.join('\n').slice(0, 12_000);
	}

	/**
	 * Collect public image URLs only when includeImages is enabled and note has images.
	 * Prefer webpublic (resized) over original for cost/latency.
	 */
	@bindThis
	private collectImageUrls(input: AiNoteModerationInput): string[] {
		const c = this.getConfig();
		if (c.includeImages !== true) return [];
		const files = input.files ?? [];
		if (files.length === 0) return [];

		const max = Math.max(1, Math.min(Number(c.maxImages) || 4, 8));
		const urls: string[] = [];
		for (const f of files) {
			if (urls.length >= max) break;
			if (!f?.type?.startsWith('image/')) continue;
			// Skip SVG (often unsafe / not useful for vision APIs)
			if (f.type === 'image/svg+xml') continue;
			const url = (f.webpublicUrl || f.thumbnailUrl || f.url || '').trim();
			if (!url) continue;
			// Only https public URLs (providers need to fetch them)
			if (!/^https:\/\//i.test(url)) continue;
			urls.push(url);
		}
		return urls;
	}

	@bindThis
	private normalizeBaseUrl(baseUrl: string): string {
		assertSafeAiEndpointUrl(baseUrl);
		return normalizeOpenAiV1Base(baseUrl);
	}

	/** OpenAI chat.completions multimodal user content parts */
	@bindThis
	private buildChatUserContent(text: string, imageUrls: string[]): string | Array<Record<string, unknown>> {
		const textPart = text.trim() || (imageUrls.length ? 'Post has no text; moderate the attached image(s).' : '');
		if (imageUrls.length === 0) return textPart;
		const parts: Array<Record<string, unknown>> = [
			{ type: 'text', text: textPart },
		];
		for (const url of imageUrls) {
			parts.push({
				type: 'image_url',
				image_url: { url, detail: 'low' },
			});
		}
		return parts;
	}

	/** OpenAI responses API multimodal input content */
	@bindThis
	private buildResponsesUserContent(text: string, imageUrls: string[]): string | Array<Record<string, unknown>> {
		const textPart = text.trim() || (imageUrls.length ? 'Post has no text; moderate the attached image(s).' : '');
		if (imageUrls.length === 0) return textPart;
		const parts: Array<Record<string, unknown>> = [
			{ type: 'input_text', text: textPart },
		];
		for (const url of imageUrls) {
			parts.push({
				type: 'input_image',
				image_url: url,
			});
		}
		return parts;
	}

	@bindThis
	private async callOpenAiCompatible(userContent: string, imageUrls: string[] = []): Promise<string> {
		const c = this.getConfig();
		const base = this.normalizeBaseUrl(c.baseUrl!);
		// Vision needs more time; bump cap slightly when images present
		const baseTimeout = c.requestTimeoutMs || 8000;
		const timeoutMs = Math.max(1000, Math.min(
			imageUrls.length > 0 ? Math.max(baseTimeout, 15000) : baseTimeout,
			90_000,
		));
		const system = (c.systemPrompt && c.systemPrompt.trim()) || DEFAULT_SYSTEM;
		const style = c.apiStyle || 'auto';

		const tryChat = async () => {
			const url = `${base}/chat/completions`;
			const body = {
				model: c.model,
				temperature: 0,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: this.buildChatUserContent(userContent, imageUrls) },
				],
				// Encourage JSON when provider supports it
				response_format: { type: 'json_object' },
			};
			return await this.fetchText(url, body, c.apiKey!, timeoutMs);
		};

		const tryResponses = async () => {
			const url = `${base}/responses`;
			const body = {
				model: c.model,
				temperature: 0,
				input: [
					{ role: 'system', content: system },
					{ role: 'user', content: this.buildResponsesUserContent(userContent, imageUrls) },
				],
			};
			return await this.fetchText(url, body, c.apiKey!, timeoutMs);
		};

		if (style === 'chat.completions') {
			return await tryChat();
		}
		if (style === 'responses') {
			return await tryResponses();
		}
		// auto: chat first (widest OpenAI v1 compatibility), then responses
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
			assertSafeAiEndpointUrl(url);
			const res = await this.httpRequestService.send(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${apiKey}`,
					accept: 'application/json',
				},
				body: JSON.stringify(body),
				timeout: timeoutMs,
				isLocalAddressAllowed: false,
				allowHttp: false,
			}, { throwErrorWhenResponseNotOk: false, validators: [] });
			const text = await res.text();
			if (!res.ok) {
				throw new Error(`AI endpoint HTTP ${res.status}`);
			}
			// Extract assistant text from common OpenAI v1 shapes
			let json: any;
			try {
				json = JSON.parse(text);
			} catch {
				return text;
			}
			// chat.completions
			const chatContent = json?.choices?.[0]?.message?.content;
			if (typeof chatContent === 'string') return chatContent;
			if (Array.isArray(chatContent)) {
				return chatContent.map((p: any) => p?.text ?? p?.content ?? '').join('');
			}
			// responses API
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
			// Some gateways return { result: "..." }
			if (typeof json?.result === 'string') return json.result;
			if (typeof json?.content === 'string') return json.content;
			return text;
		} finally {
			clearTimeout(t);
		}
	}

	@bindThis
	private parseDecision(raw: string): { flagged: boolean; reason: string } {
		const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
		// Try parse JSON object
		const tryParse = (s: string) => {
			try {
				return JSON.parse(s);
			} catch {
				return null;
			}
		};
		let obj = tryParse(cleaned);
		if (!obj) {
			const m = cleaned.match(/\{[\s\S]*\}/);
			if (m) obj = tryParse(m[0]);
		}
		if (obj && typeof obj === 'object') {
			const flagged = obj.flagged === true || obj.flag === true || obj.violation === true
				|| obj.safe === false || obj.allow === false
				|| (typeof obj.label === 'string' && /unsafe|block|reject|flag/i.test(obj.label));
			const reason = typeof obj.reason === 'string' ? obj.reason
				: typeof obj.category === 'string' ? obj.category
					: typeof obj.message === 'string' ? obj.message
						: '';
			return { flagged: !!flagged, reason };
		}
		// Plain text fallback
		const lower = cleaned.toLowerCase();
		if (/\bflagged\s*[:=]\s*true\b/.test(lower) || /\bunsafe\b/.test(lower) || /\breject\b/.test(lower)) {
			return { flagged: true, reason: cleaned.slice(0, 120) };
		}
		if (/\bflagged\s*[:=]\s*false\b/.test(lower) || /\bsafe\b/.test(lower) || /\ballow\b/.test(lower)) {
			return { flagged: false, reason: '' };
		}
		// Unknown → not flagged (fail open at parse layer)
		return { flagged: false, reason: '' };
	}
}
