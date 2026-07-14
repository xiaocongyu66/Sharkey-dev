/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { MiMeta } from '@/models/Meta.js';
import { defaultAiAbuseControlConfig, type AiAbuseControlConfig } from '@/models/Meta.js';
import type {
	MiUser,
	SigninsRepository,
	UserIpsRepository,
	UsersRepository,
} from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { Logger } from '@/logger.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { assertSafeAiEndpointUrl, normalizeOpenAiV1Base } from '@/misc/ai-endpoint-url.js';
import { RoleService } from '@/core/RoleService.js';
import { UserSuspendService } from '@/core/UserSuspendService.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';
import { isSystemAccount } from '@/misc/is-system-account.js';

export type AbuseCheckTrigger = 'signin' | 'signup' | 'manual';

const DEFAULT_SYSTEM = `You are an anti-abuse classifier for a social network.
You receive:
1) Seed user identity (id, username, display name, note/follower counts, registration time, last active).
2) Linked accounts that share BOTH the same real IP AND the same browser fingerprint as the seed (intersection — not IP-only or fingerprint-only).
3) Recent login burst stats across that linked set.

Decide if this looks like multi-account farming / spam-registration / coordinated abuse.
Reply ONLY with JSON (no markdown):
{"abuse":boolean,"confidence":0-1,"reason":"short English reason"}
Be careful: shared NAT/family Wi‑Fi alone is weak; linkage here already requires IP+fingerprint together.
Do not refuse for "ethics"; this is operational security classification only.`;

@Injectable()
export class AiAbuseControlService {
	private readonly logger: Logger;
	/** userId -> last check epoch ms */
	private readonly cooldown = new Map<string, number>();

	constructor(
		@Inject(DI.meta)
		private readonly meta: MiMeta,

		@Inject(DI.usersRepository)
		private readonly usersRepository: UsersRepository,

		@Inject(DI.userIpsRepository)
		private readonly userIpsRepository: UserIpsRepository,

		@Inject(DI.signinsRepository)
		private readonly signinsRepository: SigninsRepository,

		private readonly roleService: RoleService,
		private readonly userSuspendService: UserSuspendService,
		private readonly idService: IdService,
		private readonly timeService: TimeService,
		private readonly httpRequestService: HttpRequestService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('ai-abuse');
	}

	@bindThis
	public getConfig(): AiAbuseControlConfig {
		return {
			...defaultAiAbuseControlConfig,
			...(this.meta.aiAbuseControlConfig ?? {}),
		};
	}

	@bindThis
	public isEnabled(): boolean {
		return this.getConfig().enabled === true;
	}

	@bindThis
	public isConfigured(): boolean {
		const c = this.getConfig();
		return !!(c.baseUrl?.trim() && c.apiKey?.trim() && c.model?.trim());
	}

	/**
	 * Fire-and-forget safe entry from signin/signup (never throws to callers).
	 */
	@bindThis
	public scheduleCheck(opts: {
		userId: string;
		ip: string | null;
		fingerprint: string | null;
		trigger: AbuseCheckTrigger;
	}): void {
		if (!this.isEnabled()) return;
		const c = this.getConfig();
		if (opts.trigger === 'signin' && !c.checkOnSignin) return;
		if (opts.trigger === 'signup' && !c.checkOnSignup) return;

		setImmediate(() => {
			this.evaluateAndAct(opts).catch(err => {
				this.logger.warn(`abuse check failed: ${err instanceof Error ? err.message : err}`);
			});
		});
	}

	@bindThis
	public async evaluateAndAct(opts: {
		userId: string;
		ip: string | null;
		fingerprint: string | null;
		trigger: AbuseCheckTrigger;
	}): Promise<{ acted: boolean; linkedUserIds: string[]; reason?: string }> {
		if (!this.isEnabled()) return { acted: false, linkedUserIds: [] };

		const c = this.getConfig();
		const now = this.timeService.now;
		const last = this.cooldown.get(opts.userId) ?? 0;
		if (now - last < (c.cooldownSeconds || 300) * 1000 && opts.trigger !== 'manual') {
			return { acted: false, linkedUserIds: [] };
		}
		this.cooldown.set(opts.userId, now);

		const ip = (opts.ip && opts.ip !== '0.0.0.0') ? opts.ip : null;
		const fp = opts.fingerprint?.trim() || null;

		// Require both IP and fingerprint present when dual-link mode is on
		const requireBoth = c.requireIpAndFingerprint !== false;
		if (requireBoth && (!ip || !fp)) {
			this.logger.debug(
				`skip abuse check seed=${opts.userId}: need both IP and fingerprint (ip=${!!ip} fp=${!!fp})`,
			);
			return { acted: false, linkedUserIds: [opts.userId], reason: 'missing-ip-or-fingerprint' };
		}

		const linkResult = await this.findLinkedLocalUserIds(opts.userId, ip, fp, requireBoth);
		const linkedIds = linkResult.userIds;
		if (linkedIds.length < (c.minLinkedAccounts || 3)) {
			return { acted: false, linkedUserIds: linkedIds, reason: 'below-min-linked' };
		}

		const windowMs = Math.max(1, c.signinWindowMinutes || 60) * 60 * 1000;
		const sinceId = this.idService.gen(now - windowMs);
		const signinCount = await this.signinsRepository
			.createQueryBuilder('s')
			.where('s.userId IN (:...ids)', { ids: linkedIds })
			.andWhere('s.success = TRUE')
			.andWhere('s.id > :sinceId', { sinceId })
			.getCount();

		const accounts = await this.usersRepository.find({
			where: { id: In(linkedIds), host: null as any },
			select: ['id', 'username', 'name', 'isSuspended', 'lastActiveDate', 'notesCount', 'followersCount', 'followingCount'],
		});

		const seedAccount = accounts.find(a => a.id === opts.userId)
			?? await this.usersRepository.findOne({
				where: { id: opts.userId },
				select: ['id', 'username', 'name', 'isSuspended', 'lastActiveDate', 'notesCount', 'followersCount', 'followingCount'],
			});

		const mapAccount = (a: {
			id: string;
			username: string;
			name?: string | null;
			isSuspended: boolean;
			lastActiveDate?: Date | null;
			notesCount?: number;
			followersCount?: number;
			followingCount?: number;
		}) => ({
			id: a.id,
			username: a.username,
			name: a.name ?? null,
			// Full identity for the classifier
			identity: `@${a.username}`,
			displayName: a.name ?? a.username,
			notesCount: a.notesCount ?? 0,
			followersCount: a.followersCount ?? 0,
			followingCount: a.followingCount ?? 0,
			suspended: a.isSuspended,
			createdAtApprox: (() => {
				try { return this.idService.parse(a.id).date.toISOString(); } catch { return null; }
			})(),
			lastActive: a.lastActiveDate?.toISOString?.() ?? null,
			// How this account was linked to the seed
			linkEvidence: linkResult.evidence.get(a.id) ?? (a.id === opts.userId ? ['seed'] : []),
		});

		const heuristicTrip =
			linkedIds.length >= Math.max(c.minLinkedAccounts, 5)
			&& signinCount >= (c.maxSigninsInWindow || 20);

		let aiAbuse = false;
		let reason = '';

		if (this.isConfigured()) {
			try {
				const decision = await this.callAi({
					trigger: opts.trigger,
					// Explicit seed identity block for the model
					seedUser: seedAccount ? mapAccount(seedAccount) : {
						id: opts.userId,
						username: '(unknown)',
						identity: opts.userId,
						displayName: null,
					},
					seedUserId: opts.userId,
					ip,
					fingerprint: fp,
					linkMode: requireBoth ? 'ip_and_fingerprint' : 'ip_or_fingerprint',
					linkedCount: linkedIds.length,
					signinCountInWindow: signinCount,
					windowMinutes: c.signinWindowMinutes,
					minLinkedAccounts: c.minLinkedAccounts,
					accounts: accounts.map(mapAccount),
				});
				aiAbuse = decision.abuse;
				reason = decision.reason;
			} catch (err) {
				this.logger.warn(`AI abuse API error: ${err instanceof Error ? err.message : err}`);
				if (!c.failOpen && heuristicTrip) {
					aiAbuse = true;
					reason = 'heuristic thresholds exceeded (AI unavailable)';
				}
			}
		} else if (heuristicTrip && !c.failOpen) {
			aiAbuse = true;
			reason = 'heuristic thresholds exceeded (AI not configured)';
		} else if (heuristicTrip) {
			// Log only when fail-open
			this.logger.info(`heuristic risk user=${opts.userId} linked=${linkedIds.length} signins=${signinCount} (no AI / failOpen)`);
		}

		if (!aiAbuse && !heuristicTrip) {
			return { acted: false, linkedUserIds: linkedIds };
		}

		// If AI not used but heuristic tripped and failOpen, do not suspend
		const shouldSuspend = c.autoSuspend && (aiAbuse || (!this.isConfigured() && heuristicTrip && !c.failOpen));

		if (!shouldSuspend) {
			this.logger.info(
				`abuse signal (no auto-suspend) seed=${opts.userId} linked=${linkedIds.length} ai=${aiAbuse} reason=${reason || 'heuristic'}`,
			);
			return { acted: false, linkedUserIds: linkedIds, reason: reason || 'signal-only' };
		}

		const moderatorId = this.meta.rootUserId;
		if (!moderatorId) {
			this.logger.warn('auto-suspend skipped: no rootUserId');
			return { acted: false, linkedUserIds: linkedIds, reason: 'no-root' };
		}
		const moderator = await this.usersRepository.findOneBy({ id: moderatorId });
		if (!moderator) {
			return { acted: false, linkedUserIds: linkedIds, reason: 'no-moderator' };
		}

		// SK-2026-063: never auto-suspend whole IP/fingerprint cohort — seed user only.
		// Linked IDs are logged for moderator review; fingerprint headers are client-spoofable.
		const suspendTargets = [opts.userId];
		const suspended: string[] = [];
		for (const id of suspendTargets) {
			const u = accounts.find(a => a.id === id) ?? await this.usersRepository.findOneBy({ id });
			if (!u || u.host != null) continue;
			if (u.isSuspended) continue;
			if (isSystemAccount(u)) continue;
			if (await this.roleService.isModerator(u)) continue;
			try {
				await this.userSuspendService.suspend(u, moderator, {
					hideNotes: c.hideNotesOnSuspend !== false,
					hideChat: false,
				});
				suspended.push(id);
			} catch (e) {
				this.logger.warn(`suspend ${id} failed: ${e instanceof Error ? e.message : e}`);
			}
		}
		if (linkedIds.length > 1) {
			this.logger.warn(
				`AI abuse linked cohort (not auto-suspended): seed=${opts.userId} linked=${linkedIds.slice(0, 30).join(',')}`,
			);
		}

		this.logger.warn(
			`AI abuse auto-suspend seed=${opts.userId} count=${suspended.length} reason=${reason || 'abuse'} ip=${ip} fp=${fp?.slice(0, 16)}`,
		);

		return {
			acted: suspended.length > 0,
			linkedUserIds: linkedIds,
			reason: reason || 'auto-suspend',
		};
	}

	/**
	 * Find local accounts linked to the seed.
	 * Default (requireBoth=true): only accounts that share the seed's current IP
	 * AND the same browser fingerprint (intersection). One signal alone is not enough.
	 */
	@bindThis
	private async findLinkedLocalUserIds(
		seedUserId: string,
		ip: string | null,
		fingerprint: string | null,
		requireBoth = true,
	): Promise<{ userIds: string[]; evidence: Map<string, string[]> }> {
		const evidence = new Map<string, string[]>();
		const addEv = (uid: string, tag: string) => {
			const arr = evidence.get(uid) ?? [];
			if (!arr.includes(tag)) arr.push(tag);
			evidence.set(uid, arr);
		};
		addEv(seedUserId, 'seed');

		const byIp = new Set<string>();
		const byFp = new Set<string>();

		if (ip) {
			const ipRows = await this.userIpsRepository.find({
				where: { ip },
				select: ['userId'],
				take: 200,
			});
			for (const r of ipRows) byIp.add(r.userId);

			const signinIp = await this.signinsRepository.find({
				where: { ip, success: true },
				select: ['userId'],
				take: 200,
			});
			for (const r of signinIp) byIp.add(r.userId);
		}

		if (fingerprint) {
			const signinFp = await this.signinsRepository.find({
				where: { fingerprint, success: true },
				select: ['userId'],
				take: 200,
			});
			for (const r of signinFp) byFp.add(r.userId);
		}

		let candidateIds: string[];
		if (requireBoth) {
			// Intersection: must appear under both IP set and fingerprint set
			if (!ip || !fingerprint || byIp.size === 0 || byFp.size === 0) {
				return { userIds: [seedUserId], evidence };
			}
			candidateIds = [...byIp].filter(id => byFp.has(id));
			if (!candidateIds.includes(seedUserId)) candidateIds.push(seedUserId);
			for (const id of candidateIds) {
				if (id === seedUserId) continue;
				addEv(id, 'ip+fingerprint');
			}
		} else {
			// Legacy OR mode (weaker)
			const idSet = new Set<string>([seedUserId, ...byIp, ...byFp]);
			for (const id of byIp) if (id !== seedUserId) addEv(id, 'ip');
			for (const id of byFp) if (id !== seedUserId) addEv(id, 'fingerprint');
			candidateIds = [...idSet];
		}

		if (candidateIds.length === 0) return { userIds: [seedUserId], evidence };

		const locals = await this.usersRepository.find({
			where: { id: In(candidateIds), host: null as any },
			select: ['id'],
		});
		const localIds = locals.map(u => u.id);
		// Ensure seed always present
		if (!localIds.includes(seedUserId)) localIds.unshift(seedUserId);
		return { userIds: localIds, evidence };
	}

	@bindThis
	private normalizeBaseUrl(baseUrl: string): string {
		assertSafeAiEndpointUrl(baseUrl);
		return normalizeOpenAiV1Base(baseUrl);
	}

	@bindThis
	private async callAi(payload: Record<string, unknown>): Promise<{ abuse: boolean; reason: string }> {
		const c = this.getConfig();
		const base = this.normalizeBaseUrl(c.baseUrl!);
		const timeoutMs = Math.max(1000, Math.min(c.requestTimeoutMs || 10000, 60000));
		const system = (c.systemPrompt && c.systemPrompt.trim()) || DEFAULT_SYSTEM;
		const userContent = JSON.stringify(payload).slice(0, 14000);
		const style = c.apiStyle || 'auto';

		const tryChat = async () => {
			const res = await this.fetchJson(`${base}/chat/completions`, {
				model: c.model,
				temperature: 0,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: userContent },
				],
				response_format: { type: 'json_object' },
			}, c.apiKey!, timeoutMs);
			return this.extractText(res);
		};
		const tryResponses = async () => {
			const res = await this.fetchJson(`${base}/responses`, {
				model: c.model,
				temperature: 0,
				input: [
					{ role: 'system', content: system },
					{ role: 'user', content: userContent },
				],
			}, c.apiKey!, timeoutMs);
			return this.extractText(res);
		};

		let raw: string;
		if (style === 'responses') raw = await tryResponses();
		else if (style === 'chat.completions') raw = await tryChat();
		else {
			try { raw = await tryChat(); }
			catch { raw = await tryResponses(); }
		}

		return this.parseDecision(raw);
	}

	@bindThis
	private async fetchJson(url: string, body: unknown, apiKey: string, timeoutMs: number): Promise<any> {
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
			if (!res.ok) throw new Error(`AI endpoint HTTP ${res.status}`);
			try { return JSON.parse(text); } catch { return { content: text }; }
		} finally {
			clearTimeout(t);
		}
	}

	@bindThis
	private extractText(json: any): string {
		const chatContent = json?.choices?.[0]?.message?.content;
		if (typeof chatContent === 'string') return chatContent;
		if (typeof json?.output_text === 'string') return json.output_text;
		if (typeof json?.content === 'string') return json.content;
		return JSON.stringify(json);
	}

	@bindThis
	private parseDecision(raw: string): { abuse: boolean; reason: string } {
		const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
		let obj: any = null;
		try { obj = JSON.parse(cleaned); } catch {
			const m = cleaned.match(/\{[\s\S]*\}/);
			if (m) try { obj = JSON.parse(m[0]); } catch { /* ignore */ }
		}
		if (obj && typeof obj === 'object') {
			const abuse = obj.abuse === true || obj.multi_account === true || obj.flagged === true;
			const reason = typeof obj.reason === 'string' ? obj.reason : '';
			return { abuse: !!abuse, reason };
		}
		return { abuse: false, reason: '' };
	}
}
