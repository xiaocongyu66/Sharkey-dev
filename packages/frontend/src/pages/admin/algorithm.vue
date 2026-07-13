<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps">
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-adjustments-bolt"></i></template>
				<template #label>{{ xAlgo.title }}</template>
				<template v-if="algorithmForm.savedState.enabled" #suffix>{{ i18n.ts.enabled }}</template>
				<template v-else #suffix>{{ i18n.ts.disabled }}</template>
				<template v-if="algorithmForm.modified.value" #footer>
					<MkFormFooter :form="algorithmForm"/>
				</template>

				<div class="_gaps">
					<MkInfo warn>
						{{ xAlgo.info }}
					</MkInfo>

					<MkSwitch v-model="algorithmForm.state.enabled">
						<template #label>{{ xAlgo.enable }}<span v-if="algorithmForm.modifiedStates.enabled" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ xAlgo.enableCaption }}</template>
					</MkSwitch>

					<MkSwitch v-model="algorithmForm.state.strictOriginalExperience">
						<template #label>{{ xAlgo.strictOriginal }}<span v-if="algorithmForm.modifiedStates.strictOriginalExperience" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ xAlgo.strictOriginalCaption }}</template>
					</MkSwitch>

					<MkSwitch v-model="algorithmForm.state.fallbackToSharkeyTimeline">
						<template #label>{{ xAlgo.fallback }}<span v-if="algorithmForm.modifiedStates.fallbackToSharkeyTimeline" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ xAlgo.fallbackCaption }}</template>
					</MkSwitch>

					<div class="_buttons">
						<MkButton @click="testAlgorithm('home')"><i class="ti ti-plug-connected"></i> {{ xAlgo.testHome }}</MkButton>
						<MkButton @click="testAlgorithm('hybrid')"><i class="ti ti-plug-connected"></i> {{ xAlgo.testHybrid }}</MkButton>
					</div>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-server"></i></template>
				<template #label>{{ xAlgo.originalServices }}</template>
				<template v-if="algorithmForm.modified.value" #footer>
					<MkFormFooter :form="algorithmForm"/>
				</template>

				<div class="_gaps">
					<MkInput v-model="algorithmForm.state.homeMixerEndpoint" type="url">
						<template #label>{{ xAlgo.homeMixer }}<span v-if="algorithmForm.modifiedStates.homeMixerEndpoint" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #prefix><i class="ti ti-link"></i></template>
					</MkInput>

					<MkInput v-model="algorithmForm.state.scoredPostsEndpoint" type="url">
						<template #label>{{ xAlgo.scoredPosts }}<span v-if="algorithmForm.modifiedStates.scoredPostsEndpoint" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #prefix><i class="ti ti-link"></i></template>
					</MkInput>

					<MkInput v-model="algorithmForm.state.phoenixEndpoint" type="url">
						<template #label>{{ xAlgo.phoenix }}<span v-if="algorithmForm.modifiedStates.phoenixEndpoint" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #prefix><i class="ti ti-link"></i></template>
					</MkInput>

					<MkInput v-model="algorithmForm.state.thunderEndpoint" type="url">
						<template #label>{{ xAlgo.thunder }}<span v-if="algorithmForm.modifiedStates.thunderEndpoint" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #prefix><i class="ti ti-link"></i></template>
					</MkInput>

					<MkInput v-model="algorithmForm.state.groxEndpoint" type="url">
						<template #label>{{ xAlgo.grox }}<span v-if="algorithmForm.modifiedStates.groxEndpoint" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #prefix><i class="ti ti-link"></i></template>
					</MkInput>

					<MkInput v-model="algorithmForm.state.apiKey" type="password">
						<template #label>{{ xAlgo.apiKey }}<span v-if="algorithmForm.modifiedStates.apiKey" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #prefix><i class="ti ti-key"></i></template>
					</MkInput>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-route"></i></template>
				<template #label>{{ xAlgo.pipeline }}</template>
				<template v-if="algorithmForm.modified.value" #footer>
					<MkFormFooter :form="algorithmForm"/>
				</template>

				<div class="_gaps">
					<MkSwitch v-model="algorithmForm.state.includeInNetwork">
						<template #label>{{ xAlgo.includeInNetwork }}<span v-if="algorithmForm.modifiedStates.includeInNetwork" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkSwitch>

					<MkSwitch v-model="algorithmForm.state.includeOutOfNetwork">
						<template #label>{{ xAlgo.includeOutOfNetwork }}<span v-if="algorithmForm.modifiedStates.includeOutOfNetwork" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkSwitch>

					<MkSwitch v-model="algorithmForm.state.enableGroxContentUnderstanding">
						<template #label>{{ xAlgo.enableGrox }}<span v-if="algorithmForm.modifiedStates.enableGroxContentUnderstanding" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkSwitch>

					<MkSwitch v-model="algorithmForm.state.enableAdsBlending">
						<template #label>{{ xAlgo.enableAds }}<span v-if="algorithmForm.modifiedStates.enableAdsBlending" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkSwitch>

					<MkInput v-model="algorithmForm.state.candidatesPerRequest" type="number">
						<template #label>{{ xAlgo.candidates }}<span v-if="algorithmForm.modifiedStates.candidatesPerRequest" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkInput>

					<MkInput v-model="algorithmForm.state.requestTimeoutMs" type="number">
						<template #label>{{ xAlgo.timeout }}<span v-if="algorithmForm.modifiedStates.requestTimeoutMs" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkInput>

					<MkInput v-model="algorithmForm.state.modelArtifactsPath">
						<template #label>{{ xAlgo.modelArtifacts }}<span v-if="algorithmForm.modifiedStates.modelArtifactsPath" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #prefix><i class="ti ti-folder"></i></template>
					</MkInput>
				</div>
			</MkFolder>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { fetchInstance } from '@/instance.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useForm } from '@/use/use-form.js';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';
import { miLocalStorage } from '@/local-storage.js';

type FallbackTable = { en: string; zh: string; 'zh-TW'?: string; ja: string };

// Drop stale locale so next paint can load _xAlgorithm translations
try {
	if ((i18n.ts as any)._xAlgorithm == null) {
		miLocalStorage.removeItem('locale');
		miLocalStorage.removeItem('localeVersion');
	}
} catch { /* ignore */ }

/** Multi-lang labels: prefer i18n locale, then language-aware fallbacks (not English-only). */
const xAlgoFb: Record<string, FallbackTable> = {
	title: { en: 'Algorithm', zh: '算法', 'zh-TW': '演算法', ja: 'アルゴリズム' },
	info: {
		en: 'X Algorithm must run as the original upstream services. Sharkey calls an HTTP gateway for Home Mixer/Scored Posts and does not emulate a reduced algorithm locally.',
		zh: 'X Algorithm 必须以原始上游服务运行。Sharkey 通过 HTTP 网关调用 Home Mixer/Scored Posts，不会在本地模拟简化算法。',
		'zh-TW': 'X Algorithm 必須以原始上游服務運行。Sharkey 透過 HTTP 閘道呼叫 Home Mixer/Scored Posts，不會在本機模擬簡化演算法。',
		ja: 'X Algorithm はオリジナルの上流サービスとして動作する必要があります。Sharkey は Home Mixer/Scored Posts を HTTP ゲートウェイ経由で呼び出し、ローカルで簡易アルゴリズムをエミュレートしません。',
	},
	enable: { en: 'Enable X Algorithm', zh: '启用 X Algorithm', 'zh-TW': '啟用 X Algorithm', ja: 'X Algorithm を有効化' },
	enableCaption: { en: 'Use xai-org/x-algorithm as the recommendation backend.', zh: '使用 xai-org/x-algorithm 作为推荐后端。', 'zh-TW': '使用 xai-org/x-algorithm 作為推薦後端。', ja: '推薦バックエンドとして xai-org/x-algorithm を使用します。' },
	strictOriginal: { en: 'Strict original experience', zh: '严格原始体验', 'zh-TW': '嚴格原始體驗', ja: '厳格なオリジナル体験' },
	strictOriginalCaption: { en: 'Do not silently replace missing X Algorithm stages with Sharkey heuristics.', zh: '不要用 Sharkey 启发式静默替代缺失的 X Algorithm 阶段。', 'zh-TW': '不要用 Sharkey 啟發式靜默取代缺失的 X Algorithm 階段。', ja: '欠落した X Algorithm 段階を Sharkey のヒューリスティックで黙って置き換えません。' },
	fallback: { en: 'Fallback to Sharkey timeline', zh: '回退到 Sharkey 时间线', 'zh-TW': '回退到 Sharkey 時間軸', ja: 'Sharkey タイムラインへフォールバック' },
	fallbackCaption: { en: 'Only use this while bringing up the upstream service.', zh: '仅在上游服务尚未就绪时使用。', 'zh-TW': '僅在上游服務尚未就緒時使用。', ja: '上流サービスの立ち上げ中のみ使用してください。' },
	testHome: { en: 'Test Home', zh: '测试 Home', 'zh-TW': '測試 Home', ja: 'Home をテスト' },
	testHybrid: { en: 'Test Hybrid', zh: '测试 Hybrid', 'zh-TW': '測試 Hybrid', ja: 'Hybrid をテスト' },
	testResult: { en: 'Returned {n} note ids.', zh: '返回了 {n} 条笔记 ID。', 'zh-TW': '回傳了 {n} 則貼文 ID。', ja: '{n} 件のノート ID を返しました。' },
	originalServices: { en: 'Original services', zh: '原始服务', 'zh-TW': '原始服務', ja: 'オリジナルサービス' },
	homeMixer: { en: 'Home Mixer HTTP gateway', zh: 'Home Mixer HTTP 网关', 'zh-TW': 'Home Mixer HTTP 閘道', ja: 'Home Mixer HTTP ゲートウェイ' },
	scoredPosts: { en: 'Scored Posts HTTP gateway', zh: 'Scored Posts HTTP 网关', 'zh-TW': 'Scored Posts HTTP 閘道', ja: 'Scored Posts HTTP ゲートウェイ' },
	phoenix: { en: 'Phoenix endpoint', zh: 'Phoenix 端点', 'zh-TW': 'Phoenix 端點', ja: 'Phoenix エンドポイント' },
	thunder: { en: 'Thunder endpoint', zh: 'Thunder 端点', 'zh-TW': 'Thunder 端點', ja: 'Thunder エンドポイント' },
	grox: { en: 'Grox endpoint', zh: 'Grox 端点', 'zh-TW': 'Grox 端點', ja: 'Grox エンドポイント' },
	apiKey: { en: 'API key', zh: 'API 密钥', 'zh-TW': 'API 金鑰', ja: 'API キー' },
	pipeline: { en: 'Pipeline', zh: '流水线', 'zh-TW': '管線', ja: 'パイプライン' },
	includeInNetwork: { en: 'Thunder in-network source', zh: 'Thunder 站内来源', 'zh-TW': 'Thunder 站內來源', ja: 'Thunder インネットワークソース' },
	includeOutOfNetwork: { en: 'Phoenix out-of-network source', zh: 'Phoenix 站外来源', 'zh-TW': 'Phoenix 站外來源', ja: 'Phoenix アウトオブネットワークソース' },
	enableGrox: { en: 'Grox content understanding', zh: 'Grox 内容理解', 'zh-TW': 'Grox 內容理解', ja: 'Grox コンテンツ理解' },
	enableAds: { en: 'Ads blending', zh: '广告混合', 'zh-TW': '廣告混合', ja: '広告ブレンディング' },
	candidates: { en: 'Candidates per request', zh: '每次请求候选数', 'zh-TW': '每次請求候選數', ja: 'リクエストあたりの候補数' },
	timeout: { en: 'Request timeout ms', zh: '请求超时（毫秒）', 'zh-TW': '請求逾時（毫秒）', ja: 'リクエストタイムアウト (ms)' },
	modelArtifacts: { en: 'Model artifacts path', zh: '模型产物路径', 'zh-TW': '模型產物路徑', ja: 'モデル成果物パス' },
};

function resolveLang(fb: FallbackTable): string {
	const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en-US').replace('_', '-').toLowerCase();
	if (lang.startsWith('zh-tw') || lang.startsWith('zh-hk') || lang.startsWith('zh-hant')) return fb['zh-TW'] || fb.zh;
	if (lang.startsWith('zh')) return fb.zh;
	if (lang.startsWith('ja')) return fb.ja;
	return fb.en;
}
function xAlgoKey(key: keyof typeof xAlgoFb): string {
	const fromI18n = (i18n.ts as any)?._xAlgorithm?.[key];
	if (typeof fromI18n === 'string' && fromI18n.length > 0) return fromI18n;
	// also try localStorage lang if available
	try {
		const stored = localStorage.getItem('lang');
		if (stored) {
			const l = stored.replace('_', '-').toLowerCase();
			const fb = xAlgoFb[key];
			if (l.startsWith('zh-tw') || l.startsWith('zh-hk') || l.startsWith('zh-hant')) return fb['zh-TW'] || fb.zh;
			if (l.startsWith('zh')) return fb.zh;
			if (l.startsWith('ja')) return fb.ja;
			return fb.en;
		}
	} catch { /* ignore */ }
	return resolveLang(xAlgoFb[key]);
}

const xAlgo = new Proxy({} as Record<string, string>, {
	get(_t, prop: string) {
		if (prop in xAlgoFb) return xAlgoKey(prop as keyof typeof xAlgoFb);
		return prop;
	},
});

const xAlgoTestResult = (n: number) => xAlgoKey('testResult').replace('{n}', String(n));

const defaultConfig = {
	enabled: false,
	strictOriginalExperience: true,
	homeMixerEndpoint: null,
	scoredPostsEndpoint: null,
	phoenixEndpoint: null,
	thunderEndpoint: null,
	groxEndpoint: null,
	apiKey: null,
	requestTimeoutMs: 3000,
	candidatesPerRequest: 100,
	includeInNetwork: true,
	includeOutOfNetwork: true,
	enableGroxContentUnderstanding: true,
	enableAdsBlending: false,
	modelArtifactsPath: null,
	fallbackToSharkeyTimeline: true,
};

let metaCfg: typeof defaultConfig | undefined;
try {
	const meta = await misskeyApi('admin/meta') as unknown as { xAlgorithmConfig?: typeof defaultConfig };
	metaCfg = meta.xAlgorithmConfig;
} catch {
	metaCfg = undefined;
}

const algorithmForm = useForm({
	...defaultConfig,
	...metaCfg,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		xAlgorithmConfig: state,
	} as never);
	fetchInstance(true);
});

async function testAlgorithm(source: 'home' | 'hybrid') {
	const result = await os.apiWithDialog<{ noteIds: string[] }>('admin/x-algorithm/test' as string, {
		source,
		limit: 5,
	} as never);

	if (result) {
		os.alert({
			type: 'success',
			text: xAlgoTestResult(result.noteIds.length),
		});
	}
}

const headerTabs = computed(() => []);

definePage(() => ({
	title: xAlgo.title,
	icon: 'ti ti-adjustments-bolt',
}));
</script>
