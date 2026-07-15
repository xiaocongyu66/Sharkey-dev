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

// Drop stale locale so next paint can load _xAlgorithm translations
try {
	if ((i18n.ts as any)._xAlgorithm == null) {
		miLocalStorage.removeItem('locale');
		miLocalStorage.removeItem('localeVersion');
	}
} catch { /* ignore */ }

/** Labels from locales `_xAlgorithm` only. */
function xAlgoKey(key: string): string {
	const fromI18n = (i18n.ts as any)?._xAlgorithm?.[key];
	if (typeof fromI18n === 'string' && fromI18n.length > 0) return fromI18n;
	return key;
}

const xAlgo = new Proxy({} as Record<string, string>, {
	get(_t, prop: string) {
		return xAlgoKey(prop);
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
