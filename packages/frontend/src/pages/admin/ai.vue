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

type TabKey = 'translation' | 'moderation' | 'abuse';

const L = i18n.ts as any;
const tCommon = (k: string) => L._ai?.[k] ?? k;
const tTr = (k: string) => L._aiTranslation?.[k] ?? k;
const tMod = (k: string) => L._aiNoteModeration?.[k] ?? k;
const tAb = (k: string) => L._aiAbuseControl?.[k] ?? k;

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
