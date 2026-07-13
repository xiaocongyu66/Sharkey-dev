/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';

export type RequestLogItem = {
	failed: boolean;
	url: string;
	name: string;
	error?: string;
};

export const gridSortOrderKeys = [
	'name',
	'category',
	'aliases',
	'type',
	'license',
	'host',
	'uri',
	'publicUrl',
	'isSensitive',
	'localOnly',
	'updatedAt',
] as const satisfies string[];

export type GridSortOrderKey = typeof gridSortOrderKeys[number];

/** Map grid bindTo / sort keys → _customEmojisManager._fields keys */
const FIELD_KEY_ALIASES: Record<string, string> = {
	isSensitive: 'sensitive',
	updatedAt: 'updatedAtFrom',
};

/**
 * Human labels when locale pack / cache lacks _customEmojisManager._fields.
 * Never fall back to raw camelCase keys (those showed as broken "符号文字" in admin UI).
 */
const FIELD_FALLBACKS: Record<string, { en: string; zh: string; ja: string }> = {
	name: { en: 'Name', zh: '名称', ja: '名前' },
	category: { en: 'Category', zh: '分类', ja: 'カテゴリ' },
	aliases: { en: 'Aliases', zh: '别名', ja: 'エイリアス' },
	type: { en: 'Type', zh: '类型', ja: '種類' },
	license: { en: 'License', zh: '许可证', ja: 'ライセンス' },
	sensitive: { en: 'Sensitive', zh: '敏感', ja: 'センシティブ' },
	localOnly: { en: 'Local only', zh: '仅本地', ja: 'ローカルのみ' },
	updatedAtFrom: { en: 'Updated at (from)', zh: '更新时间（起）', ja: '更新日時（開始）' },
	updatedAtTo: { en: 'Updated at (to)', zh: '更新时间（止）', ja: '更新日時（終了）' },
	role: { en: 'Role', zh: '角色', ja: 'ロール' },
	host: { en: 'Host', zh: '主机', ja: 'ホスト' },
	uri: { en: 'URI', zh: 'URI', ja: 'URI' },
	publicUrl: { en: 'Public URL', zh: '公开 URL', ja: '公開URL' },
};

/**
 * Label for emoji manager search fields and grid column titles.
 * Prefer _customEmojisManager._fields, then top-level i18n, then lang-aware fallbacks.
 */
export function emojiFieldLabel(fieldKey: string, englishFallback?: string): string {
	const key = FIELD_KEY_ALIASES[fieldKey] ?? fieldKey;
	const fields = (i18n.ts as any)._customEmojisManager?._fields;
	const fromFields = fields?.[key];
	if (typeof fromFields === 'string' && fromFields.length > 0 && fromFields !== key) {
		return fromFields;
	}
	// Top-level keys (name, category, …) — only when not equal to the raw key
	const top = (i18n.ts as any)[key];
	if (typeof top === 'string' && top.length > 0 && top !== key) {
		return top;
	}
	const fb = FIELD_FALLBACKS[key];
	if (fb) {
		const lang = (
			miLocalStorage.getItem('lang')
			|| (typeof navigator !== 'undefined' ? navigator.language : 'en-US')
			|| 'en-US'
		).replace('_', '-').toLowerCase();
		if (lang.startsWith('zh')) return fb.zh;
		if (lang.startsWith('ja')) return fb.ja;
		return fb.en;
	}
	// Last resort: spaced English, never camelCase identifier
	if (englishFallback && englishFallback !== key && !/^[a-z]+[A-Z]/.test(englishFallback)) {
		return englishFallback;
	}
	return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}

export function emptyStrToUndefined(value: string | null) {
	return value ? value : undefined;
}

export function emptyStrToNull(value: string) {
	return value === '' ? null : value;
}

export function emptyStrToEmptyArray(value: string) {
	return value === '' ? [] : value.split(' ').map(it => it.trim());
}

export function roleIdsParser(text: string): { id: string, name: string }[] {
	// idとnameのペア配列をJSONで受け取る。それ以外の形式は許容しない
	try {
		const obj = JSON.parse(text);
		if (!Array.isArray(obj)) {
			return [];
		}
		if (!obj.every(it => typeof it === 'object' && 'id' in it && 'name' in it)) {
			return [];
		}

		return obj.map(it => ({ id: it.id, name: it.name }));
	} catch (ex) {
		console.warn(ex);
		return [];
	}
}
