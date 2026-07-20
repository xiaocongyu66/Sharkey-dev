<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 700px;">
	<div class="_gaps">
		<MkFoldableSection class="item">
			<template #header><i class="ti ti-activity"></i> {{ i18n.ts._uiCommon.heatmap }}</template>
			<MkHeatmap :user="user" :src="'notes'"/>
		</MkFoldableSection>
		<MkFoldableSection class="item">
			<template #header><i class="ti ti-pencil"></i> {{ i18n.ts.notes }}</template>
			<XNotes :user="user"/>
		</MkFoldableSection>
		<MkFoldableSection class="item">
			<template #header><i class="ti ti-users"></i> {{ i18n.ts.following }}</template>
			<XFollowing :user="user"/>
		</MkFoldableSection>
		<MkFoldableSection class="item">
			<template #header><i class="ti ti-eye"></i> {{ i18n.ts.numberOfProfileView }}</template>
			<XPv :user="user"/>
		</MkFoldableSection>
	</div>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import XPv from './activity.pv.vue';
import XNotes from './activity.notes.vue';
import XFollowing from './activity.following.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkHeatmap from '@/components/MkHeatmap.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	user: Misskey.entities.User;
}>();

</script>
