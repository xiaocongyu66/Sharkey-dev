<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
	<div class="_gaps">
		<MkInfo>{{ t('info') }}</MkInfo>
		<MkInfo v-if="!allowUserKey" warn>{{ t('userKeyDisabled') }}</MkInfo>

		<FormSection>
			<template #label>{{ t('prefs') }}</template>
			<div class="_gaps">
				<MkInput v-model="targetLang">
					<template #label>{{ t('targetLang') }}</template>
					<template #caption>{{ t('targetLangCaption') }}</template>
				</MkInput>
				<MkSwitch v-model="selective">
					<template #label>{{ t('selective') }}</template>
					<template #caption>{{ t('selectiveCaption') }}</template>
				</MkSwitch>
			</div>
		</FormSection>

		<FormSection v-if="allowUserKey">
			<template #label>{{ t('ownKey') }}</template>
			<div class="_gaps">
				<MkInfo>{{ t('ownKeyInfo') }}</MkInfo>
				<MkInput v-model="apiKey" type="password">
					<template #label>{{ t('apiKey') }}{{ hasApiKey ? ` (${t('keySaved')})` : '' }}</template>
					<template #caption>{{ t('apiKeyCaption') }}</template>
				</MkInput>
				<MkInput v-model="model">
					<template #label>{{ t('model') }}</template>
				</MkInput>
				<MkButton danger :disabled="!hasApiKey" @click="clearKey">{{ t('clearKey') }}</MkButton>
			</div>
		</FormSection>

		<div class="_buttons">
			<MkButton primary @click="save">{{ i18n.ts.save }}</MkButton>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { miLocalStorage } from '@/local-storage.js';
import { instance } from '@/instance.js';
import { $i } from '@/i.js';
import { updateCurrentAccount } from '@/accounts.js';
import MkInput from '@/components/MkInput.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import FormSection from '@/components/form/section.vue';

type LangPack = { en: string; zh: string; 'zh-TW'?: string; ja?: string };

const FB: Record<string, LangPack> = {
	title: { en: 'AI translation', zh: 'AI 翻译', 'zh-TW': 'AI 翻譯', ja: 'AI翻訳' },
	info: {
		en: 'Set your preferred translation language and optional personal API key for AI translation of notes and chat.',
		zh: '设置翻译目标语言，并可选用自己的 API Key 进行帖子/聊天 AI 翻译。',
		'zh-TW': '設定翻譯目標語言與可選的個人 API 金鑰。',
		ja: '翻訳先言語と任意の個人APIキーを設定できます。',
	},
	userKeyDisabled: {
		en: 'This instance does not allow user-owned API keys. Instance-level AI translation still applies if enabled.',
		zh: '本站未开放用户自带 API Key。若管理员已配置实例翻译，仍可使用。',
		'zh-TW': '本站未開放使用者自帶金鑰。',
		ja: 'このサーバーはユーザー独自キーを許可していません。',
	},
	prefs: { en: 'Preferences', zh: '偏好', 'zh-TW': '偏好', ja: '設定' },
	targetLang: { en: 'Target language', zh: '目标语言', 'zh-TW': '目標語言', ja: '翻訳先言語' },
	targetLangCaption: {
		en: 'BCP-47 code, e.g. zh-CN, en, ja. Empty = use UI language.',
		zh: '语言代码，如 zh-CN、en、ja。留空则使用界面语言。',
		'zh-TW': '語言代碼，如 zh-TW、en。留空使用介面語言。',
		ja: '例: ja, en, zh-CN。空ならUI言語。',
	},
	selective: { en: 'Selective translation', zh: '选择性翻译', 'zh-TW': '選擇性翻譯', ja: '選択的翻訳' },
	selectiveCaption: {
		en: 'Only translate parts not already in the target language (mixed CN/EN → translate EN only when target is Chinese).',
		zh: '只翻译非目标语言部分（中英混排且目标为中文时，只把英文译成中文）。',
		'zh-TW': '只翻譯非目標語言部分。',
		ja: '目標言語以外の部分だけ翻訳。',
	},
	ownKey: { en: 'Your API key', zh: '我的 API Key', 'zh-TW': '我的 API 金鑰', ja: '自分のAPIキー' },
	ownKeyInfo: {
		en: 'When allowed by the instance, your API key is used with the instance AI base URL only (custom base URL is not accepted — SSRF protection).',
		zh: '在实例允许时，你的 API Key 仅配合实例配置的 AI 基址使用（不允许自定义基址，防止 SSRF）。',
		'zh-TW': '在站點允許時，你的 API 金鑰僅搭配站點 AI 基址（不可自訂基址）。',
		ja: '許可時、APIキーはインスタンスのベースURLのみと組み合わせます（独自ベースURL不可）。',
	},
	apiKey: { en: 'API key', zh: 'API 密钥', 'zh-TW': 'API 金鑰', ja: 'APIキー' },
	apiKeyCaption: {
		en: 'Leave blank to keep existing key. Never share this value.',
		zh: '留空保留已有密钥。请勿泄露。',
		'zh-TW': '留空保留既有金鑰。',
		ja: '空なら既存キーを維持。',
	},
	keySaved: { en: 'saved', zh: '已保存', 'zh-TW': '已儲存', ja: '保存済み' },
	model: { en: 'Model', zh: '模型', 'zh-TW': '模型', ja: 'モデル' },
	clearKey: { en: 'Clear saved key', zh: '清除已保存密钥', 'zh-TW': '清除金鑰', ja: 'キーを削除' },
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

const pageTitle = computed(() => t('title'));
const allowUserKey = computed(() => (instance as any).aiTranslationPublic?.allowUserApiKey !== false);

const cfg = ($i as any)?.aiTranslationConfig ?? {};
const targetLang = ref(cfg.targetLang ?? '');
const selective = ref(
	typeof cfg.selective === 'boolean'
		? cfg.selective
		: ((instance as any).aiTranslationPublic?.selectiveByDefault !== false),
);
const apiKey = ref('');
const model = ref(cfg.model ?? '');
const hasApiKey = ref(!!cfg.hasApiKey);

function applyUpdated(updated: any) {
	if (!updated) return;
	updateCurrentAccount(updated);
	const next = updated.aiTranslationConfig ?? {};
	hasApiKey.value = !!next.hasApiKey;
	apiKey.value = '';
	if (next.model !== undefined) model.value = next.model ?? '';
	if (next.targetLang !== undefined) targetLang.value = next.targetLang ?? '';
	if (typeof next.selective === 'boolean') selective.value = next.selective;
}

async function save() {
	const payload: any = {
		targetLang: targetLang.value?.trim() ? targetLang.value.trim() : null,
		selective: selective.value,
	};
	if (allowUserKey.value) {
		payload.model = model.value?.trim() ? model.value.trim() : null;
		if (apiKey.value && apiKey.value !== '<redacted>') {
			payload.apiKey = apiKey.value;
		}
	}
	const updated = await os.apiWithDialog('i/update', {
		aiTranslationConfig: payload,
	});
	applyUpdated(updated);
}

async function clearKey() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: t('clearKey'),
	});
	if (canceled) return;
	const updated = await os.apiWithDialog('i/update', {
		aiTranslationConfig: {
			targetLang: targetLang.value?.trim() ? targetLang.value.trim() : null,
			selective: selective.value,
			model: model.value?.trim() ? model.value.trim() : null,
			apiKey: '__clear__',
		},
	});
	applyUpdated(updated);
}

definePage(() => ({
	title: pageTitle.value,
	icon: 'ti ti-language',
}));
</script>
