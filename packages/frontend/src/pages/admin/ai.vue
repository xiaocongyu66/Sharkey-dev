<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="headerTab" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps">
			<!-- ═══════ Translation ═══════ -->
			<template v-if="headerTab === 'translation'">
				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-language"></i></template>
					<template #label>{{ tTr('title') }}</template>
					<template v-if="trForm.savedState.enableNotes || trForm.savedState.enableChat" #suffix>{{ tCommon('on') }}</template>
					<template v-else #suffix>{{ tCommon('off') }}</template>
					<template v-if="trForm.modified.value" #footer>
						<MkFormFooter :form="trForm"/>
					</template>

					<div class="_gaps">
						<MkInfo>{{ tTr('info') }}</MkInfo>

						<MkSwitch v-model="trForm.state.enableNotes">
							<template #label>{{ tTr('enableNotes') }}<span v-if="trForm.modifiedStates.enableNotes" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tTr('enableNotesCaption') }}</template>
						</MkSwitch>

						<MkSwitch v-model="trForm.state.enableChat">
							<template #label>{{ tTr('enableChat') }}<span v-if="trForm.modifiedStates.enableChat" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tTr('enableChatCaption') }}</template>
						</MkSwitch>

						<MkSwitch v-model="trForm.state.useSharedCredentials">
							<template #label>{{ tTr('useShared') }}<span v-if="trForm.modifiedStates.useSharedCredentials" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tTr('useSharedCaption') }}</template>
						</MkSwitch>

						<MkSwitch v-model="trForm.state.allowUserApiKey">
							<template #label>{{ tTr('allowUserKey') }}<span v-if="trForm.modifiedStates.allowUserApiKey" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tTr('allowUserKeyCaption') }}</template>
						</MkSwitch>

						<MkSwitch v-model="trForm.state.preferAiOverClassic">
							<template #label>{{ tTr('preferAi') }}<span v-if="trForm.modifiedStates.preferAiOverClassic" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tTr('preferAiCaption') }}</template>
						</MkSwitch>

						<MkSwitch v-model="trForm.state.uncensored">
							<template #label>{{ tTr('uncensored') }}<span v-if="trForm.modifiedStates.uncensored" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tTr('uncensoredCaption') }}</template>
						</MkSwitch>

						<MkTextarea v-if="trForm.state.uncensored" v-model="trForm.state.jailbreakPrompt">
							<template #label>{{ tTr('jailbreakPrompt') }}<span v-if="trForm.modifiedStates.jailbreakPrompt" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tTr('jailbreakPromptCaption') }}</template>
						</MkTextarea>

						<MkSwitch v-model="trForm.state.selectiveByDefault">
							<template #label>{{ tTr('selective') }}<span v-if="trForm.modifiedStates.selectiveByDefault" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tTr('selectiveCaption') }}</template>
						</MkSwitch>

						<MkSwitch v-model="trForm.state.cacheEnabled">
							<template #label>{{ tTr('cacheEnabled') }}<span v-if="trForm.modifiedStates.cacheEnabled" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tTr('cacheEnabledCaption') }}</template>
						</MkSwitch>

						<MkInput v-if="trForm.state.cacheEnabled" v-model="trForm.state.cacheTtlSeconds" type="number">
							<template #label>{{ tTr('cacheTtl') }}<span v-if="trForm.modifiedStates.cacheTtlSeconds" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tTr('cacheTtlCaption') }}</template>
						</MkInput>

						<template v-if="trForm.state.useSharedCredentials">
							<div class="_gaps">
								<div style="font-weight: bold;">{{ tTr('sharedCreds') }}</div>
								<MkInput v-model="trForm.state.sharedBaseUrl" type="url">
									<template #label>{{ tTr('baseUrl') }}</template>
									<template #caption>{{ tTr('baseUrlCaption') }}</template>
								</MkInput>
								<MkInput v-model="trForm.state.sharedApiKey" type="password">
									<template #label>{{ tTr('apiKey') }}</template>
									<template #caption>{{ tTr('apiKeyCaption') }}</template>
								</MkInput>
								<MkInput v-model="trForm.state.sharedModel">
									<template #label>{{ tTr('model') }}</template>
								</MkInput>
								<MkSelect v-model="trForm.state.sharedApiStyle">
									<template #label>{{ tTr('apiStyle') }}</template>
									<option value="auto">{{ tTr('apiStyleAuto') }}</option>
									<option value="chat.completions">chat/completions</option>
									<option value="responses">responses</option>
								</MkSelect>
								<MkInput v-model="trForm.state.sharedTimeout" type="number">
									<template #label>{{ tTr('timeout') }}</template>
								</MkInput>
								<MkTextarea v-model="trForm.state.sharedSystemPrompt">
									<template #label>{{ tTr('systemPrompt') }}</template>
									<template #caption>{{ tTr('systemPromptCaption') }}</template>
								</MkTextarea>
							</div>
						</template>
						<template v-else>
							<div class="_gaps">
								<div style="font-weight: bold;">{{ tTr('notesCreds') }}</div>
								<MkInput v-model="trForm.state.notesBaseUrl" type="url">
									<template #label>{{ tTr('baseUrl') }}</template>
								</MkInput>
								<MkInput v-model="trForm.state.notesApiKey" type="password">
									<template #label>{{ tTr('apiKey') }}</template>
								</MkInput>
								<MkInput v-model="trForm.state.notesModel">
									<template #label>{{ tTr('model') }}</template>
								</MkInput>
								<MkSelect v-model="trForm.state.notesApiStyle">
									<template #label>{{ tTr('apiStyle') }}</template>
									<option value="auto">{{ tTr('apiStyleAuto') }}</option>
									<option value="chat.completions">chat/completions</option>
									<option value="responses">responses</option>
								</MkSelect>
								<MkInput v-model="trForm.state.notesTimeout" type="number">
									<template #label>{{ tTr('timeout') }}</template>
								</MkInput>
								<MkTextarea v-model="trForm.state.notesSystemPrompt">
									<template #label>{{ tTr('systemPrompt') }}</template>
								</MkTextarea>
							</div>
							<div class="_gaps">
								<div style="font-weight: bold;">{{ tTr('chatCreds') }}</div>
								<MkInput v-model="trForm.state.chatBaseUrl" type="url">
									<template #label>{{ tTr('baseUrl') }}</template>
								</MkInput>
								<MkInput v-model="trForm.state.chatApiKey" type="password">
									<template #label>{{ tTr('apiKey') }}</template>
								</MkInput>
								<MkInput v-model="trForm.state.chatModel">
									<template #label>{{ tTr('model') }}</template>
								</MkInput>
								<MkSelect v-model="trForm.state.chatApiStyle">
									<template #label>{{ tTr('apiStyle') }}</template>
									<option value="auto">{{ tTr('apiStyleAuto') }}</option>
									<option value="chat.completions">chat/completions</option>
									<option value="responses">responses</option>
								</MkSelect>
								<MkInput v-model="trForm.state.chatTimeout" type="number">
									<template #label>{{ tTr('timeout') }}</template>
								</MkInput>
								<MkTextarea v-model="trForm.state.chatSystemPrompt">
									<template #label>{{ tTr('systemPrompt') }}</template>
								</MkTextarea>
							</div>
						</template>
					</div>
				</MkFolder>
			</template>

			<!-- ═══════ Note moderation ═══════ -->
			<template v-else-if="headerTab === 'moderation'">
				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-robot"></i></template>
					<template #label>{{ tMod('title') }}</template>
					<template v-if="modForm.savedState.enableLocalNotes || modForm.savedState.enableRemoteNotes" #suffix>{{ tCommon('on') }}</template>
					<template v-else #suffix>{{ tCommon('off') }}</template>
					<template v-if="modForm.modified.value" #footer>
						<MkFormFooter :form="modForm"/>
					</template>

					<div class="_gaps">
						<MkInfo>{{ tMod('info') }}</MkInfo>

						<MkSwitch v-model="modForm.state.enableLocalNotes">
							<template #label>{{ tMod('enableLocal') }}<span v-if="modForm.modifiedStates.enableLocalNotes" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tMod('enableLocalCaption') }}</template>
						</MkSwitch>

						<MkSwitch v-model="modForm.state.enableRemoteNotes">
							<template #label>{{ tMod('enableRemote') }}<span v-if="modForm.modifiedStates.enableRemoteNotes" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tMod('enableRemoteCaption') }}</template>
						</MkSwitch>

						<MkSwitch v-model="modForm.state.includeImages">
							<template #label>{{ tMod('includeImages') }}<span v-if="modForm.modifiedStates.includeImages" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tMod('includeImagesCaption') }}</template>
						</MkSwitch>

						<MkInput v-if="modForm.state.includeImages" v-model="modForm.state.maxImages" type="number">
							<template #label>{{ tMod('maxImages') }}<span v-if="modForm.modifiedStates.maxImages" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tMod('maxImagesCaption') }}</template>
						</MkInput>

						<MkInput v-model="modForm.state.baseUrl" type="url">
							<template #label>{{ tMod('baseUrl') }}<span v-if="modForm.modifiedStates.baseUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tMod('baseUrlCaption') }}</template>
						</MkInput>

						<MkInput v-model="modForm.state.apiKey" type="password">
							<template #label>{{ tMod('apiKey') }}<span v-if="modForm.modifiedStates.apiKey" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tMod('apiKeyCaption') }}</template>
						</MkInput>

						<MkInput v-model="modForm.state.model">
							<template #label>{{ tMod('model') }}<span v-if="modForm.modifiedStates.model" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tMod('modelCaption') }}</template>
						</MkInput>

						<MkSelect v-model="modForm.state.apiStyle">
							<template #label>{{ tMod('apiStyle') }}<span v-if="modForm.modifiedStates.apiStyle" class="_modified">{{ i18n.ts.modified }}</span></template>
							<option value="auto">{{ tMod('apiStyleAuto') }}</option>
							<option value="chat.completions">chat/completions</option>
							<option value="responses">responses</option>
						</MkSelect>

						<MkSelect v-model="modForm.state.action">
							<template #label>{{ tMod('action') }}<span v-if="modForm.modifiedStates.action" class="_modified">{{ i18n.ts.modified }}</span></template>
							<option value="reject">{{ tMod('actionReject') }}</option>
							<option value="cw">{{ tMod('actionCw') }}</option>
							<option value="hide">{{ tMod('actionHide') }}</option>
							<option value="home">{{ tMod('actionHome') }}</option>
						</MkSelect>

						<MkInput v-model="modForm.state.requestTimeoutMs" type="number">
							<template #label>{{ tMod('timeout') }}<span v-if="modForm.modifiedStates.requestTimeoutMs" class="_modified">{{ i18n.ts.modified }}</span></template>
						</MkInput>

						<MkSwitch v-model="modForm.state.failOpen">
							<template #label>{{ tMod('failOpen') }}<span v-if="modForm.modifiedStates.failOpen" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tMod('failOpenCaption') }}</template>
						</MkSwitch>

						<MkTextarea v-model="modForm.state.systemPrompt">
							<template #label>{{ tMod('systemPrompt') }}<span v-if="modForm.modifiedStates.systemPrompt" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tMod('systemPromptCaption') }}</template>
						</MkTextarea>
					</div>
				</MkFolder>
			</template>

			<!-- ═══════ Abuse control ═══════ -->
			<template v-else-if="headerTab === 'abuse'">
				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-shield-lock"></i></template>
					<template #label>{{ tAb('title') }}</template>
					<template v-if="abForm.savedState.enabled" #suffix>{{ tCommon('on') }}</template>
					<template v-else #suffix>{{ tCommon('off') }}</template>
					<template v-if="abForm.modified.value" #footer>
						<MkFormFooter :form="abForm"/>
					</template>

					<div class="_gaps">
						<MkInfo>{{ tAb('info') }}</MkInfo>

						<MkSwitch v-model="abForm.state.enabled">
							<template #label>{{ tAb('enabled') }}<span v-if="abForm.modifiedStates.enabled" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tAb('enabledCaption') }}</template>
						</MkSwitch>

						<MkSwitch v-model="abForm.state.checkOnSignin">
							<template #label>{{ tAb('checkOnSignin') }}<span v-if="abForm.modifiedStates.checkOnSignin" class="_modified">{{ i18n.ts.modified }}</span></template>
						</MkSwitch>

						<MkSwitch v-model="abForm.state.checkOnSignup">
							<template #label>{{ tAb('checkOnSignup') }}<span v-if="abForm.modifiedStates.checkOnSignup" class="_modified">{{ i18n.ts.modified }}</span></template>
						</MkSwitch>

						<MkSwitch v-model="abForm.state.autoSuspend">
							<template #label>{{ tAb('autoSuspend') }}<span v-if="abForm.modifiedStates.autoSuspend" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tAb('autoSuspendCaption') }}</template>
						</MkSwitch>

						<MkSwitch v-model="abForm.state.hideNotesOnSuspend">
							<template #label>{{ tAb('hideNotes') }}<span v-if="abForm.modifiedStates.hideNotesOnSuspend" class="_modified">{{ i18n.ts.modified }}</span></template>
						</MkSwitch>

						<MkInput v-model="abForm.state.baseUrl" type="url">
							<template #label>{{ tAb('baseUrl') }}<span v-if="abForm.modifiedStates.baseUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tAb('baseUrlCaption') }}</template>
						</MkInput>

						<MkInput v-model="abForm.state.apiKey" type="password">
							<template #label>{{ tAb('apiKey') }}<span v-if="abForm.modifiedStates.apiKey" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tAb('apiKeyCaption') }}</template>
						</MkInput>

						<MkInput v-model="abForm.state.model">
							<template #label>{{ tAb('model') }}<span v-if="abForm.modifiedStates.model" class="_modified">{{ i18n.ts.modified }}</span></template>
						</MkInput>

						<MkSelect v-model="abForm.state.apiStyle">
							<template #label>{{ tAb('apiStyle') }}<span v-if="abForm.modifiedStates.apiStyle" class="_modified">{{ i18n.ts.modified }}</span></template>
							<option value="auto">{{ tAb('apiStyleAuto') }}</option>
							<option value="chat.completions">chat/completions</option>
							<option value="responses">responses</option>
						</MkSelect>

						<MkInput v-model="abForm.state.minLinkedAccounts" type="number">
							<template #label>{{ tAb('minLinked') }}<span v-if="abForm.modifiedStates.minLinkedAccounts" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tAb('minLinkedCaption') }}</template>
						</MkInput>

						<MkSwitch v-model="abForm.state.requireIpAndFingerprint">
							<template #label>{{ tAb('requireBoth') }}<span v-if="abForm.modifiedStates.requireIpAndFingerprint" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tAb('requireBothCaption') }}</template>
						</MkSwitch>

						<MkInput v-model="abForm.state.signinWindowMinutes" type="number">
							<template #label>{{ tAb('signinWindow') }}<span v-if="abForm.modifiedStates.signinWindowMinutes" class="_modified">{{ i18n.ts.modified }}</span></template>
						</MkInput>

						<MkInput v-model="abForm.state.maxSigninsInWindow" type="number">
							<template #label>{{ tAb('maxSignins') }}<span v-if="abForm.modifiedStates.maxSigninsInWindow" class="_modified">{{ i18n.ts.modified }}</span></template>
						</MkInput>

						<MkInput v-model="abForm.state.cooldownSeconds" type="number">
							<template #label>{{ tAb('cooldown') }}<span v-if="abForm.modifiedStates.cooldownSeconds" class="_modified">{{ i18n.ts.modified }}</span></template>
						</MkInput>

						<MkInput v-model="abForm.state.requestTimeoutMs" type="number">
							<template #label>{{ tAb('timeout') }}<span v-if="abForm.modifiedStates.requestTimeoutMs" class="_modified">{{ i18n.ts.modified }}</span></template>
						</MkInput>

						<MkSwitch v-model="abForm.state.failOpen">
							<template #label>{{ tAb('failOpen') }}<span v-if="abForm.modifiedStates.failOpen" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tAb('failOpenCaption') }}</template>
						</MkSwitch>

						<MkTextarea v-model="abForm.state.systemPrompt">
							<template #label>{{ tAb('systemPrompt') }}<span v-if="abForm.modifiedStates.systemPrompt" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ tAb('systemPromptCaption') }}</template>
						</MkTextarea>
					</div>
				</MkFolder>
			</template>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import { useForm } from '@/use/use-form.js';
import MkFormFooter from '@/components/MkFormFooter.vue';

type LangPack = { en: string; zh: string; 'zh-TW'?: string; ja?: string };
type TabKey = 'translation' | 'moderation' | 'abuse';

function pick(fb: LangPack): string {
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

const COMMON: Record<string, LangPack> = {
	pageTitle: { en: 'AI', zh: 'AI', 'zh-TW': 'AI', ja: 'AI' },
	on: { en: 'On', zh: '开启', 'zh-TW': '開啟', ja: 'オン' },
	off: { en: 'Off', zh: '关闭', 'zh-TW': '關閉', ja: 'オフ' },
	tabTranslation: { en: 'Translation', zh: '翻译', 'zh-TW': '翻譯', ja: '翻訳' },
	tabModeration: { en: 'Moderation', zh: '审核', 'zh-TW': '審核', ja: '審査' },
	tabAbuse: { en: 'Abuse control', zh: '管控', 'zh-TW': '管控', ja: '多垢対策' },
};

const TR: Record<string, LangPack> = {
	title: { en: 'AI translation', zh: 'AI 翻译', 'zh-TW': 'AI 翻譯', ja: 'AI翻訳' },
	info: {
		en: 'OpenAI-compatible translation for notes and chat. Shared or separate API keys; optional user keys. Uncensored mode uses a SillyTavern jailbreak stack (main + nsfw + post-history), not a polite translate request.',
		zh: '帖子与群聊/私信的 OpenAI 兼容 AI 翻译。可共用或分别配置密钥；可允许用户自带 Key。破甲模式用 SillyTavern 多层 jailbreak（main + nsfw + 历史后指令），不是普通“请翻译”。',
		'zh-TW': '貼文與聊天的 OpenAI 相容 AI 翻譯。破甲模式採 SillyTavern 分層 jailbreak。',
		ja: 'ノートとチャットのOpenAI互換AI翻訳。アンセンサードはST式ジェイルブレイク層。',
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
	allowUserKey: { en: 'Allow local user AI endpoint', zh: '允许用户本机 AI 端点', 'zh-TW': '允許使用者本機 AI 端點', ja: 'ユーザーのローカルAIを許可' },
	allowUserKeyCaption: {
		en: 'Users may configure base URL / key / model in the browser only. Credentials are never stored or used by the server (browser → user API).',
		zh: '用户可在浏览器本机配置基址/密钥/模型。凭据不会上传到服务器，也不会被服务端使用（浏览器直连用户 API）。',
		'zh-TW': '使用者可在瀏覽器本機設定。憑證不會上傳伺服器，也不會被服務端使用。',
		ja: 'ブラウザのみにキー/URLを保存。サーバーは保存・使用しません。',
	},
	preferAi: { en: 'Prefer AI over DeepL/Libre for notes', zh: '帖子优先用 AI（而非 DeepL/Libre）', 'zh-TW': '貼文優先 AI', ja: 'ノートはAIを優先' },
	preferAiCaption: {
		en: 'If AI fails, falls back to classic translators when available.',
		zh: 'AI 失败时会回退到已配置的传统翻译。',
		'zh-TW': 'AI 失敗時回退傳統翻譯。',
		ja: 'AI失敗時は従来翻訳にフォールバック。',
	},
	uncensored: { en: 'SillyTavern jailbreak stack', zh: 'SillyTavern 破甲栈', 'zh-TW': 'SillyTavern 破甲堆疊', ja: 'SillyTavernジェイルブレイク' },
	uncensoredCaption: {
		en: 'Uses ST-style layers: Main + NSFW/Auxiliary + Post-History Jailbreak (not a polite “please translate”). Retries once if the model still refuses.',
		zh: '按 SillyTavern 结构叠层：Main 角色 + NSFW/辅助 + 历史后 Jailbreak（PHI），不是客气地“请翻译”。若仍拒译会再破甲重试一次。',
		'zh-TW': '採用 ST 分層：Main + NSFW + Post-History Jailbreak；拒譯時再試一次。',
		ja: 'ST方式: Main + NSFW + Post-History Jailbreak。拒否時は再試行。',
	},
	jailbreakPrompt: {
		en: 'Custom jailbreak / PHI (optional)',
		zh: '自定义破甲 / 历史后指令（可选）',
		'zh-TW': '自訂破甲 / 歷史後指令（可選）',
		ja: 'カスタムジェイルブレイク / PHI（任意）',
	},
	jailbreakPromptCaption: {
		en: 'Overrides the built-in Post-History Instructions slot (SillyTavern “jailbreak”). Leave empty for the built-in PHI.',
		zh: '覆盖内置的 Post-History Instructions（SillyTavern 的 jailbreak 槽）。留空使用内置破甲词。',
		'zh-TW': '覆寫內建 PHI（ST jailbreak）。留空使用內建。',
		ja: '内蔵の Post-History Instructions を上書き。空なら内蔵を使用。',
	},
	selective: { en: 'Selective translation by default', zh: '默认选择性翻译', 'zh-TW': '預設選擇性翻譯', ja: '選択的翻訳を既定に' },
	selectiveCaption: {
		en: 'Only translate segments not already in the target language (e.g. EN parts → ZH in mixed text).',
		zh: '只翻译非目标语言片段（如中英混排时把英文译成中文，中文保留）。',
		'zh-TW': '只翻譯非目標語言片段。',
		ja: '目標言語以外の部分だけ翻訳。',
	},
	cacheEnabled: { en: 'Cache by content hash', zh: '按文本哈希缓存翻译', 'zh-TW': '依文本雜湊快取翻譯', ja: 'テキストハッシュでキャッシュ' },
	cacheEnabledCaption: {
		en: 'Same source text + target language reuses the previous AI result (saves cost). Expired entries auto-delete.',
		zh: '相同原文 + 目标语言复用上次 AI 结果（省费用）。过期后自动删除。',
		'zh-TW': '相同原文 + 目標語言重用結果。過期自動刪除。',
		ja: '同一原文+言語で結果を再利用。期限後に自動削除。',
	},
	cacheTtl: { en: 'Cache TTL (seconds)', zh: '缓存有效期（秒）', 'zh-TW': '快取有效期（秒）', ja: 'キャッシュTTL（秒）' },
	cacheTtlCaption: {
		en: 'Auto-delete after this many seconds. Min 60, max 2592000 (30 days). Default 604800 (7 days).',
		zh: '超过该秒数后自动删除。最小 60，最大 2592000（30 天）。默认 604800（7 天）。',
		'zh-TW': '超過秒數後自動刪除。最小 60，最大 30 天。預設 7 天。',
		ja: '秒後に自動削除。最小60・最大30日。既定7日。',
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
		en: 'If set, replaces the entire ST stack with this single system prompt. Leave empty to use Main+NSFW+Jailbreak layers.',
		zh: '若填写，将用这一条 system 提示替换整套 ST 破甲栈。留空则使用 Main+NSFW+Jailbreak 分层。',
		'zh-TW': '若填寫則覆寫整套 ST 堆疊。留空使用分層破甲。',
		ja: '設定するとST層全体をこの1本に置換。空ならMain+NSFW+Jailbreak。',
	},
};

const MOD: Record<string, LangPack> = {
	title: { en: 'AI note moderation', zh: '帖子 AI 审核', 'zh-TW': '貼文 AI 審核', ja: 'ノートAI審査' },
	info: {
		en: 'Uses any OpenAI-compatible /v1 API. Optional image vision when the note has images (model must support vision). Separate switches for local and remote notes.',
		zh: '兼容任意 OpenAI /v1 接口。可按情况开启图片识别（仅当帖子带图时发送；模型需支持 vision）。本地帖与远程帖可分别开关。',
		'zh-TW': '相容 OpenAI /v1。可依情況啟用圖片辨識（僅有圖時送出）。本機與遠端可貼文分別開關。',
		ja: 'OpenAI互換 /v1。画像がある時のみビジョン送信可。ローカル/リモート個別有効化。',
	},
	enableLocal: { en: 'Moderate local notes', zh: '审核本地帖子', 'zh-TW': '審核本機貼文', ja: 'ローカルノートを審査' },
	enableLocalCaption: {
		en: 'When on, notes from users on this instance are checked before publish.',
		zh: '开启后，本站用户发帖/改帖前会调用 AI 审核。',
		'zh-TW': '開啟後，本站使用者發文/改文前會呼叫 AI 審核。',
		ja: '有効にすると、このインスタンスのユーザーの投稿前にAI審査します。',
	},
	enableRemote: { en: 'Moderate remote notes', zh: '审核远程帖子', 'zh-TW': '審核遠端貼文', ja: 'リモートノートを審査' },
	enableRemoteCaption: {
		en: 'When on, federated notes are checked on ingest (may slow federation).',
		zh: '开启后，联合进来的远程帖会在入库时审核（可能拖慢联邦）。',
		'zh-TW': '開啟後，聯邦進來的遠端貼文會在入庫時審核。',
		ja: '有効にすると、連合で受信したノートを取り込み時に審査します。',
	},
	includeImages: { en: 'Include images when present', zh: '有图时识别图片', 'zh-TW': '有圖時辨識圖片', ja: '画像がある時は画像も審査' },
	includeImagesCaption: {
		en: 'Only when a note has image attachments: send public image URLs to a vision-capable model. Text-only posts stay text-only (saves cost). Requires HTTPS public URLs and a vision model (e.g. gpt-4o, grok-2-vision).',
		zh: '仅当帖子带有图片附件时，把公开图片 URL 发给支持 vision 的模型。纯文字帖仍只审文字（省费用）。需要图片为 HTTPS 公网可访问，且模型支持视觉（如 gpt-4o、grok-2-vision）。',
		'zh-TW': '僅在貼文有圖片時送出公開圖 URL。純文字仍只審文字。需 vision 模型與 HTTPS 公開 URL。',
		ja: '画像添付がある時のみ公開URLをビジョンモデルへ。テキストのみは従来どおり。',
	},
	maxImages: { en: 'Max images per note', zh: '每帖最多图片数', 'zh-TW': '每帖最多圖片數', ja: 'ノートあたり最大画像数' },
	maxImagesCaption: {
		en: '1–8. Prefer webpublic/thumbnail URLs. Default 4.',
		zh: '1–8。优先使用 webpublic/缩略图 URL。默认 4。',
		'zh-TW': '1–8。優先 webpublic/縮圖。預設 4。',
		ja: '1〜8。webpublic/サムネ優先。既定4。',
	},
	baseUrl: { en: 'API base URL', zh: 'API 基址', 'zh-TW': 'API 基址', ja: 'APIベースURL' },
	baseUrlCaption: {
		en: 'OpenAI-compatible base, e.g. https://api.openai.com/v1 or https://api.x.ai/v1 ( /v1 is appended if missing ).',
		zh: 'OpenAI 兼容基址，例如 https://api.openai.com/v1 或 https://api.x.ai/v1（无 /v1 会自动补上）。',
		'zh-TW': 'OpenAI 相容基址，例如 https://api.openai.com/v1 。',
		ja: '例: https://api.openai.com/v1 / https://api.x.ai/v1 （/v1 が無ければ付与）',
	},
	apiKey: { en: 'API key', zh: 'API 密钥', 'zh-TW': 'API 金鑰', ja: 'APIキー' },
	apiKeyCaption: {
		en: 'Leave blank when saving to keep the current key. Never share this value.',
		zh: '留空保存可保留原密钥。请勿泄露。',
		'zh-TW': '留空儲存可保留原金鑰。',
		ja: '空のまま保存すると既存キーを維持します。',
	},
	model: { en: 'Model', zh: '模型', 'zh-TW': '模型', ja: 'モデル' },
	modelCaption: {
		en: 'Provider model id, e.g. gpt-4o-mini, gpt-4o (vision), grok-2-vision',
		zh: '提供商模型 ID，如 gpt-4o-mini、gpt-4o（视觉）、grok-2-vision',
		'zh-TW': '供應商模型 ID（視覺請用 vision 模型）',
		ja: 'モデルID（ビジョンは対応モデルを指定）',
	},
	apiStyle: { en: 'API style', zh: '接口类型', 'zh-TW': '介面類型', ja: 'API形式' },
	apiStyleAuto: { en: 'Auto (chat/completions → responses)', zh: '自动（先 chat/completions，失败再 responses）', 'zh-TW': '自動', ja: '自動' },
	action: { en: 'Action when flagged', zh: '判定违规时的处理', 'zh-TW': '判定違規時的處理', ja: 'フラグ時の動作' },
	actionReject: { en: 'Reject (block post)', zh: '拒绝发布', 'zh-TW': '拒絕發佈', ja: '投稿拒否' },
	actionCw: { en: 'Force content warning', zh: '强制内容警告 (CW)', 'zh-TW': '強制內容警告', ja: 'CW を付与' },
	actionHide: { en: 'Soft-hide note', zh: '软隐藏帖子', 'zh-TW': '軟隱藏貼文', ja: 'ソフト非表示' },
	actionHome: { en: 'Downgrade public → home', zh: '公开降级为首页可见', 'zh-TW': '公開降為首頁可見', ja: 'public を home に' },
	timeout: { en: 'Timeout (ms)', zh: '超时 (毫秒)', 'zh-TW': '逾時 (毫秒)', ja: 'タイムアウト (ms)' },
	failOpen: { en: 'Fail open on API error', zh: 'API 失败时放行', 'zh-TW': 'API 失敗時放行', ja: 'API失敗時は通す' },
	failOpenCaption: {
		en: 'If off, posts are blocked when the AI endpoint is unreachable.',
		zh: '关闭后，AI 接口不可用时会拦截发帖。',
		'zh-TW': '關閉後，AI 介面不可用時會攔截發文。',
		ja: 'オフにするとAI不通時に投稿を拒否します。',
	},
	systemPrompt: { en: 'Custom system prompt (optional)', zh: '自定义系统提示（可选）', 'zh-TW': '自訂系統提示（可選）', ja: 'システムプロンプト（任意）' },
	systemPromptCaption: {
		en: 'Leave empty to use the built-in JSON classifier prompt.',
		zh: '留空使用内置 JSON 分类提示词。',
		'zh-TW': '留空使用內建提示。',
		ja: '空なら内蔵プロンプトを使用',
	},
};

const AB: Record<string, LangPack> = {
	title: { en: 'AI multi-account control', zh: 'AI 刷号/多账号管控', 'zh-TW': 'AI 刷號/多帳號管控', ja: 'AI多垢対策' },
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

function tCommon(key: keyof typeof COMMON): string { return pick(COMMON[key]); }
function tTr(key: keyof typeof TR): string { return pick(TR[key]); }
function tMod(key: keyof typeof MOD): string { return pick(MOD[key]); }
function tAb(key: keyof typeof AB): string { return pick(AB[key]); }

const router = useRouter();

function tabFromRoute(): TabKey {
	const name = String(router.currentRoute.value.name ?? '');
	if (name === 'ai-note-moderation') return 'moderation';
	if (name === 'ai-abuse-control') return 'abuse';
	if (name === 'ai-translation') return 'translation';
	// Optional ?tab= on /admin/ai
	try {
		const qs = new URLSearchParams(window.location.search);
		const q = qs.get('tab');
		if (q === 'moderation' || q === 'abuse' || q === 'translation') return q;
	} catch { /* ignore */ }
	return 'translation';
}

const headerTab = ref<TabKey>(tabFromRoute());

const headerTabs = computed(() => [
	{ key: 'translation', title: tCommon('tabTranslation'), icon: 'ti ti-language' },
	{ key: 'moderation', title: tCommon('tabModeration'), icon: 'ti ti-robot' },
	{ key: 'abuse', title: tCommon('tabAbuse'), icon: 'ti ti-shield-lock' },
]);

const meta = await misskeyApi('admin/meta') as any;
const trCfg = meta.aiTranslationConfig ?? {};
const trShared = trCfg.shared ?? {};
const trNotes = trCfg.notes ?? {};
const trChat = trCfg.chat ?? {};
const modCfg = meta.aiNoteModerationConfig ?? {};
const abCfg = meta.aiAbuseControlConfig ?? {};

const trForm = useForm({
	enableNotes: trCfg.enableNotes === true,
	enableChat: trCfg.enableChat === true,
	useSharedCredentials: trCfg.useSharedCredentials !== false,
	allowUserApiKey: trCfg.allowUserApiKey !== false,
	preferAiOverClassic: trCfg.preferAiOverClassic !== false,
	uncensored: trCfg.uncensored !== false,
	jailbreakPrompt: trCfg.jailbreakPrompt ?? '',
	selectiveByDefault: trCfg.selectiveByDefault !== false,
	cacheEnabled: trCfg.cacheEnabled !== false,
	cacheTtlSeconds: trCfg.cacheTtlSeconds ?? 604800,
	sharedBaseUrl: trShared.baseUrl ?? '',
	sharedApiKey: '',
	sharedModel: trShared.model ?? 'gpt-4o-mini',
	sharedApiStyle: trShared.apiStyle ?? 'auto',
	sharedTimeout: trShared.requestTimeoutMs ?? 20000,
	sharedSystemPrompt: trShared.systemPrompt ?? '',
	notesBaseUrl: trNotes.baseUrl ?? '',
	notesApiKey: '',
	notesModel: trNotes.model ?? 'gpt-4o-mini',
	notesApiStyle: trNotes.apiStyle ?? 'auto',
	notesTimeout: trNotes.requestTimeoutMs ?? 20000,
	notesSystemPrompt: trNotes.systemPrompt ?? '',
	chatBaseUrl: trChat.baseUrl ?? '',
	chatApiKey: '',
	chatModel: trChat.model ?? 'gpt-4o-mini',
	chatApiStyle: trChat.apiStyle ?? 'auto',
	chatTimeout: trChat.requestTimeoutMs ?? 20000,
	chatSystemPrompt: trChat.systemPrompt ?? '',
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
		jailbreakPrompt: state.jailbreakPrompt?.trim() ? state.jailbreakPrompt.trim() : null,
		selectiveByDefault: state.selectiveByDefault,
		cacheEnabled: state.cacheEnabled,
		cacheTtlSeconds: Math.max(60, Math.min(Number(state.cacheTtlSeconds) || 604800, 2592000)),
		shared: ep(state.sharedBaseUrl, state.sharedApiKey, state.sharedModel, state.sharedApiStyle, state.sharedTimeout, state.sharedSystemPrompt),
		notes: ep(state.notesBaseUrl, state.notesApiKey, state.notesModel, state.notesApiStyle, state.notesTimeout, state.notesSystemPrompt),
		chat: ep(state.chatBaseUrl, state.chatApiKey, state.chatModel, state.chatApiStyle, state.chatTimeout, state.chatSystemPrompt),
	};
	await os.apiWithDialog('admin/update-meta', {
		aiTranslationConfig: payload,
	});
	trForm.state.sharedApiKey = '';
	trForm.state.notesApiKey = '';
	trForm.state.chatApiKey = '';
	await fetchInstance(true);
});

const modForm = useForm({
	enableLocalNotes: modCfg.enableLocalNotes === true,
	enableRemoteNotes: modCfg.enableRemoteNotes === true,
	includeImages: modCfg.includeImages === true,
	maxImages: modCfg.maxImages ?? 4,
	baseUrl: modCfg.baseUrl ?? '',
	apiKey: '',
	model: modCfg.model ?? 'gpt-4o-mini',
	apiStyle: modCfg.apiStyle ?? 'auto',
	action: modCfg.action ?? 'reject',
	requestTimeoutMs: modCfg.requestTimeoutMs ?? 8000,
	failOpen: modCfg.failOpen !== false,
	systemPrompt: modCfg.systemPrompt ?? '',
}, async (state) => {
	const payload: any = {
		enableLocalNotes: state.enableLocalNotes,
		enableRemoteNotes: state.enableRemoteNotes,
		includeImages: state.includeImages,
		maxImages: Math.max(1, Math.min(Number(state.maxImages) || 4, 8)),
		baseUrl: state.baseUrl?.trim() ? state.baseUrl.trim() : null,
		model: state.model?.trim() || 'gpt-4o-mini',
		apiStyle: state.apiStyle,
		action: state.action,
		requestTimeoutMs: Number(state.requestTimeoutMs) || 8000,
		failOpen: state.failOpen,
		systemPrompt: state.systemPrompt?.trim() ? state.systemPrompt.trim() : null,
	};
	if (state.apiKey && state.apiKey !== '<redacted>') {
		payload.apiKey = state.apiKey;
	}
	await os.apiWithDialog('admin/update-meta', {
		aiNoteModerationConfig: payload,
	});
	modForm.state.apiKey = '';
	await fetchInstance(true);
});

const abForm = useForm({
	enabled: abCfg.enabled === true,
	checkOnSignin: abCfg.checkOnSignin !== false,
	checkOnSignup: abCfg.checkOnSignup !== false,
	autoSuspend: abCfg.autoSuspend === true,
	hideNotesOnSuspend: abCfg.hideNotesOnSuspend !== false,
	baseUrl: abCfg.baseUrl ?? '',
	apiKey: '',
	model: abCfg.model ?? 'gpt-4o-mini',
	apiStyle: abCfg.apiStyle ?? 'auto',
	minLinkedAccounts: abCfg.minLinkedAccounts ?? 3,
	requireIpAndFingerprint: abCfg.requireIpAndFingerprint !== false,
	signinWindowMinutes: abCfg.signinWindowMinutes ?? 60,
	maxSigninsInWindow: abCfg.maxSigninsInWindow ?? 20,
	cooldownSeconds: abCfg.cooldownSeconds ?? 300,
	requestTimeoutMs: abCfg.requestTimeoutMs ?? 10000,
	failOpen: abCfg.failOpen !== false,
	systemPrompt: abCfg.systemPrompt ?? '',
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
	abForm.state.apiKey = '';
	await fetchInstance(true);
});

definePage(() => ({
	title: tCommon('pageTitle'),
	icon: 'ti ti-brain',
}));
</script>
