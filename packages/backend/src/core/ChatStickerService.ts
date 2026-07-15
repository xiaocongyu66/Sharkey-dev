/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { DriveService } from '@/core/DriveService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type {
	ChatStickerPacksRepository,
	ChatStickersRepository,
	MiChatSticker,
	MiChatStickerPack,
	MiDriveFile,
	MiUser,
} from '@/models/_.js';
import { In } from 'typeorm';

type TelegramStickerSet = {
	name: string;
	title: string;
	stickers: {
		file_id: string;
		emoji?: string;
		is_animated?: boolean;
		is_video?: boolean;
	}[];
};

@Injectable()
export class ChatStickerService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.chatStickerPacksRepository)
		private chatStickerPacksRepository: ChatStickerPacksRepository,

		@Inject(DI.chatStickersRepository)
		private chatStickersRepository: ChatStickersRepository,

		private idService: IdService,
		private driveService: DriveService,
		private driveFileEntityService: DriveFileEntityService,
		private readonly httpRequestService: HttpRequestService,
	) {
	}

	/** Telegram Bot API JSON call without putting the bot token in the URL (SK-2026-093). */
	@bindThis
	private async telegramApiJson(method: string, params: Record<string, string>): Promise<any> {
		const token = this.getTelegramBotToken();
		if (!token) throw new Error('telegram bot token not configured');
		// Official Bot API still requires /bot{token}/ in path; keep token out of query string.
		// Scrub token from any error message we rethrow.
		const url = `https://api.telegram.org/bot${token}/${method}`;
		try {
			const res = await this.httpRequestService.send(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams(params).toString(),
				timeout: 15000,
				size: 2 * 1024 * 1024,
			});
			return await res.json();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			throw new Error(msg.split(token).join('[redacted]'));
		}
	}

	private getTelegramBotToken(): string | null {
		const fromConfig = (this.config as any).telegramBotToken as string | undefined | null;
		const fromEnv = process.env.TELEGRAM_BOT_TOKEN;
		const token = (fromConfig || fromEnv || '').trim();
		return token.length > 0 ? token : null;
	}

	@bindThis
	public async listPacks(me: { id: MiUser['id'] }) {
		const packs = await this.chatStickerPacksRepository.createQueryBuilder('pack')
			.where('pack.isPublic = TRUE')
			.orWhere('pack.ownerId = :me', { me: me.id })
			.orderBy('pack.id', 'DESC')
			.take(100)
			.getMany();

		const stickers = packs.length === 0 ? [] : await this.chatStickersRepository.find({
			where: { packId: In(packs.map(p => p.id)) },
			order: { sortOrder: 'ASC' },
		});

		const fileIds = stickers.map(s => s.fileId);
		const packedFiles = fileIds.length === 0
			? new Map()
			: await this.driveFileEntityService.packMany(fileIds).then(files => new Map(files.map(f => [f.id, f])));

		const byPack = new Map<string, typeof stickers>();
		for (const s of stickers) {
			const list = byPack.get(s.packId) ?? [];
			list.push(s);
			byPack.set(s.packId, list);
		}

		return packs.map(pack => ({
			id: pack.id,
			name: pack.name,
			title: pack.title,
			telegramName: pack.telegramName,
			isPublic: pack.isPublic,
			stickers: (byPack.get(pack.id) ?? []).map(s => ({
				id: s.id,
				emoji: s.emoji,
				fileId: s.fileId,
				file: packedFiles.get(s.fileId) ?? null,
			})),
		}));
	}

	@bindThis
	public async createPack(owner: MiUser, params: { name: string; title?: string; isPublic?: boolean }) {
		const pack = await this.chatStickerPacksRepository.insertOne({
			id: this.idService.gen(),
			name: params.name,
			title: params.title ?? params.name,
			telegramName: null,
			ownerId: owner.id,
			isPublic: params.isPublic ?? true,
			thumbnailFileId: null,
		} satisfies Partial<MiChatStickerPack>);
		return pack;
	}

	@bindThis
	public async addStickerToPack(owner: MiUser, packId: string, file: MiDriveFile, emoji = '') {
		const pack = await this.chatStickerPacksRepository.findOneByOrFail({ id: packId });
		if (pack.ownerId !== owner.id) {
			throw new Error('no permission');
		}
		const count = await this.chatStickersRepository.countBy({ packId });
		const sticker = await this.chatStickersRepository.insertOne({
			id: this.idService.gen(),
			packId,
			fileId: file.id,
			emoji,
			sortOrder: count,
		} satisfies Partial<MiChatSticker>);

		if (pack.thumbnailFileId == null) {
			await this.chatStickerPacksRepository.update(pack.id, { thumbnailFileId: file.id });
		}
		return sticker;
	}

	@bindThis
	public async importTelegramPack(owner: MiUser, telegramName: string) {
		const token = this.getTelegramBotToken();
		if (!token) {
			throw new Error('telegram bot token not configured');
		}

		const name = telegramName.trim().replace(/^@/, '');
		if (!/^[A-Za-z0-9_]+$/.test(name)) {
			throw new Error('invalid pack name');
		}

		const existing = await this.chatStickerPacksRepository.findOneBy({ telegramName: name });
		if (existing) {
			return existing;
		}

		// SK-2026-093: HttpRequestService + scrub token from errors; POST body params (token only in path)
		const setJson = await this.telegramApiJson('getStickerSet', { name }) as {
			ok: boolean;
			result?: TelegramStickerSet;
			description?: string;
		};
		if (!setJson.ok || !setJson.result) {
			throw new Error(setJson.description || 'telegram getStickerSet failed');
		}

		const pack = await this.chatStickerPacksRepository.insertOne({
			id: this.idService.gen(),
			name: setJson.result.name,
			title: setJson.result.title,
			telegramName: setJson.result.name,
			ownerId: owner.id,
			isPublic: true,
			thumbnailFileId: null,
		} satisfies Partial<MiChatStickerPack>);

		// Prefer static/video stickers; skip pure TGS (lottie) for broader client support
		const candidates = setJson.result.stickers.filter(s => !s.is_animated).slice(0, 80);
		let order = 0;
		for (const tg of candidates) {
			try {
				const fileJson = await this.telegramApiJson('getFile', { file_id: tg.file_id }) as {
					ok: boolean;
					result?: { file_path: string };
				};
				if (!fileJson.ok || !fileJson.result?.file_path) continue;
				// File download URL still requires token in path (Telegram API); uploadFromUrl uses HttpRequestService path.
				// Avoid logging this URL; scrub token if upload throws.
				const filePath = fileJson.result.file_path;
				const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
				let driveFile;
				try {
					driveFile = await this.driveService.uploadFromUrl({
						url,
						user: owner,
						comment: `sticker:${name}`,
						force: true,
					});
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					throw new Error(msg.split(token).join('[redacted]'));
				}
				await this.chatStickersRepository.insertOne({
					id: this.idService.gen(),
					packId: pack.id,
					fileId: driveFile.id,
					emoji: tg.emoji ?? '',
					sortOrder: order++,
				} satisfies Partial<MiChatSticker>);
				if (pack.thumbnailFileId == null) {
					pack.thumbnailFileId = driveFile.id;
					await this.chatStickerPacksRepository.update(pack.id, { thumbnailFileId: driveFile.id });
				}
			} catch {
				// skip broken sticker
			}
		}

		return await this.chatStickerPacksRepository.findOneByOrFail({ id: pack.id });
	}

	@bindThis
	public async findStickerFile(stickerId: string): Promise<MiDriveFile | null> {
		const sticker = await this.chatStickersRepository.findOne({
			where: { id: stickerId },
			relations: ['file'],
		});
		return sticker?.file ?? null;
	}
}
