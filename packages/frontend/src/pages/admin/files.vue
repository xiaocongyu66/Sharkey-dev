<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div class="_gaps">
			<div class="inputs" style="display: flex; gap: var(--MI-margin); flex-wrap: wrap;">
				<MkSelect v-model="origin" :items="originDef" style="margin: 0; flex: 1;">
					<template #label>{{ i18n.ts.instance }}</template>
				</MkSelect>
				<MkInput v-model="searchHost" :debounce="true" type="search" style="margin: 0; flex: 1;" :disabled="paginator.computedParams?.value?.origin === 'local'">
					<template #label>{{ i18n.ts.host }}</template>
				</MkInput>
			</div>
			<div class="inputs" style="display: flex; gap: var(--MI-margin); flex-wrap: wrap;">
				<MkInput v-model="userId" :debounce="true" type="search" style="margin: 0; flex: 1;">
					<template #label>User ID</template>
				</MkInput>
				<MkInput v-model="type" :debounce="true" type="search" style="margin: 0; flex: 1;">
					<template #label>MIME type</template>
				</MkInput>
			</div>
			<MkFileListForAdmin :paginator="paginator" :viewMode="viewMode"/>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFileListForAdmin from '@/components/MkFileListForAdmin.vue';
import * as os from '@/os.js';
import { lookupFile } from '@/utility/admin-lookup.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { Paginator } from '@/utility/paginator.js';

const {
	model: origin,
	def: originDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'combined' },
		{ label: i18n.ts.local, value: 'local' },
		{ label: i18n.ts.remote, value: 'remote' },
	],
	initialValue: 'local',
});
const type = ref<string | null>(null);
const searchHost = ref('');
const userId = ref('');
const viewMode = ref<'grid' | 'list'>('grid');
const paginator = markRaw(new Paginator('admin/drive/files', {
	limit: 10,
	computedParams: computed(() => ({
		type: (type.value && type.value !== '') ? type.value : null,
		userId: (userId.value && userId.value !== '') ? userId.value : null,
		origin: origin.value,
		hostname: (searchHost.value && searchHost.value !== '') ? searchHost.value : null,
	})),
}));

async function clear() {
	const { canceled, result } = await os.form(i18n.ts.clearCachedFilesOptions.title, {
		olderThanEnum: {
			label: i18n.ts.clearCachedFilesOptions.olderThan,
			type: 'enum',
			default: 'now',
			required: true,
			enum: [
				{ label: i18n.ts.clearCachedFilesOptions.now, value: 'now' },
				{ label: i18n.ts.clearCachedFilesOptions.oneWeek, value: 'oneWeek' },
				{ label: i18n.ts.clearCachedFilesOptions.oneMonth, value: 'oneMonth' },
				{ label: i18n.ts.clearCachedFilesOptions.oneYear, value: 'oneYear' },
			],
		},
		keepFilesInUse: {
			label: i18n.ts.clearCachedFilesOptions.keepFilesInUse,
			description: i18n.ts.clearCachedFilesOptions.keepFilesInUseDescription,
			type: 'boolean',
			default: false,
		},
	});

	if (canceled) return;

	const timesMap = {
		now: 0,
		oneWeek: 7 * 86400,
		oneMonth: 30 * 86400,
		oneYear: 365 * 86400,
	};

	await os.apiWithDialog('admin/drive/clean-remote-files', {
		olderThanSeconds: timesMap[result.olderThanEnum] ?? 0,
		keepFilesInUse: result.keepFilesInUse,
	});
}

const headerActions = computed(() => [{
	text: i18n.ts.lookup,
	icon: 'ti ti-search',
	handler: lookupFile,
}, {
	text: i18n.ts.clearCachedFiles,
	icon: 'ti ti-trash',
	handler: clear,
}]);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.files,
	icon: 'ti ti-cloud',
}));
</script>
