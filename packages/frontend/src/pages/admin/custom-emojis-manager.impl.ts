/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';

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
function fieldLabel(key: string): string {
	// Prefer dedicated emoji manager labels, then common i18n keys, then key
	const cem = (i18n.ts as any)?._customEmojisManager;
	const fromCem = cem?.[key] ?? cem?.fields?.[key];
	if (typeof fromCem === 'string' && fromCem.length > 0) return fromCem;
	const common = (i18n.ts as any)[key];
	if (typeof common === 'string' && common.length > 0) return common;
	const ui = (i18n.ts as any)?._uiCommon?.[key];
	if (typeof ui === 'string' && ui.length > 0) return ui;
	return key;
}

/** True if string looks like an untranslated identifier (camelCase / raw key). */
function looksLikeKey(s: string, key: string): boolean {
	if (!s || s === key) return true;
	if (/^[a-z]+[A-Z]/.test(s)) return true; // camelCase
	if (/^[a-z][a-zA-Z0-9]+$/.test(s) && s === key) return true;
	return false;
}

/**
 * Label for emoji manager search fields and grid column titles.
 * Locale-only: `_customEmojisManager._fields` then shared i18n keys.
 */
export function emojiFieldLabel(fieldKey: string, englishFallback?: string): string {
	const key = FIELD_KEY_ALIASES[fieldKey] ?? fieldKey;
	const fields = (i18n.ts as any)._customEmojisManager?._fields;
	const fromFields = fields?.[key];

	if (typeof fromFields === 'string' && fromFields.length > 0 && !looksLikeKey(fromFields, key)) {
		return fromFields;
	}

	const labeled = fieldLabel(key);
	if (labeled !== key && !looksLikeKey(labeled, key)) {
		return labeled;
	}

	const top = (i18n.ts as any)[key];
	if (typeof top === 'string' && top.length > 0 && !looksLikeKey(top, key)) {
		return top;
	}

	if (englishFallback && !looksLikeKey(englishFallback, key)) {
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
