<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps">
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-shield-lock"></i></template>
				<template #label>{{ t('title') }}</template>
				<template v-if="form.savedState.enabled" #suffix>{{ t('on') }}</template>
				<template v-else #suffix>{{ t('off') }}</template>
				<template v-if="form.modified.value" #footer>
					<MkFormFooter :form="form"/>
				</template>

				<div class="_gaps">
					<MkInfo>{{ t('info') }}</MkInfo>

					<MkSwitch v-model="form.state.enabled">
						<template #label>{{ t('enabled') }}<span v-if="form.modifiedStates.enabled" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('enabledCaption') }}</template>
					</MkSwitch>

					<MkSwitch v-model="form.state.checkOnSignin">
						<template #label>{{ t('checkOnSignin') }}<span v-if="form.modifiedStates.checkOnSignin" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkSwitch>

					<MkSwitch v-model="form.state.checkOnSignup">
						<template #label>{{ t('checkOnSignup') }}<span v-if="form.modifiedStates.checkOnSignup" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkSwitch>

					<MkSwitch v-model="form.state.autoSuspend">
						<template #label>{{ t('autoSuspend') }}<span v-if="form.modifiedStates.autoSuspend" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('autoSuspendCaption') }}</template>
					</MkSwitch>

					<MkSwitch v-model="form.state.hideNotesOnSuspend">
						<template #label>{{ t('hideNotes') }}<span v-if="form.modifiedStates.hideNotesOnSuspend" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkSwitch>

					<MkInput v-model="form.state.baseUrl" type="url">
						<template #label>{{ t('baseUrl') }}<span v-if="form.modifiedStates.baseUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('baseUrlCaption') }}</template>
					</MkInput>

					<MkInput v-model="form.state.apiKey" type="password">
						<template #label>{{ t('apiKey') }}<span v-if="form.modifiedStates.apiKey" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('apiKeyCaption') }}</template>
					</MkInput>

					<MkInput v-model="form.state.model">
						<template #label>{{ t('model') }}<span v-if="form.modifiedStates.model" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkInput>

					<MkSelect v-model="form.state.apiStyle">
						<template #label>{{ t('apiStyle') }}<span v-if="form.modifiedStates.apiStyle" class="_modified">{{ i18n.ts.modified }}</span></template>
						<option value="auto">{{ t('apiStyleAuto') }}</option>
						<option value="chat.completions">chat/completions</option>
						<option value="responses">responses</option>
					</MkSelect>

					<MkInput v-model="form.state.minLinkedAccounts" type="number">
						<template #label>{{ t('minLinked') }}<span v-if="form.modifiedStates.minLinkedAccounts" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('minLinkedCaption') }}</template>
					</MkInput>

					<MkSwitch v-model="form.state.requireIpAndFingerprint">
						<template #label>{{ t('requireBoth') }}<span v-if="form.modifiedStates.requireIpAndFingerprint" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('requireBothCaption') }}</template>
					</MkSwitch>

					<MkInput v-model="form.state.signinWindowMinutes" type="number">
						<template #label>{{ t('signinWindow') }}<span v-if="form.modifiedStates.signinWindowMinutes" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkInput>

					<MkInput v-model="form.state.maxSigninsInWindow" type="number">
						<template #label>{{ t('maxSignins') }}<span v-if="form.modifiedStates.maxSigninsInWindow" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkInput>

					<MkInput v-model="form.state.cooldownSeconds" type="number">
						<template #label>{{ t('cooldown') }}<span v-if="form.modifiedStates.cooldownSeconds" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkInput>

					<MkInput v-model="form.state.requestTimeoutMs" type="number">
						<template #label>{{ t('timeout') }}<span v-if="form.modifiedStates.requestTimeoutMs" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkInput>

					<MkSwitch v-model="form.state.failOpen">
						<template #label>{{ t('failOpen') }}<span v-if="form.modifiedStates.failOpen" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('failOpenCaption') }}</template>
					</MkSwitch>

					<MkTextarea v-model="form.state.systemPrompt">
						<template #label>{{ t('systemPrompt') }}<span v-if="form.modifiedStates.systemPrompt" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('systemPromptCaption') }}</template>
					</MkTextarea>
				</div>
			</MkFolder>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { definePage } from '@/page.js';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import { useForm } from '@/use/use-form.js';
import MkFormFooter from '@/components/MkFormFooter.vue';

type LangPack = { en: string; zh: string; 'zh-TW'?: string; ja?: string };

const FB: Record<string, LangPack> = {
	title: { en: 'AI multi-account control', zh: 'AI 刷号/多账号管控', 'zh-TW': 'AI 刷號/多帳號管控', ja: 'AI多垢対策' },
	on: { en: 'On', zh: '开启', 'zh-TW': '開啟', ja: 'オン' },
	off: { en: 'Off', zh: '关闭', 'zh-TW': '關閉', ja: 'オフ' },
	info: {
		en: 'Links local accounts only when they share the same real IP AND browser fingerprint (configurable). Passes full user identity to AI. Optional auto-suspend of the seed account. Separate API key from note moderation.',
		zh: '默认仅当「同一真实 IP + 同一浏览器指纹」同时匹配才关联账号（可配置）。会把用户身份完整传给 AI 判定。可选自动封禁触发账号。API Key 与帖子审核独立。',
		'zh-TW': '預設僅當同一 IP 與指紋同時相符才關聯。會將使用者身分傳給 AI。',
		ja: '既定は同一実IPかつ同一指紋のときのみ関連付け。ユーザー身元をAIに渡し判定。',
	},
	autoSuspendCaption: {
		en: 'When AI (or hard heuristic) flags abuse, auto-suspend the seed account only (not the whole cohort). Moderators/root are never auto-suspended. Linked accounts are logged for review.',
		zh: 'AI 或强启发式判定滥用时，仅自动封禁触发账号（不连坐全员）。版主/root 不会被自动封。关联账号写入日志供人工复核。',
		'zh-TW': '判定濫用時僅自動封禁觸發帳號，關聯帳號記錄供複核。',
		ja: '判定時はシード垢のみ自動凍結。関連垢はログで確認。',
	},
	enabled: { en: 'Enable AI multi-account control', zh: '启用 AI 多账号管控', 'zh-TW': '啟用 AI 多帳號管控', ja: 'AI多垢対策を有効化' },
	enabledCaption: {
		en: 'Master switch. When off, nothing is checked or suspended by this module.',
		zh: '总开关。关闭时不做检测与自动封禁。',
		'zh-TW': '總開關。關閉時不做檢測與自動封禁。',
		ja: 'マスタースイッチ。オフ時は検査も凍結もしません。',
	},
	checkOnSignin: { en: 'Check on sign-in', zh: '登录时检测', 'zh-TW': '登入時檢測', ja: 'ログイン時に検査' },
	checkOnSignup: { en: 'Check on sign-up', zh: '注册完成时检测', 'zh-TW': '註冊完成時檢測', ja: '登録完了時に検査' },
	autoSuspend: { en: 'Auto-suspend seed account', zh: '自动封禁触发账号', 'zh-TW': '自動封禁觸發帳號', ja: 'シード垢を自動凍結' },
	hideNotes: { en: 'Hide notes when suspending', zh: '封禁时隐藏其帖子', 'zh-TW': '封禁時隱藏貼文', ja: '凍結時にノートを隠す' },
	baseUrl: { en: 'API base URL', zh: 'API 基址', 'zh-TW': 'API 基址', ja: 'APIベースURL' },
	baseUrlCaption: {
		en: 'OpenAI-compatible, e.g. https://api.openai.com/v1 or https://api.x.ai/v1',
		zh: 'OpenAI 兼容，如 https://api.openai.com/v1 或 https://api.x.ai/v1',
		'zh-TW': 'OpenAI 相容基址',
		ja: 'OpenAI互換ベースURL',
	},
	apiKey: { en: 'API key (dedicated)', zh: 'API 密钥（独立）', 'zh-TW': 'API 金鑰（獨立）', ja: 'APIキー（専用）' },
	apiKeyCaption: {
		en: 'Separate from AI note moderation. Leave blank to keep existing key.',
		zh: '与帖子 AI 审核密钥分离。留空保存可保留原密钥。',
		'zh-TW': '與貼文 AI 審核金鑰分離。留空保留原金鑰。',
		ja: 'ノート審査キーと別。空保存で既存維持。',
	},
	model: { en: 'Model', zh: '模型', 'zh-TW': '模型', ja: 'モデル' },
	apiStyle: { en: 'API style', zh: '接口类型', 'zh-TW': '介面類型', ja: 'API形式' },
	apiStyleAuto: { en: 'Auto', zh: '自动', 'zh-TW': '自動', ja: '自動' },
	minLinked: { en: 'Min linked accounts', zh: '最少关联账号数', 'zh-TW': '最少關聯帳號數', ja: '最小関連垢数' },
	minLinkedCaption: {
		en: 'Need at least this many local accounts linked (by the mode below) before evaluating.',
		zh: '按下方关联规则，至少关联到这么多本站账号才开始评估。',
		'zh-TW': '依下方關聯規則，至少關聯這麼多本站帳號才評估。',
		ja: '下記の関連付けでこの数以上のローカル垢がある時のみ評価。',
	},
	requireBoth: {
		en: 'Require IP + fingerprint together',
		zh: '必须 IP 与指纹同时匹配',
		'zh-TW': '必須 IP 與指紋同時相符',
		ja: 'IPと指紋の両方が一致必須',
	},
	requireBothCaption: {
		en: 'Only treat accounts as linked when they share the same real IP AND the same browser fingerprint. IP-only or fingerprint-only is not enough.',
		zh: '仅当账号同时共享同一真实 IP 与同一浏览器指纹时才算关联。仅 IP 或仅指纹不够。',
		'zh-TW': '僅當同時共用同一 IP 與指紋才算關聯。',
		ja: '同一実IPかつ同一指紋のときのみ関連付け。どちらか一方では不可。',
	},
	signinWindow: { en: 'Sign-in window (minutes)', zh: '登录统计窗口（分钟）', 'zh-TW': '登入統計視窗（分）', ja: 'ログイン集計窓（分）' },
	maxSignins: { en: 'Max sign-ins in window', zh: '窗口内最大登录次数', 'zh-TW': '視窗內最大登入次數', ja: '窓内最大ログイン数' },
	cooldown: { en: 'Per-user cooldown (seconds)', zh: '每用户冷却（秒）', 'zh-TW': '每使用者冷卻（秒）', ja: 'ユーザーごとのクールダウン（秒）' },
	timeout: { en: 'Timeout (ms)', zh: '超时（毫秒）', 'zh-TW': '逾時（毫秒）', ja: 'タイムアウト（ms）' },
	failOpen: { en: 'Fail open on AI error', zh: 'AI 失败时不动作', 'zh-TW': 'AI 失敗時不動作', ja: 'AI失敗時は何もしない' },
	failOpenCaption: {
		en: 'If off, hard heuristic thresholds may still auto-suspend when AI is down.',
		zh: '关闭后，AI 不可用时仍可能按强启发式自动封禁。',
		'zh-TW': '關閉後，AI 不可用時仍可能依啟發式封禁。',
		ja: 'オフ時はAI不通でもヒューリスティックで凍結し得ます。',
	},
	systemPrompt: { en: 'Custom system prompt', zh: '自定义系统提示', 'zh-TW': '自訂系統提示', ja: 'システムプロンプト' },
	systemPromptCaption: {
		en: 'Optional. Empty = built-in anti-abuse JSON classifier.',
		zh: '可选。留空使用内置刷号分类提示。',
		'zh-TW': '可選。留空使用內建提示。',
		ja: '空なら内蔵プロンプト。',
	},
};

function t(key: keyof typeof FB): string {
	const fb = FB[key];
	const lang = (
		miLocalStorage.getItem('lang')
		|| (typeof navigator !== 'undefined' ? navigator.language : 'en-US')
		|| 'en-US'
	).replace('_', '-').toLowerCase();
	if (lang.startsWith('zh-tw') || lang.startsWith('zh-hk') || lang.startsWith('zh-hant')) {
		return fb['zh-TW'] || fb.zh;
	}
	if (lang.startsWith('zh')) return fb.zh;
	if (lang.startsWith('ja') && fb.ja) return fb.ja;
	return fb.en;
}

const meta = await misskeyApi('admin/meta') as any;
const cfg = meta.aiAbuseControlConfig ?? {};

const form = useForm({
	enabled: cfg.enabled === true,
	checkOnSignin: cfg.checkOnSignin !== false,
	checkOnSignup: cfg.checkOnSignup !== false,
	autoSuspend: cfg.autoSuspend === true,
	hideNotesOnSuspend: cfg.hideNotesOnSuspend !== false,
	baseUrl: cfg.baseUrl ?? '',
	apiKey: '',
	model: cfg.model ?? 'gpt-4o-mini',
	apiStyle: cfg.apiStyle ?? 'auto',
	minLinkedAccounts: cfg.minLinkedAccounts ?? 3,
	requireIpAndFingerprint: cfg.requireIpAndFingerprint !== false,
	signinWindowMinutes: cfg.signinWindowMinutes ?? 60,
	maxSigninsInWindow: cfg.maxSigninsInWindow ?? 20,
	cooldownSeconds: cfg.cooldownSeconds ?? 300,
	requestTimeoutMs: cfg.requestTimeoutMs ?? 10000,
	failOpen: cfg.failOpen !== false,
	systemPrompt: cfg.systemPrompt ?? '',
}, async (state) => {
	const payload: any = {
		enabled: state.enabled,
		checkOnSignin: state.checkOnSignin,
		checkOnSignup: state.checkOnSignup,
		autoSuspend: state.autoSuspend,
		hideNotesOnSuspend: state.hideNotesOnSuspend,
		baseUrl: state.baseUrl?.trim() ? state.baseUrl.trim() : null,
		model: state.model?.trim() || 'gpt-4o-mini',
		apiStyle: state.apiStyle,
		minLinkedAccounts: Number(state.minLinkedAccounts) || 3,
		requireIpAndFingerprint: state.requireIpAndFingerprint,
		signinWindowMinutes: Number(state.signinWindowMinutes) || 60,
		maxSigninsInWindow: Number(state.maxSigninsInWindow) || 20,
		cooldownSeconds: Number(state.cooldownSeconds) || 0,
		requestTimeoutMs: Number(state.requestTimeoutMs) || 10000,
		failOpen: state.failOpen,
		systemPrompt: state.systemPrompt?.trim() ? state.systemPrompt.trim() : null,
	};
	if (state.apiKey && state.apiKey !== '<redacted>') {
		payload.apiKey = state.apiKey;
	}
	await os.apiWithDialog('admin/update-meta', {
		aiAbuseControlConfig: payload,
	});
	form.state.apiKey = '';
	await fetchInstance(true);
});

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: t('title'),
	icon: 'ti ti-shield-lock',
}));
</script>
