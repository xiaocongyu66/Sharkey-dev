/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * User-facing API / network error formatting.
 * Prefer localized short messages over raw English backend text + UUID dumps.
 */

import { i18n } from '@/i18n.js';

export type FormattedApiError = {
	title: string;
	text: string;
	/** Original machine code when available */
	code?: string;
	/** Original error id (UUID) when available */
	id?: string;
};

type ApiErrLike = {
	message?: string;
	code?: string;
	id?: string;
	info?: unknown;
};

function tApi(key: string, fallback: string): string {
	const block = (i18n.ts as any)?._apiErrors;
	const v = block?.[key];
	if (typeof v === 'string' && v.length > 0) return v;
	return fallback;
}

/** Common API error codes → friendly copy (localized via _apiErrors) */
const CODE_FALLBACKS: Record<string, { en: string; zh: string }> = {
	NO_SUCH_USER: { en: 'User not found.', zh: '找不到该用户。' },
	USER_NOT_FOUND: { en: 'User not found.', zh: '找不到该用户。' },
	NO_SUCH_NOTE: { en: 'Note not found.', zh: '找不到该帖子。' },
	NO_SUCH_FILE: { en: 'File not found.', zh: '找不到该文件。' },
	NO_SUCH_FOLDER: { en: 'Folder not found.', zh: '找不到该文件夹。' },
	NO_SUCH_ROOM: { en: 'Chat room not found.', zh: '找不到该群聊。' },
	NO_SUCH_MESSAGE: { en: 'Message not found.', zh: '找不到该消息。' },
	NO_SUCH_CHANNEL: { en: 'Channel not found.', zh: '找不到该频道。' },
	NO_SUCH_CLIP: { en: 'Clip not found.', zh: '找不到该摘录。' },
	NO_SUCH_LIST: { en: 'List not found.', zh: '找不到该列表。' },
	NO_SUCH_USER_LIST: { en: 'List not found.', zh: '找不到该列表。' },
	NO_SUCH_ANTENNA: { en: 'Antenna not found.', zh: '找不到该天线。' },
	NO_SUCH_PAGE: { en: 'Page not found.', zh: '找不到该页面。' },
	NO_SUCH_FLASH: { en: 'Play not found.', zh: '找不到该 Play。' },
	NO_SUCH_ROLE: { en: 'Role not found.', zh: '找不到该角色。' },
	NO_SUCH_WEBHOOK: { en: 'Webhook not found.', zh: '找不到该 Webhook。' },
	NO_SUCH_KEY: { en: 'Key not found.', zh: '找不到该密钥。' },
	NO_SUCH_REPLY: { en: 'Reply target not found.', zh: '找不到回复目标。' },
	NO_SUCH_POST: { en: 'Post not found.', zh: '找不到该内容。' },
	// Antennas
	EMPTY_KEYWORD: {
		en: 'Enter at least one keyword or exclude keyword.',
		zh: '请至少填写一个「包含关键词」或「排除关键词」。',
	},
	TOO_MANY_ANTENNAS: {
		en: 'You cannot create any more antennas.',
		zh: '天线数量已达上限，无法再创建。',
	},
	ACCESS_DENIED: { en: 'Access denied.', zh: '访问被拒绝。' },
	PERMISSION_DENIED: { en: 'Permission denied.', zh: '没有权限执行此操作。' },
	ROLE_PERMISSION_DENIED: { en: 'Permission denied.', zh: '没有权限执行此操作。' },
	CREDENTIAL_REQUIRED: { en: 'Please sign in to continue.', zh: '请先登录后再操作。' },
	SIGNIN_REQUIRED: { en: 'Please sign in to continue.', zh: '请先登录后再操作。' },
	AUTHENTICATION_REQUIRED: { en: 'Please sign in to continue.', zh: '请先登录后再操作。' },
	RATE_LIMIT_EXCEEDED: { en: 'Too many requests. Please wait and try again.', zh: '操作过于频繁，请稍后再试。' },
	ROOM_RATE_LIMITED: { en: 'Sending too fast. Please wait a moment.', zh: '发言过快，请稍后再发。' },
	ROOM_MUTED_ALL: { en: 'This room is muted for all members.', zh: '全体禁言中，无法发言。' },
	INVALID_PARAM: { en: 'Invalid request parameters.', zh: '请求参数无效。' },
	INTERNAL_ERROR: { en: 'Internal server error.', zh: '服务器内部错误，请稍后重试。' },
	CONTENT_REQUIRED: { en: 'Content is required.', zh: '请填写内容。' },
	EMPTY_FILE: { en: 'Empty file is not allowed.', zh: '不能上传空文件。' },
	TOO_BIG_FILE: { en: 'File is too large.', zh: '文件过大。' },
	UNEXPECTED_FILE_TYPE: { en: 'Unsupported file type.', zh: '不支持的文件类型。' },
	MAX_LENGTH: { en: 'Text is too long.', zh: '内容过长。' },
	YOU_HAVE_BEEN_BLOCKED: { en: 'You have been blocked by this user.', zh: '你已被该用户屏蔽。' },
	BLOCKEE_IS_YOURSELF: { en: 'You cannot block yourself.', zh: '不能屏蔽自己。' },
	MUTEE_IS_YOURSELF: { en: 'You cannot mute yourself.', zh: '不能静音自己。' },
	FOLLOWEE_IS_YOURSELF: { en: 'You cannot follow yourself.', zh: '不能关注自己。' },
	ALREADY_FOLLOWING: { en: 'Already following this user.', zh: '已经关注了该用户。' },
	ALREADY_BLOCKING: { en: 'Already blocking this user.', zh: '已经屏蔽了该用户。' },
	ALREADY_MUTING: { en: 'Already muting this user.', zh: '已经静音了该用户。' },
	ALREADY_FAVORITED: { en: 'Already favorited.', zh: '已经收藏过了。' },
	NOT_FOLLOWING: { en: 'You are not following this user.', zh: '你尚未关注该用户。' },
	NOT_BLOCKING: { en: 'You are not blocking this user.', zh: '你未屏蔽该用户。' },
	NOT_MUTING: { en: 'You are not muting this user.', zh: '你未静音该用户。' },
	NOT_LIKED: { en: 'Not liked yet.', zh: '尚未点赞。' },
	INCORRECT_PASSWORD: { en: 'Incorrect password.', zh: '密码不正确。' },
	INCORRECT_TOTP: { en: 'Incorrect two-factor code.', zh: '两步验证码不正确。' },
	USER_PROTECTED: { en: 'This user is protected.', zh: '该用户受保护。' },
	UNAVAILABLE: { en: 'This feature is unavailable.', zh: '该功能暂不可用。' },
	LTL_DISABLED: { en: 'Local timeline is disabled.', zh: '本站时间线已关闭。' },
	GTL_DISABLED: { en: 'Global timeline is disabled.', zh: '联合时间线已关闭。' },
	PROHIBITED_WORD: { en: 'Contains prohibited words.', zh: '内容包含禁止词，无法发布。' },
	CONTAINS_PROHIBITED_WORDS: { en: 'Contains prohibited words.', zh: '内容包含禁止词，无法发布。' },
	RESTRICTED: { en: 'This action is restricted.', zh: '此操作受到限制。' },
	NOT_A_MEMBER: { en: 'You are not a member of this room.', zh: '你不是该群成员。' },
	SEND_FAILED: { en: 'Failed to send. Check your connection and try again.', zh: '发送失败，请检查网络后重试。' },
	REACT_FAILED: { en: 'Failed to react.', zh: '回应失败。' },
	DELETE_FAILED: { en: 'Failed to delete.', zh: '删除失败。' },
	CLEAR_FAILED: { en: 'Failed to clear messages.', zh: '清理消息失败。' },
	NO_SUCH_FILE_OR_CONTENT: { en: 'Content required.', zh: '请填写内容或附件。' },
	// Translation / AI upstream
	TRANSLATION_FAILED: {
		en: 'Translation failed. Please try again later.',
		zh: '翻译失败，请稍后再试。',
	},
	AI_NOT_CONFIGURED: {
		en: 'AI translation is not configured (missing endpoint or API key).',
		zh: 'AI 翻译未配置（缺少接口地址或 API 密钥）。',
	},
	AI_AUTH_FAILED: {
		en: 'AI provider rejected the API key (HTTP 401 Unauthorized). Check the key in admin settings.',
		zh: 'AI 服务拒绝了 API 密钥（HTTP 401 未授权）。请检查后台配置的密钥。',
	},
	AI_FORBIDDEN: {
		en: 'AI provider denied access (HTTP 403 Forbidden). Check plan / IP allowlist / model permission.',
		zh: 'AI 服务拒绝访问（HTTP 403 禁止）。请检查套餐、IP 白名单或模型权限。',
	},
	AI_RATE_LIMITED: {
		en: 'AI provider rate limit exceeded (HTTP 429). Please wait and try again.',
		zh: 'AI 服务请求过于频繁（HTTP 429）。请稍后再试。',
	},
	AI_TIMEOUT: {
		en: 'AI translation timed out. Try again or raise the timeout in admin settings.',
		zh: 'AI 翻译超时。请重试，或在后台调高超时时间。',
	},
	AI_UPSTREAM_ERROR: {
		en: 'AI provider returned an error. Check the endpoint URL and model name.',
		zh: 'AI 服务返回错误。请检查接口地址与模型名称。',
	},
	AI_EMPTY_RESPONSE: {
		en: 'AI returned an empty translation.',
		zh: 'AI 返回了空的翻译结果。',
	},
	AI_SCOPE_DISABLED: {
		en: 'AI translation is disabled for this feature.',
		zh: '该场景的 AI 翻译已关闭。',
	},
	CANNOT_TRANSLATE_INVISIBLE_NOTE: {
		en: 'Cannot translate a note you cannot see.',
		zh: '无法翻译你不可见的帖子。',
	},
	EMPTY_MESSAGE: {
		en: 'Message has no text to translate.',
		zh: '消息没有可翻译的文本。',
	},
};

function preferZh(): boolean {
	try {
		const lang = (i18n as any).locale || (typeof navigator !== 'undefined' ? navigator.language : 'en');
		return String(lang).toLowerCase().startsWith('zh');
	} catch {
		return false;
	}
}

function textForCode(code: string): string | null {
	const fromI18n = tApi(code, '');
	if (fromI18n) return fromI18n;
	const fb = CODE_FALLBACKS[code];
	if (!fb) return null;
	return preferZh() ? fb.zh : fb.en;
}

function isUuid(s: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function isRawEnglishBackendMessage(msg: string): boolean {
	// Backend ApiError messages are typically short English sentences
	if (!msg) return false;
	if (/[\u4e00-\u9fff]/.test(msg)) return false;
	// Prefer mapping over "No such user." style English
	return /^[A-Za-z0-9]/.test(msg) && msg.length < 200;
}

/**
 * Normalize any thrown API/network error into title + user text.
 * Does not dump UUID error ids unless `includeId` is true.
 */
export function formatApiError(
	err: unknown,
	opts?: { includeId?: boolean; endpoint?: string },
): FormattedApiError {
	const genericTitle = tApi('title', preferZh() ? '操作失败' : (i18n.ts.error || 'Error'));
	const genericText = tApi(
		'generic',
		preferZh() ? '出错了，请稍后重试。' : (i18n.ts.somethingHappened || 'Something went wrong.'),
	);

	if (err == null) {
		return { title: genericTitle, text: genericText };
	}

	// Abort
	if (typeof err === 'object' && (err as any).name === 'AbortError') {
		return {
			title: genericTitle,
			text: tApi('aborted', preferZh() ? '请求已取消。' : 'Request cancelled.'),
		};
	}

	// Network / fetch failures
	if (err instanceof TypeError || (typeof err === 'object' && (err as any).name === 'TypeError')) {
		return {
			title: i18n.ts.gotInvalidResponseError || genericTitle,
			text: i18n.ts.gotInvalidResponseErrorDescription
				|| tApi('network', preferZh()
					? '网络异常或服务器暂时不可用，请检查连接后重试。'
					: 'Network error or server unreachable. Please try again.'),
		};
	}

	if (typeof err === 'string') {
		if (err === 'Internal Server Error' || err.toLowerCase().includes('internal server error')) {
			return {
				title: i18n.ts.internalServerError || genericTitle,
				text: i18n.ts.internalServerErrorDescription || genericText,
			};
		}
		if (err.startsWith('Unexpected token') || err.includes('JSON')) {
			return {
				title: i18n.ts.gotInvalidResponseError || genericTitle,
				text: i18n.ts.gotInvalidResponseErrorDescription || genericText,
			};
		}
		return { title: genericTitle, text: err };
	}

	const e = err as ApiErrLike & { status?: number };
	let code = typeof e.code === 'string' ? e.code : undefined;
	// Local browser AI (ai-translation-local) throws Error with .code / HTTP status in message
	if (!code && typeof e.message === 'string') {
		const m = e.message.match(/\bHTTP\s+(\d{3})\b/i);
		if (m) {
			const st = Number(m[1]);
			if (st === 401) code = 'AI_AUTH_FAILED';
			else if (st === 403) code = 'AI_FORBIDDEN';
			else if (st === 429) code = 'AI_RATE_LIMITED';
			else if (st === 408 || st === 504) code = 'AI_TIMEOUT';
			else if (st >= 400) code = 'AI_UPSTREAM_ERROR';
		}
	}
	const id = typeof e.id === 'string' ? e.id : undefined;
	const message = typeof e.message === 'string' ? e.message : undefined;

	// Special-case global codes (existing i18n)
	if (code === 'INTERNAL_ERROR') {
		return {
			title: i18n.ts.internalServerError || genericTitle,
			text: i18n.ts.internalServerErrorDescription || genericText,
			code,
			id,
		};
	}
	if (code === 'RATE_LIMIT_EXCEEDED') {
		return {
			title: i18n.ts.cannotPerformTemporary || genericTitle,
			text: i18n.ts.cannotPerformTemporaryDescription || textForCode(code) || genericText,
			code,
			id,
		};
	}
	if (code === 'INVALID_PARAM') {
		return {
			title: i18n.ts.invalidParamError || genericTitle,
			text: i18n.ts.invalidParamErrorDescription || textForCode(code) || genericText,
			code,
			id,
		};
	}
	if (code === 'ROLE_PERMISSION_DENIED' || code === 'PERMISSION_DENIED' || code === 'ACCESS_DENIED') {
		return {
			title: i18n.ts.permissionDeniedError || genericTitle,
			text: i18n.ts.permissionDeniedErrorDescription || textForCode(code || 'PERMISSION_DENIED') || genericText,
			code,
			id,
		};
	}
	if (code?.startsWith('TOO_MANY')) {
		return {
			title: i18n.ts.youCannotCreateAnymore || genericTitle,
			text: textForCode(code) || (preferZh() ? '已达到数量上限，无法再创建。' : (i18n.ts.youCannotCreateAnymore || genericText)),
			code,
			id,
		};
	}

	if (message?.startsWith('Unexpected token')) {
		return {
			title: i18n.ts.gotInvalidResponseError || genericTitle,
			text: i18n.ts.gotInvalidResponseErrorDescription || genericText,
			code,
			id,
		};
	}

	// Prefer mapped code text over raw English
	if (code) {
		const mapped = textForCode(code);
		if (mapped) {
			let text = mapped;
			if (opts?.includeId && id) text += `\n${id}`;
			return { title: genericTitle, text, code, id };
		}
	}

	// Message that is already localized or meaningful
	let text = genericText;
	if (message && message !== 'Internal Server Error') {
		if (!isRawEnglishBackendMessage(message) || !code) {
			text = message;
		} else {
			// English backend message without mapping — still soften
			text = preferZh()
				? `操作失败：${message}`
				: message;
		}
	} else if (code) {
		text = preferZh() ? `操作失败（${code}）` : `Error: ${code}`;
	}

	// Never show bare UUID as main text
	if (text && isUuid(text.trim())) {
		text = genericText;
	}

	if (opts?.includeId && id && !text.includes(id)) {
		text += `\n${id}`;
	}

	return { title: genericTitle, text, code, id };
}

/** Single-line string for places that only accept text */
export function formatApiErrorText(err: unknown, opts?: { includeId?: boolean }): string {
	const { title, text } = formatApiError(err, opts);
	if (title && text && title !== text && title !== i18n.ts.error) {
		return `${title}\n${text}`;
	}
	return text;
}
