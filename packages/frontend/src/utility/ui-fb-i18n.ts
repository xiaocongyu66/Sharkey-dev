/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { miLocalStorage } from '@/local-storage.js';
import { i18n } from '@/i18n.js';

export type UiFb = {
	en: string;
	zh: string;
	'zh-TW'?: string;
	ja?: string;
};

/** Resolve UI language (localStorage → navigator). */
export function uiLang(): string {
	return (
		miLocalStorage.getItem('lang')
		|| (typeof navigator !== 'undefined' ? navigator.language : 'en-US')
		|| 'en-US'
	).replace('_', '-').toLowerCase();
}

/** Pick string from en/zh/zh-TW/ja fallback pack. */
export function tFb(fb: UiFb): string {
	const lang = uiLang();
	if (lang.startsWith('zh-tw') || lang.startsWith('zh-hk') || lang.startsWith('zh-hant')) {
		return fb['zh-TW'] || fb.zh;
	}
	if (lang.startsWith('zh')) return fb.zh;
	if (lang.startsWith('ja') && fb.ja) return fb.ja;
	return fb.en;
}

/** Prefer locale pack key when present; else fallback pack. */
export function tI18nOrFb(keyPath: string, fb: UiFb): string {
	const parts = keyPath.split('.');
	let cur: any = i18n.ts;
	for (const p of parts) {
		if (cur == null) break;
		cur = cur[p];
	}
	if (typeof cur === 'string' && cur.length > 0 && !cur.includes(keyPath)) {
		return cur;
	}
	return tFb(fb);
}

/**
 * Shared labels used across admin / about / API pages.
 * Canonical strings live in locales under `_uiCommon` (all major languages).
 * This map is only a last-resort fallback when the locale pack is stale.
 */
export const commonFb = {
	enabled: { en: 'Enabled', zh: '已启用', 'zh-TW': '已啟用', ja: '有効' },
	disabled: { en: 'Disabled', zh: '已禁用', 'zh-TW': '已停用', ja: '無効' },
	enable: { en: 'Enable', zh: '启用', 'zh-TW': '啟用', ja: '有効化' },
	stats: { en: 'Stats', zh: '统计', 'zh-TW': '統計', ja: '統計' },
	activeUsers: { en: 'Active users', zh: '活跃用户', 'zh-TW': '活躍使用者', ja: 'アクティブユーザー' },
	heatmap: { en: 'Heatmap', zh: '热力图', 'zh-TW': '熱力圖', ja: 'ヒートマップ' },
	retentionRate: { en: 'Retention rate', zh: '留存率', 'zh-TW': '留存率', ja: '定着率' },
	moderators: { en: 'Moderators', zh: '版主', 'zh-TW': '版主', ja: 'モデレーター' },
	federation: { en: 'Federation', zh: '联邦', 'zh-TW': '聯邦', ja: '連合' },
	instances: { en: 'Instances', zh: '实例', 'zh-TW': '站點', ja: 'インスタンス' },
	apRequests: { en: 'ActivityPub requests', zh: 'ActivityPub 请求', 'zh-TW': 'ActivityPub 請求', ja: 'ActivityPubリクエスト' },
	newUsers: { en: 'New users', zh: '新用户', 'zh-TW': '新使用者', ja: '新規ユーザー' },
	deliverQueue: { en: 'Deliver queue', zh: '投递队列', 'zh-TW': '投遞佇列', ja: '配信キュー' },
	inboxQueue: { en: 'Inbox queue', zh: '收件队列', 'zh-TW': '收件佇列', ja: '受信キュー' },
	users: { en: 'Users', zh: '用户', 'zh-TW': '使用者', ja: 'ユーザー' },
	notes: { en: 'Notes', zh: '帖子', 'zh-TW': '貼文', ja: 'ノート' },
	customEmojis: { en: 'Custom emojis', zh: '自定义表情', 'zh-TW': '自訂表情', ja: 'カスタム絵文字' },
	online: { en: 'Online', zh: '在线', 'zh-TW': '線上', ja: 'オンライン' },
	read: { en: 'Read', zh: '读取', 'zh-TW': '讀取', ja: '読み取り' },
	write: { en: 'Write', zh: '写入', 'zh-TW': '寫入', ja: '書き込み' },
	process: { en: 'Process', zh: '处理', 'zh-TW': '處理', ja: '処理' },
	active: { en: 'Active', zh: '进行中', 'zh-TW': '進行中', ja: '実行中' },
	waiting: { en: 'Waiting', zh: '等待中', 'zh-TW': '等待中', ja: '待機' },
	delayed: { en: 'Delayed', zh: '延迟', 'zh-TW': '延遲', ja: '遅延' },
	top10: { en: 'Top 10', zh: '前 10', 'zh-TW': '前 10', ja: 'トップ10' },
	overview: { en: 'Overview', zh: '概览', 'zh-TW': '概覽', ja: '概要' },
	jobs: { en: 'Jobs', zh: '任务', 'zh-TW': '任務', ja: 'ジョブ' },
	latest: { en: 'Latest', zh: '最新', 'zh-TW': '最新', ja: '最新' },
	completed: { en: 'Completed', zh: '已完成', 'zh-TW': '已完成', ja: '完了' },
	failed: { en: 'Failed', zh: '失败', 'zh-TW': '失敗', ja: '失敗' },
	paused: { en: 'Paused', zh: '已暂停', 'zh-TW': '已暫停', ja: '一時停止' },
	deliver: { en: 'Deliver', zh: '投递', 'zh-TW': '投遞', ja: '配信' },
	inbox: { en: 'Inbox', zh: '收件', 'zh-TW': '收件', ja: '受信' },
	info: { en: 'Info', zh: '信息', 'zh-TW': '資訊', ja: '情報' },
	timeline: { en: 'Timeline', zh: '时间线', 'zh-TW': '時間軸', ja: 'タイムライン' },
	data: { en: 'Data', zh: '数据', 'zh-TW': '資料', ja: 'データ' },
	result: { en: 'Result', zh: '结果', 'zh-TW': '結果', ja: '結果' },
	error: { en: 'Error', zh: '错误', 'zh-TW': '錯誤', ja: 'エラー' },
	logs: { en: 'Logs', zh: '日志', 'zh-TW': '日誌', ja: 'ログ' },
	options: { en: 'Options', zh: '选项', 'zh-TW': '選項', ja: 'オプション' },
	createdAt: { en: 'Created at', zh: '创建时间', 'zh-TW': '建立時間', ja: '作成日時' },
	processedAt: { en: 'Processed at', zh: '处理时间', 'zh-TW': '處理時間', ja: '処理日時' },
	finishedAt: { en: 'Finished at', zh: '完成时间', 'zh-TW': '完成時間', ja: '完了日時' },
	spent: { en: 'Spent', zh: '耗时', 'zh-TW': '耗時', ja: '所要時間' },
	failedReason: { en: 'Failed reason', zh: '失败原因', 'zh-TW': '失敗原因', ja: '失敗理由' },
	attempts: { en: 'Attempts', zh: '尝试次数', 'zh-TW': '嘗試次數', ja: '試行回数' },
	progress: { en: 'Progress', zh: '进度', 'zh-TW': '進度', ja: '進捗' },
	finished: { en: 'Finished', zh: '已结束', 'zh-TW': '已結束', ja: '終了' },
	processed: { en: 'Processed', zh: '已处理', 'zh-TW': '已處理', ja: '処理済み' },
	created: { en: 'Created', zh: '已创建', 'zh-TW': '已建立', ja: '作成' },
	clientsConnected: { en: 'Clients: Connected', zh: '客户端：已连接', 'zh-TW': '用戶端：已連線', ja: 'クライアント: 接続中' },
	clientsBlocked: { en: 'Clients: Blocked', zh: '客户端：已阻塞', 'zh-TW': '用戶端：已阻塞', ja: 'クライアント: ブロック' },
	memoryPeak: { en: 'Memory: Peak', zh: '内存：峰值', 'zh-TW': '記憶體：峰值', ja: 'メモリ: ピーク' },
	memoryTotal: { en: 'Memory: Total', zh: '内存：总量', 'zh-TW': '記憶體：總量', ja: 'メモリ: 合計' },
	memoryUsed: { en: 'Memory: Used', zh: '内存：已用', 'zh-TW': '記憶體：已用', ja: 'メモリ: 使用中' },
	uptime: { en: 'Uptime', zh: '运行时间', 'zh-TW': '運行時間', ja: '稼働時間' },
	// API console
	apiConsole: { en: 'API console', zh: 'API 控制台', 'zh-TW': 'API 控制台', ja: 'APIコンソール' },
	endpoint: { en: 'Endpoint', zh: '接口', 'zh-TW': '端點', ja: 'エンドポイント' },
	paramsJson: { en: 'Params (JSON or JSON5)', zh: '参数 (JSON 或 JSON5)', 'zh-TW': '參數 (JSON 或 JSON5)', ja: 'パラメータ (JSON / JSON5)' },
	withCredential: { en: 'With credential', zh: '附带凭证', 'zh-TW': '附帶憑證', ja: '認証情報を付ける' },
	send: { en: 'Send', zh: '发送', 'zh-TW': '傳送', ja: '送信' },
	response: { en: 'Response', zh: '响应', 'zh-TW': '回應', ja: 'レスポンス' },
	// about
	sponsors: { en: 'Our lovely Sponsors', zh: '赞助者', 'zh-TW': '贊助者', ja: 'スポンサーの皆さん' },
	wellKnown: { en: 'Well-known resources', zh: '常用资源', 'zh-TW': '常用資源', ja: 'よく使うリソース' },
	// federation instance status
	suspended: { en: 'Suspended', zh: '已挂起', 'zh-TW': '已暫停', ja: '停止中' },
	blocked: { en: 'Blocked', zh: '已屏蔽', 'zh-TW': '已封鎖', ja: 'ブロック' },
	silenced: { en: 'Silenced', zh: '已静音', 'zh-TW': '已靜音', ja: 'サイレンス' },
	alive: { en: 'Alive', zh: '正常', 'zh-TW': '正常', ja: '正常' },
	bubble: { en: 'Bubble', zh: '气泡', 'zh-TW': '氣泡', ja: 'バブル' },
	// security
	activeEmailValidation: {
		en: 'Active Email Validation',
		zh: '主动邮箱验证',
		'zh-TW': '主動信箱驗證',
		ja: 'アクティブメール検証',
	},
	useVerifymail: {
		en: 'Use Verifymail.io API',
		zh: '使用 Verifymail.io API',
		'zh-TW': '使用 Verifymail.io API',
		ja: 'Verifymail.io API を使用',
	},
	verifymailKey: {
		en: 'Verifymail.io API Auth Key',
		zh: 'Verifymail.io API 密钥',
		'zh-TW': 'Verifymail.io API 金鑰',
		ja: 'Verifymail.io API 認証キー',
	},
	useTruemail: {
		en: 'Use TrueMail API',
		zh: '使用 TrueMail API',
		'zh-TW': '使用 TrueMail API',
		ja: 'TrueMail API を使用',
	},
	truemailInstance: {
		en: 'TrueMail API Instance',
		zh: 'TrueMail API 实例地址',
		'zh-TW': 'TrueMail API 實例',
		ja: 'TrueMail API インスタンス',
	},
	truemailKey: {
		en: 'TrueMail API Auth Key',
		zh: 'TrueMail API 密钥',
		'zh-TW': 'TrueMail API 金鑰',
		ja: 'TrueMail API 認証キー',
	},
	bannedEmailDomains: {
		en: 'Banned Email Domains',
		zh: '禁止的邮箱域名',
		'zh-TW': '禁止的信箱網域',
		ja: '禁止メールドメイン',
	},
	bannedEmailDomainsList: {
		en: 'Banned Email Domains List',
		zh: '禁止邮箱域名列表',
		'zh-TW': '禁止信箱網域清單',
		ja: '禁止メールドメイン一覧',
	},
	logIpAddress: {
		en: 'Log IP address',
		zh: '记录 IP 地址',
		'zh-TW': '記錄 IP 位址',
		ja: 'IPアドレスを記録',
	},
	// API docs (OpenAPI page title bits if any client-side)
	apiDocs: { en: 'API documentation', zh: 'API 文档', 'zh-TW': 'API 文件', ja: 'APIドキュメント' },
	// job queue actions
	promoteAllJobs: { en: 'Promote all jobs', zh: '全部提升优先级', 'zh-TW': '全部提升優先級', ja: '全ジョブを優先' },
	emptyQueue: { en: 'Empty queue', zh: '清空队列', 'zh-TW': '清空佇列', ja: 'キューを空にする' },
	refreshView: { en: 'Refresh view', zh: '刷新视图', 'zh-TW': '重新整理', ja: '表示を更新' },
	removeJobs: { en: 'Remove jobs', zh: '删除任务', 'zh-TW': '刪除任務', ja: 'ジョブを削除' },
	all: { en: 'All', zh: '全部', 'zh-TW': '全部', ja: 'すべて' },
	copyRaw: { en: 'Copy raw', zh: '复制原始数据', 'zh-TW': '複製原始資料', ja: '生データをコピー' },
	promote: { en: 'Promote', zh: '提升', 'zh-TW': '提升', ja: '優先' },
	moveTo: { en: 'Move to', zh: '移动到', 'zh-TW': '移動到', ja: '移動' },
	remove: { en: 'Remove', zh: '删除', 'zh-TW': '刪除', ja: '削除' },
	update: { en: 'Update', zh: '更新', 'zh-TW': '更新', ja: '更新' },
	dataEdit: { en: 'Data (edit)', zh: '数据（编辑）', 'zh-TW': '資料（編輯）', ja: 'データ（編集）' },
	attemptsOf: { en: 'of', zh: '/', 'zh-TW': '/', ja: '/' },
	attemptN: { en: 'Attempt', zh: '尝试', 'zh-TW': '嘗試', ja: '試行' },
	at: { en: 'at', zh: '于', 'zh-TW': '於', ja: 'at' },
	erroredInstances: { en: 'Errored instances', zh: '出错的实例', 'zh-TW': '出錯的站點', ja: 'エラーのあるインスタンス' },
	overviewOf: { en: 'Overview', zh: '概览', 'zh-TW': '概覽', ja: '概要' },
	jobsOf: { en: 'Jobs', zh: '任务', 'zh-TW': '任務', ja: 'ジョブ' },
	sub: { en: 'Sub', zh: '订阅', 'zh-TW': '訂閱', ja: '購読' },
	pub: { en: 'Pub', zh: '发布', 'zh-TW': '發佈', ja: '配信' },
	jobsCount: { en: 'jobs', zh: '个任务', 'zh-TW': '個任務', ja: '件' },
} as const satisfies Record<string, UiFb>;

export type CommonFbKey = keyof typeof commonFb;

/**
 * Prefer locales `_uiCommon[key]`; fall back to commonFb for stale packs.
 */
export function tCommon(key: CommonFbKey): string {
	const fromI18n = (i18n.ts as any)?._uiCommon?.[key];
	if (typeof fromI18n === 'string' && fromI18n.length > 0) {
		return fromI18n;
	}
	return tFb(commonFb[key]);
}
