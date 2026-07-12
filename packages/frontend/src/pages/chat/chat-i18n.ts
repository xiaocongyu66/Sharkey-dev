/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';

type FallbackTable = {
	en: string;
	zh: string;
	'zh-TW'?: string;
	ja: string;
	ko?: string;
	de?: string;
	fr?: string;
	es?: string;
	ru?: string;
};

/**
 * Resolve a chat i18n string with multi-language fallbacks when
 * the browser still has an outdated locale cache without the new keys.
 */
export function chatT(key: string, fb: FallbackTable): string {
	const fromI18n = (i18n.ts as any)?._chat?.[key];
	if (typeof fromI18n === 'string' && fromI18n.length > 0 && !fromI18n.includes(key)) {
		return fromI18n;
	}

	const lang = (miLocalStorage.getItem('lang') || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US').replace('_', '-');
	const lower = lang.toLowerCase();

	if (lower.startsWith('zh-tw') || lower.startsWith('zh-hk') || lower.startsWith('zh-hant')) {
		return fb['zh-TW'] || fb.zh;
	}
	if (lower.startsWith('zh')) return fb.zh;
	if (lower.startsWith('ja')) return fb.ja;
	if (lower.startsWith('ko') && fb.ko) return fb.ko;
	if (lower.startsWith('de') && fb.de) return fb.de;
	if (lower.startsWith('fr') && fb.fr) return fb.fr;
	if (lower.startsWith('es') && fb.es) return fb.es;
	if (lower.startsWith('ru') && fb.ru) return fb.ru;
	return fb.en;
}

/** If new chat keys are missing, drop cached locale so the next load re-fetches. */
export function ensureChatLocaleFresh(): void {
	const muted = (i18n.ts as any)?._chat?.mutedAll;
	if (typeof muted === 'string' && muted.length > 0) return;
	try {
		miLocalStorage.removeItem('locale');
		miLocalStorage.removeItem('localeVersion');
	} catch {
		// ignore
	}
}

export const chatFb = {
	mutedAll: {
		en: 'All members are muted',
		zh: '全体禁言中',
		'zh-TW': '全體禁言中',
		ja: '全体ミュート中',
		ko: '전체 뮤트 중',
		de: 'Alle Mitglieder stummgeschaltet',
		fr: 'Tous les membres sont en sourdine',
		es: 'Todos los miembros están silenciados',
		ru: 'Все участники в муте',
	},
	mutedAllHint: {
		en: 'Only the owner, room admins, and instance moderators can send messages.',
		zh: '仅群主、群管理员和实例管理员可以发言。',
		'zh-TW': '僅群主、群管理員和實例管理員可以發言。',
		ja: 'オーナー、ルーム管理者、およびインスタンスのモデレーターのみ発言できます。',
		ko: '방장, 방 관리자, 인스턴스 모더레이터만 메시지를 보낼 수 있습니다.',
		de: 'Nur der Besitzer, Raum-Admins und Instanz-Moderatoren können senden.',
		fr: 'Seuls le propriétaire, les admins et les modérateurs peuvent envoyer des messages.',
		es: 'Solo el propietario, administradores y moderadores pueden enviar mensajes.',
		ru: 'Писать могут только владелец, админы комнаты и модераторы инстанса.',
	},
	mutedAllComposerDisabled: {
		en: 'You cannot send messages while this room is muted for all members.',
		zh: '全体禁言中，无法输入或发送消息。',
		'zh-TW': '全體禁言中，無法輸入或傳送訊息。',
		ja: '全体ミュート中のため、メッセージを入力・送信できません。',
		ko: '전체 뮤트 중에는 메시지를 보내거나 입력할 수 없습니다.',
		de: 'Während der Gesamtsperre können keine Nachrichten gesendet werden.',
		fr: 'Envoi de messages impossible pendant le mute général.',
		es: 'No se pueden enviar mensajes mientras el silenciado general está activo.',
		ru: 'Нельзя отправлять сообщения, пока включён общий мут.',
	},
	stickers: {
		en: 'Stickers',
		zh: '表情包',
		'zh-TW': '貼圖',
		ja: 'スタンプ',
		ko: '스티커',
		de: 'Sticker',
		fr: 'Stickers',
		es: 'Stickers',
		ru: 'Стикеры',
	},
	joinPolicy: {
		en: 'Join policy',
		zh: '加入策略',
		'zh-TW': '加入策略',
		ja: '参加ポリシー',
	},
	joinPolicyPublic: {
		en: 'Public (anyone with the room link can join)',
		zh: '公开加入（知道房间链接即可）',
		'zh-TW': '公開加入（知道房間連結即可）',
		ja: '公開（ルームリンクがあれば参加可）',
	},
	joinPolicyLink: {
		en: 'Invite link / code',
		zh: '链接/邀请码加入',
		'zh-TW': '連結/邀請碼加入',
		ja: 'リンク / 招待コード',
	},
	joinPolicyInvite: {
		en: 'Invite only',
		zh: '邀请加入',
		'zh-TW': '邀請加入',
		ja: '招待のみ',
	},
	joinPolicyClosed: {
		en: 'Closed (no new joins)',
		zh: '禁止加入',
		'zh-TW': '禁止加入',
		ja: '参加不可',
	},
	joinByInviteCode: {
		en: 'Join with invite code',
		zh: '通过邀请码加入',
		'zh-TW': '透過邀請碼加入',
		ja: '招待コードで参加',
	},
	enterInviteCode: {
		en: 'Enter invite code',
		zh: '输入邀请码',
		'zh-TW': '輸入邀請碼',
		ja: '招待コードを入力',
	},
	inviteCode: {
		en: 'Invite code',
		zh: '邀请码',
		'zh-TW': '邀請碼',
		ja: '招待コード',
	},
	copyInviteCode: {
		en: 'Copy invite code',
		zh: '复制邀请码',
		'zh-TW': '複製邀請碼',
		ja: '招待コードをコピー',
	},
	regenerateInviteCode: {
		en: 'Regenerate invite code',
		zh: '重新生成邀请码',
		'zh-TW': '重新產生邀請碼',
		ja: '招待コードを再生成',
	},
	notAMember: {
		en: 'You are not a member of this room.',
		zh: '你还不是该群成员。',
		'zh-TW': '你還不是此群的成員。',
		ja: 'このルームのメンバーではありません。',
	},
	canJoinDirectly: {
		en: 'You can join directly.',
		zh: '可直接加入。',
		'zh-TW': '可直接加入。',
		ja: 'そのまま参加できます。',
	},
	needInviteCodeToJoin: {
		en: 'Enter an invite code to join.',
		zh: '请输入邀请码后加入。',
		'zh-TW': '請輸入邀請碼後加入。',
		ja: '招待コードを入力して参加してください。',
	},
	needInvitationToJoin: {
		en: 'You need an invitation from the owner or an admin.',
		zh: '需要群主/管理员邀请。',
		'zh-TW': '需要群主/管理員邀請。',
		ja: 'オーナーまたは管理者の招待が必要です。',
	},
	joiningClosed: {
		en: 'This room is not accepting new members.',
		zh: '该群当前禁止加入。',
		'zh-TW': '此群目前禁止加入。',
		ja: 'このルームは現在参加を受け付けていません。',
	},
	joining: {
		en: 'Joining…',
		zh: '加入中…',
		'zh-TW': '加入中…',
		ja: '参加中…',
	},
	joinRoom: {
		en: 'Join room',
		zh: '加入群聊',
		'zh-TW': '加入群聊',
		ja: 'ルームに参加',
	},
	joinFailed: {
		en: 'Failed to join',
		zh: '加入失败',
		'zh-TW': '加入失敗',
		ja: '参加に失敗しました',
	},
	signinToJoinRoom: {
		en: 'Sign in to join this room',
		zh: '需要登录后进入群聊',
		'zh-TW': '需要登入後進入群聊',
		ja: '参加するにはログインが必要です',
	},
	signinToJoinRoomHint: {
		en: 'You need an account to join and view messages.',
		zh: '打开此链接需要账号。登录后可加入并查看消息。',
		'zh-TW': '開啟此連結需要帳號。登入後可加入並查看訊息。',
		ja: 'このリンクを開くにはアカウントが必要です。ログイン後に参加・閲覧できます。',
	},
	noStickersYet: {
		en: 'No sticker packs yet. Import a Telegram pack (requires TELEGRAM_BOT_TOKEN) or create a pack and add images.',
		zh: '暂无表情包。可导入 Telegram 贴纸包（需服务器配置 TELEGRAM_BOT_TOKEN），或创建后添加图片。',
		'zh-TW': '尚無貼圖包。可匯入 Telegram 貼圖包（需伺服器設定 TELEGRAM_BOT_TOKEN），或建立後新增圖片。',
		ja: 'スタンプパックはまだありません。Telegram パックをインポートするか（TELEGRAM_BOT_TOKEN が必要）、パックを作成して画像を追加してください。',
	},
	importTelegram: {
		en: 'Import',
		zh: '导入',
		'zh-TW': '匯入',
		ja: 'インポート',
	},
	roleOwner: {
		en: 'Owner',
		zh: '群主',
		'zh-TW': '群主',
		ja: 'オーナー',
	},
	roleAdmin: {
		en: 'Admin',
		zh: '管理员',
		'zh-TW': '管理員',
		ja: '管理者',
	},
	roleMember: {
		en: 'Member',
		zh: '成员',
		'zh-TW': '成員',
		ja: 'メンバー',
	},
	promoteToAdmin: {
		en: 'Make admin',
		zh: '设为管理员',
		'zh-TW': '設為管理員',
		ja: '管理者にする',
	},
	demoteToMember: {
		en: 'Remove admin',
		zh: '降为成员',
		'zh-TW': '降為成員',
		ja: '管理者を外す',
	},
	mentionsOfYou: {
		en: 'Mentions of you',
		zh: '有人 @ 了你',
		'zh-TW': '有人 @ 了你',
		ja: 'あなたのメンション',
		ko: '나를 멘션',
		de: 'Erwähnungen von dir',
		fr: 'Mentions de vous',
		es: 'Menciones a ti',
		ru: 'Упоминания вас',
	},
	prevMention: {
		en: 'Previous mention',
		zh: '上一条 @',
		'zh-TW': '上一則 @',
		ja: '前のメンション',
	},
	nextMention: {
		en: 'Next mention',
		zh: '下一条 @',
		'zh-TW': '下一則 @',
		ja: '次のメンション',
	},
	manage: {
		en: 'Manage',
		zh: '管理',
		'zh-TW': '管理',
		ja: '管理',
	},
	manageHint: {
		en: 'Room owner, room admins, and instance moderators can change these settings.',
		zh: '群主、群管理员以及论坛管理员/站长可在此管理群聊。',
		'zh-TW': '群主、群管理員以及論壇管理員/站長可在此管理群聊。',
		ja: 'オーナー、ルーム管理者、およびインスタンスのモデレーターが設定できます。',
	},
	manageInManageTab: {
		en: 'Use the Manage tab for mute-all, announcement, clear messages, and delete room.',
		zh: '全体禁言、公告、清理消息、删除房间请到「管理」页操作。',
		'zh-TW': '全體禁言、公告、清理訊息、刪除房間請到「管理」頁操作。',
		ja: '全体ミュート・お知らせ・メッセージ削除・ルーム削除は「管理」タブで操作します。',
	},
	roomSettings: {
		en: 'Room settings',
		zh: '房间设置',
		'zh-TW': '房間設定',
		ja: 'ルーム設定',
	},
	dangerZone: {
		en: 'Danger zone',
		zh: '危险操作',
		'zh-TW': '危險操作',
		ja: '危険な操作',
	},
	clearMessages: {
		en: 'Clear all messages',
		zh: '清理聊天消息',
		'zh-TW': '清理聊天訊息',
		ja: 'メッセージをすべて削除',
	},
	clearMessagesHint: {
		en: 'Permanently delete every message in this room for all members.',
		zh: '永久删除本群全部消息，所有成员可见内容将被清空。',
		'zh-TW': '永久刪除此群全部訊息，所有成員可見內容將被清空。',
		ja: 'このルームの全メッセージを永久に削除します。',
	},
	clearMessagesConfirm: {
		en: 'Clear all messages in this room? This cannot be undone.',
		zh: '确定清理本群全部聊天消息？此操作不可撤销。',
		'zh-TW': '確定清理此群全部聊天訊息？此操作無法復原。',
		ja: 'このルームのメッセージをすべて削除しますか？元に戻せません。',
	},
	about: {
		en: 'About',
		zh: '关于',
		'zh-TW': '關於',
		ja: '情報',
	},
	e2eeOn: {
		en: 'Encrypted',
		zh: '端到端加密',
		'zh-TW': '端到端加密',
		ja: '暗号化中',
	},
	e2eeOff: {
		en: 'Not encrypted',
		zh: '未加密',
		'zh-TW': '未加密',
		ja: '未暗号化',
	},
	e2eePeerNoKey: {
		en: 'The other user has not enabled E2EE yet. Ask them to open this chat once.',
		zh: '对方尚未启用端到端加密。请对方先打开一次此私聊。',
		'zh-TW': '對方尚未啟用端到端加密。請對方先打開一次此私聊。',
		ja: '相手が E2EE をまだ有効にしていません。相手にこのチャットを一度開いてもらってください。',
	},
	e2eePlaceholder: {
		en: 'Encrypted message…',
		zh: '加密消息…',
		'zh-TW': '加密訊息…',
		ja: '暗号化メッセージ…',
	},
	e2eeEncryptFailed: {
		en: 'Failed to encrypt message.',
		zh: '加密失败。',
		'zh-TW': '加密失敗。',
		ja: '暗号化に失敗しました。',
	},
	e2eeDecryptFailed: {
		en: 'Unable to decrypt (missing keys).',
		zh: '无法解密（缺少密钥）。',
		'zh-TW': '無法解密（缺少金鑰）。',
		ja: '復号できません（鍵がありません）。',
	},
	encryptedMessage: {
		en: '🔒 Encrypted message',
		zh: '🔒 加密消息',
		'zh-TW': '🔒 加密訊息',
		ja: '🔒 暗号化メッセージ',
	},
	recentStickers: {
		en: 'Recent',
		zh: '最近使用',
		'zh-TW': '最近使用',
		ja: '最近',
		ko: '최근',
		de: 'Zuletzt',
		fr: 'Récents',
		es: 'Recientes',
		ru: 'Недавние',
	},
	wsSendFailed: {
		en: 'Failed to send. Check your connection and try again.',
		zh: '发送失败，请检查网络后重试。',
		'zh-TW': '傳送失敗，請檢查網路後重試。',
		ja: '送信に失敗しました。接続を確認して再試行してください。',
		ko: '전송에 실패했습니다. 연결을 확인한 뒤 다시 시도하세요.',
		de: 'Senden fehlgeschlagen. Verbindung prüfen und erneut versuchen.',
		fr: 'Échec de l’envoi. Vérifiez la connexion et réessayez.',
		es: 'Error al enviar. Comprueba la conexión e inténtalo de nuevo.',
		ru: 'Не удалось отправить. Проверьте соединение и повторите.',
	},
	loadFailed: {
		en: 'Failed to load',
		zh: '加载失败',
		'zh-TW': '載入失敗',
		ja: '読み込みに失敗しました',
		ko: '불러오기 실패',
		de: 'Laden fehlgeschlagen',
		fr: 'Échec du chargement',
		es: 'Error al cargar',
		ru: 'Не удалось загрузить',
	},
	roomOpenFailed: {
		en: 'Cannot open this room (missing or no access).',
		zh: '无法打开该房间（不存在或无权访问）',
		'zh-TW': '無法打開此房間（不存在或無權存取）',
		ja: 'このルームを開けません（存在しないか権限がありません）',
		ko: '이 방을 열 수 없습니다(없거나 권한 없음).',
		de: 'Raum kann nicht geöffnet werden (fehlt oder keine Berechtigung).',
		fr: 'Impossible d’ouvrir ce salon (introuvable ou accès refusé).',
		es: 'No se puede abrir esta sala (no existe o sin acceso).',
		ru: 'Не удалось открыть комнату (нет доступа или не существует).',
	},
	wsConnected: {
		en: 'Realtime connected',
		zh: '实时连接已建立',
		'zh-TW': '即時連線已建立',
		ja: 'リアルタイム接続済み',
	},
	wsReconnecting: {
		en: 'Reconnecting…',
		zh: '实时连接重连中…',
		'zh-TW': '即時連線重連中…',
		ja: '再接続中…',
	},
	searchPlaceholder: {
		en: 'Search messages…',
		zh: '搜索消息…',
		'zh-TW': '搜尋訊息…',
		ja: 'メッセージを検索…',
		ko: '메시지 검색…',
	},
	filterBySpeaker: {
		en: 'Speaker',
		zh: '发言人',
		'zh-TW': '發言人',
		ja: '発言者',
		ko: '발언자',
	},
	replyVideo: {
		en: '[Video]',
		zh: '[视频]',
		'zh-TW': '[影片]',
		ja: '[動画]',
		ko: '[동영상]',
	},
	replyImage: {
		en: '[Image]',
		zh: '[图片]',
		'zh-TW': '[圖片]',
		ja: '[画像]',
		ko: '[이미지]',
	},
	replyAudio: {
		en: '[Audio]',
		zh: '[音频]',
		'zh-TW': '[音訊]',
		ja: '[音声]',
		ko: '[오디오]',
	},
	replyFile: {
		en: '[File]',
		zh: '[文件]',
		'zh-TW': '[檔案]',
		ja: '[ファイル]',
		ko: '[파일]',
	},
	replyE2ee: {
		en: '[Encrypted]',
		zh: '[加密消息]',
		'zh-TW': '[加密訊息]',
		ja: '[暗号化]',
	},
	messageRateLimit: {
		en: 'Message rate limit (seconds)',
		zh: '聊天限速（秒）',
		'zh-TW': '聊天限速（秒）',
		ja: '発言制限（秒）',
	},
	messageRateLimitHint: {
		en: '0 = unlimited. Example: 5 means one message every 5 seconds. Owner, room admins, and instance moderators are exempt.',
		zh: '设为 0 不限制。例如设为 5 表示每 5 秒只能发 1 条。群主、群管理员、站长与管理员不受限。',
		'zh-TW': '設為 0 不限制。例如設為 5 表示每 5 秒只能發 1 則。群主、群管理員、站長與管理員不受限。',
		ja: '0 で無制限。例: 5 は 5 秒に 1 通。オーナー・ルーム管理者・インスタンスのモデレーターは対象外。',
	},
	roomRateLimited: {
		en: 'Sending too fast. Please wait a few seconds.',
		zh: '发言过快，请稍后再发。',
		'zh-TW': '發言過快，請稍後再發。',
		ja: '送信が早すぎます。少し待ってから再送してください。',
	},
	selectSpeaker: {
		en: 'Choose speaker',
		zh: '选择发言人',
		'zh-TW': '選擇發言人',
		ja: '発言者を選択',
		ko: '발언자 선택',
	},
	clearSpeaker: {
		en: 'Clear',
		zh: '清除',
		'zh-TW': '清除',
		ja: 'クリア',
		ko: '지우기',
	},
	jumpToMessage: {
		en: 'Jump to message',
		zh: '跳转到消息',
		'zh-TW': '跳到訊息',
		ja: 'メッセージへ移動',
		ko: '메시지로 이동',
	},
	recentFromSpeaker: {
		en: 'Recent messages from this speaker',
		zh: '该发言人的最近消息',
		'zh-TW': '此發言人的最近訊息',
		ja: 'この発言者の最近のメッセージ',
		ko: '이 발언자의 최근 메시지',
	},
	searchOrSpeakerHint: {
		en: 'Enter keywords, and/or pick a speaker. With only a speaker selected, recent messages from them are listed. Tap a result to jump in the chat.',
		zh: '可输入关键词搜索；也可指定发言人。仅选发言人时显示其最近消息。点击结果可跳转到聊天中的对应位置。',
		'zh-TW': '可輸入關鍵字搜尋；也可指定發言人。僅選發言人時顯示其最近訊息。點擊結果可跳到聊天中的對應位置。',
		ja: 'キーワード検索、発言者の指定ができます。発言者のみ指定するとその人の最近のメッセージを表示します。結果をタップでチャット内にジャンプします。',
		ko: '키워드 검색 및/또는 발언자 지정. 발언자만 선택하면 해당 사용자의 최근 메시지가 표시됩니다. 결과를 탭하면 채팅으로 이동합니다.',
	},
	jumpingToMessage: {
		en: 'Jumping to message…',
		zh: '正在跳转到消息…',
		'zh-TW': '正在跳到訊息…',
		ja: 'メッセージへ移動中…',
		ko: '메시지로 이동 중…',
	},
	staffReadonlyView: {
		en: 'Staff view (not a member)',
		zh: '管理员只读查看（非群成员）',
		'zh-TW': '管理員唯讀檢視（非群成員）',
		ja: 'スタッフ閲覧（非メンバー）',
		ko: '스태프 보기 (비회원)',
	},
	staffReadonlyViewHint: {
		en: 'You can read this room for moderation. Sending requires membership.',
		zh: '可查看群聊消息以便处理举报；发送消息仍需加入该群。',
		'zh-TW': '可檢視群聊訊息以便處理檢舉；傳送訊息仍需加入此群。',
		ja: 'モデレーションのためルームを閲覧できます。送信には参加が必要です。',
		ko: '신고 처리를 위해 이 방을 읽을 수 있습니다. 전송하려면 가입이 필요합니다.',
	},
	sending: {
		en: 'Sending…',
		zh: '发送中…',
		'zh-TW': '傳送中…',
		ja: '送信中…',
		ko: '전송 중…',
	},
	sendingHint: {
		en: 'Message is being sent. Please wait…',
		zh: '消息发送中，请稍候…',
		'zh-TW': '訊息傳送中，請稍候…',
		ja: 'メッセージを送信しています。しばらくお待ちください…',
		ko: '메시지를 보내는 중입니다. 잠시만 기다려 주세요…',
	},
} as const satisfies Record<string, FallbackTable>;
