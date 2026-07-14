<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps">
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-language"></i></template>
				<template #label>{{ t('title') }}</template>
				<template v-if="form.savedState.enableNotes || form.savedState.enableChat" #suffix>{{ t('on') }}</template>
				<template v-else #suffix>{{ t('off') }}</template>
				<template v-if="form.modified.value" #footer>
					<MkFormFooter :form="form"/>
				</template>

				<div class="_gaps">
					<MkInfo>{{ t('info') }}</MkInfo>

					<MkSwitch v-model="form.state.enableNotes">
						<template #label>{{ t('enableNotes') }}<span v-if="form.modifiedStates.enableNotes" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('enableNotesCaption') }}</template>
					</MkSwitch>

					<MkSwitch v-model="form.state.enableChat">
						<template #label>{{ t('enableChat') }}<span v-if="form.modifiedStates.enableChat" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('enableChatCaption') }}</template>
					</MkSwitch>

					<MkSwitch v-model="form.state.useSharedCredentials">
						<template #label>{{ t('useShared') }}<span v-if="form.modifiedStates.useSharedCredentials" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('useSharedCaption') }}</template>
					</MkSwitch>

					<MkSwitch v-model="form.state.allowUserApiKey">
						<template #label>{{ t('allowUserKey') }}<span v-if="form.modifiedStates.allowUserApiKey" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('allowUserKeyCaption') }}</template>
					</MkSwitch>

					<MkSwitch v-model="form.state.preferAiOverClassic">
						<template #label>{{ t('preferAi') }}<span v-if="form.modifiedStates.preferAiOverClassic" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('preferAiCaption') }}</template>
					</MkSwitch>

					<MkSwitch v-model="form.state.uncensored">
						<template #label>{{ t('uncensored') }}<span v-if="form.modifiedStates.uncensored" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('uncensoredCaption') }}</template>
					</MkSwitch>

					<MkSwitch v-model="form.state.selectiveByDefault">
						<template #label>{{ t('selective') }}<span v-if="form.modifiedStates.selectiveByDefault" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ t('selectiveCaption') }}</template>
					</MkSwitch>

					<template v-if="form.state.useSharedCredentials">
						<div class="_gaps">
							<div style="font-weight: bold;">{{ t('sharedCreds') }}</div>
							<MkInput v-model="form.state.sharedBaseUrl" type="url">
								<template #label>{{ t('baseUrl') }}</template>
								<template #caption>{{ t('baseUrlCaption') }}</template>
							</MkInput>
							<MkInput v-model="form.state.sharedApiKey" type="password">
								<template #label>{{ t('apiKey') }}</template>
								<template #caption>{{ t('apiKeyCaption') }}</template>
							</MkInput>
							<MkInput v-model="form.state.sharedModel">
								<template #label>{{ t('model') }}</template>
							</MkInput>
							<MkSelect v-model="form.state.sharedApiStyle">
								<template #label>{{ t('apiStyle') }}</template>
								<option value="auto">{{ t('apiStyleAuto') }}</option>
								<option value="chat.completions">chat/completions</option>
								<option value="responses">responses</option>
							</MkSelect>
							<MkInput v-model="form.state.sharedTimeout" type="number">
								<template #label>{{ t('timeout') }}</template>
							</MkInput>
							<MkTextarea v-model="form.state.sharedSystemPrompt">
								<template #label>{{ t('systemPrompt') }}</template>
								<template #caption>{{ t('systemPromptCaption') }}</template>
							</MkTextarea>
						</div>
					</template>
					<template v-else>
						<div class="_gaps">
							<div style="font-weight: bold;">{{ t('notesCreds') }}</div>
							<MkInput v-model="form.state.notesBaseUrl" type="url">
								<template #label>{{ t('baseUrl') }}</template>
							</MkInput>
							<MkInput v-model="form.state.notesApiKey" type="password">
								<template #label>{{ t('apiKey') }}</template>
							</MkInput>
							<MkInput v-model="form.state.notesModel">
								<template #label>{{ t('model') }}</template>
							</MkInput>
							<MkSelect v-model="form.state.notesApiStyle">
								<template #label>{{ t('apiStyle') }}</template>
								<option value="auto">{{ t('apiStyleAuto') }}</option>
								<option value="chat.completions">chat/completions</option>
								<option value="responses">responses</option>
							</MkSelect>
							<MkInput v-model="form.state.notesTimeout" type="number">
								<template #label>{{ t('timeout') }}</template>
							</MkInput>
							<MkTextarea v-model="form.state.notesSystemPrompt">
								<template #label>{{ t('systemPrompt') }}</template>
							</MkTextarea>
						</div>
						<div class="_gaps">
							<div style="font-weight: bold;">{{ t('chatCreds') }}</div>
							<MkInput v-model="form.state.chatBaseUrl" type="url">
								<template #label>{{ t('baseUrl') }}</template>
							</MkInput>
							<MkInput v-model="form.state.chatApiKey" type="password">
								<template #label>{{ t('apiKey') }}</template>
							</MkInput>
							<MkInput v-model="form.state.chatModel">
								<template #label>{{ t('model') }}</template>
							</MkInput>
							<MkSelect v-model="form.state.chatApiStyle">
								<template #label>{{ t('apiStyle') }}</template>
								<option value="auto">{{ t('apiStyleAuto') }}</option>
								<option value="chat.completions">chat/completions</option>
								<option value="responses">responses</option>
							</MkSelect>
							<MkInput v-model="form.state.chatTimeout" type="number">
								<template #label>{{ t('timeout') }}</template>
							</MkInput>
							<MkTextarea v-model="form.state.chatSystemPrompt">
								<template #label>{{ t('systemPrompt') }}</template>
							</MkTextarea>
						</div>
					</template>
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
	title: { en: 'AI translation', zh: 'AI 翻译', 'zh-TW': 'AI 翻譯', ja: 'AI翻訳' },
	on: { en: 'On', zh: '开启', 'zh-TW': '開啟', ja: 'オン' },
	off: { en: 'Off', zh: '关闭', 'zh-TW': '關閉', ja: 'オフ' },
	info: {
		en: 'OpenAI-compatible translation for notes and chat. Shared or separate API keys; optional user-owned keys. Direct-translate prompts reduce refusal/moralizing output.',
		zh: '帖子与群聊/私信的 OpenAI 兼容 AI 翻译。可共用或分别配置密钥；可允许用户自带 Key。直译提示词减少拒译/说教。',
		'zh-TW': '貼文與聊天的 OpenAI 相容 AI 翻譯。可共用或分別設定金鑰。',
		ja: 'ノートとチャットのOpenAI互換AI翻訳。共有/個別キー、ユーザー独自キー対応。',
	},
	enableNotes: { en: 'Enable note translation', zh: '启用帖子翻译', 'zh-TW': '啟用貼文翻譯', ja: 'ノート翻訳を有効' },
	enableNotesCaption: {
		en: 'When on, notes/translate can use AI (alongside DeepL/Libre if configured).',
		zh: '开启后，帖子翻译可走 AI（若已配置 DeepL/Libre 仍可回退）。',
		'zh-TW': '開啟後貼文翻譯可使用 AI。',
		ja: '有効にするとノート翻訳でAIを利用できます。',
	},
	enableChat: { en: 'Enable chat translation', zh: '启用群聊/私信翻译', 'zh-TW': '啟用聊天翻譯', ja: 'チャット翻訳を有効' },
	enableChatCaption: {
		en: 'When on, users can translate chat/room messages via AI.',
		zh: '开启后，用户可翻译群聊/私信消息。',
		'zh-TW': '開啟後可翻譯聊天訊息。',
		ja: '有効にするとチャットメッセージをAI翻訳できます。',
	},
	useShared: { en: 'Share credentials for notes + chat', zh: '帖子与聊天共用一套 API', 'zh-TW': '貼文與聊天共用 API', ja: 'ノートとチャットで認証情報を共有' },
	useSharedCaption: {
		en: 'Off = configure notes and chat endpoints separately.',
		zh: '关闭后可分别配置帖子翻译与聊天翻译的接口。',
		'zh-TW': '關閉後可分別設定。',
		ja: 'オフでノート/チャットを個別設定。',
	},
	allowUserKey: { en: 'Allow user custom API key', zh: '允许用户自定义 API Key', 'zh-TW': '允許使用者自訂 API Key', ja: 'ユーザー独自APIキーを許可' },
	allowUserKeyCaption: {
		en: 'Users can set their own base URL / key / model in settings and use their translation AI.',
		zh: '用户可在设置中填写自己的基址/密钥/模型，使用自己的翻译 AI。',
		'zh-TW': '使用者可在設定中填寫自己的金鑰。',
		ja: 'ユーザーが設定で独自キーを使えます。',
	},
	preferAi: { en: 'Prefer AI over DeepL/Libre for notes', zh: '帖子优先用 AI（而非 DeepL/Libre）', 'zh-TW': '貼文優先 AI', ja: 'ノートはAIを優先' },
	preferAiCaption: {
		en: 'If AI fails, falls back to classic translators when available.',
		zh: 'AI 失败时会回退到已配置的传统翻译。',
		'zh-TW': 'AI 失敗時回退傳統翻譯。',
		ja: 'AI失敗時は従来翻訳にフォールバック。',
	},
	uncensored: { en: 'Direct translate (reduce refusals)', zh: '直译模式（降低拒译/道德说教）', 'zh-TW': '直譯模式', ja: '直訳モード（拒否を抑制）' },
	uncensoredCaption: {
		en: 'Uses a SillyTavern-style system prompt: translate only, no moralizing. Still depends on the model.',
		zh: '使用类似 SillyTavern 的系统提示：只翻译、不说教。仍取决于模型本身。',
		'zh-TW': '僅翻譯、不說教（仍取決於模型）。',
		ja: '翻訳のみ・説教なし（モデル依存）。',
	},
	selective: { en: 'Selective translation by default', zh: '默认选择性翻译', 'zh-TW': '預設選擇性翻譯', ja: '選択的翻訳を既定に' },
	selectiveCaption: {
		en: 'Only translate segments not already in the target language (e.g. EN parts → ZH in mixed text).',
		zh: '只翻译非目标语言片段（如中英混排时把英文译成中文，中文保留）。',
		'zh-TW': '只翻譯非目標語言片段。',
		ja: '目標言語以外の部分だけ翻訳。',
	},
	sharedCreds: { en: 'Shared API', zh: '共用 API', 'zh-TW': '共用 API', ja: '共有API' },
	notesCreds: { en: 'Notes API', zh: '帖子翻译 API', 'zh-TW': '貼文翻譯 API', ja: 'ノート翻訳API' },
	chatCreds: { en: 'Chat API', zh: '聊天翻译 API', 'zh-TW': '聊天翻譯 API', ja: 'チャット翻訳API' },
	baseUrl: { en: 'API base URL', zh: 'API 基址', 'zh-TW': 'API 基址', ja: 'APIベースURL' },
	baseUrlCaption: {
		en: 'e.g. https://api.openai.com/v1 or https://api.x.ai/v1',
		zh: '例如 https://api.openai.com/v1 或 https://api.x.ai/v1',
		'zh-TW': '例如 https://api.openai.com/v1',
		ja: '例: https://api.openai.com/v1',
	},
	apiKey: { en: 'API key', zh: 'API 密钥', 'zh-TW': 'API 金鑰', ja: 'APIキー' },
	apiKeyCaption: {
		en: 'Leave blank when saving to keep the current key.',
		zh: '留空保存可保留原密钥。',
		'zh-TW': '留空儲存可保留原金鑰。',
		ja: '空のまま保存で既存キー維持。',
	},
	model: { en: 'Model', zh: '模型', 'zh-TW': '模型', ja: 'モデル' },
	apiStyle: { en: 'API style', zh: '接口类型', 'zh-TW': '介面類型', ja: 'API形式' },
	apiStyleAuto: { en: 'Auto', zh: '自动', 'zh-TW': '自動', ja: '自動' },
	timeout: { en: 'Timeout (ms)', zh: '超时 (毫秒)', 'zh-TW': '逾時 (毫秒)', ja: 'タイムアウト (ms)' },
	systemPrompt: { en: 'Custom system prompt (optional)', zh: '自定义系统提示（可选）', 'zh-TW': '自訂系統提示', ja: 'システムプロンプト（任意）' },
	systemPromptCaption: {
		en: 'Empty = built-in direct-translate prompt when uncensored is on.',
		zh: '留空则在直译模式下使用内置提示词。',
		'zh-TW': '留空使用內建直譯提示。',
		ja: '空なら内蔵直訳プロンプト。',
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
const cfg = meta.aiTranslationConfig ?? {};
const shared = cfg.shared ?? {};
const notes = cfg.notes ?? {};
const chat = cfg.chat ?? {};

const form = useForm({
	enableNotes: cfg.enableNotes === true,
	enableChat: cfg.enableChat === true,
	useSharedCredentials: cfg.useSharedCredentials !== false,
	allowUserApiKey: cfg.allowUserApiKey !== false,
	preferAiOverClassic: cfg.preferAiOverClassic !== false,
	uncensored: cfg.uncensored !== false,
	selectiveByDefault: cfg.selectiveByDefault !== false,
	sharedBaseUrl: shared.baseUrl ?? '',
	sharedApiKey: '',
	sharedModel: shared.model ?? 'gpt-4o-mini',
	sharedApiStyle: shared.apiStyle ?? 'auto',
	sharedTimeout: shared.requestTimeoutMs ?? 20000,
	sharedSystemPrompt: shared.systemPrompt ?? '',
	notesBaseUrl: notes.baseUrl ?? '',
	notesApiKey: '',
	notesModel: notes.model ?? 'gpt-4o-mini',
	notesApiStyle: notes.apiStyle ?? 'auto',
	notesTimeout: notes.requestTimeoutMs ?? 20000,
	notesSystemPrompt: notes.systemPrompt ?? '',
	chatBaseUrl: chat.baseUrl ?? '',
	chatApiKey: '',
	chatModel: chat.model ?? 'gpt-4o-mini',
	chatApiStyle: chat.apiStyle ?? 'auto',
	chatTimeout: chat.requestTimeoutMs ?? 20000,
	chatSystemPrompt: chat.systemPrompt ?? '',
}, async (state) => {
	const ep = (baseUrl: string, apiKey: string, model: string, apiStyle: string, timeout: number, systemPrompt: string) => {
		const o: any = {
			baseUrl: baseUrl?.trim() ? baseUrl.trim() : null,
			model: model?.trim() || 'gpt-4o-mini',
			apiStyle,
			requestTimeoutMs: Number(timeout) || 20000,
			systemPrompt: systemPrompt?.trim() ? systemPrompt.trim() : null,
		};
		if (apiKey && apiKey !== '<redacted>') o.apiKey = apiKey;
		return o;
	};
	const payload: any = {
		enableNotes: state.enableNotes,
		enableChat: state.enableChat,
		useSharedCredentials: state.useSharedCredentials,
		allowUserApiKey: state.allowUserApiKey,
		preferAiOverClassic: state.preferAiOverClassic,
		uncensored: state.uncensored,
		selectiveByDefault: state.selectiveByDefault,
		shared: ep(state.sharedBaseUrl, state.sharedApiKey, state.sharedModel, state.sharedApiStyle, state.sharedTimeout, state.sharedSystemPrompt),
		notes: ep(state.notesBaseUrl, state.notesApiKey, state.notesModel, state.notesApiStyle, state.notesTimeout, state.notesSystemPrompt),
		chat: ep(state.chatBaseUrl, state.chatApiKey, state.chatModel, state.chatApiStyle, state.chatTimeout, state.chatSystemPrompt),
	};
	await os.apiWithDialog('admin/update-meta', {
		aiTranslationConfig: payload,
	});
	form.state.sharedApiKey = '';
	form.state.notesApiKey = '';
	form.state.chatApiKey = '';
	await fetchInstance(true);
});

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: t('title'),
	icon: 'ti ti-language',
}));
</script>
