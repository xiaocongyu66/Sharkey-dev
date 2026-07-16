<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_panel" :class="$style.root">
	<MkSelect v-model="src" style="margin: 0 0 12px 0;" small>
		<option value="active-users">{{ tCommon('activeUsers') }}</option>
		<option value="notes">{{ tCommon('notes') }}</option>
		<option value="ap-requests-inbox-received">{{ tCommon('apInboxReceived') }}</option>
		<option value="ap-requests-deliver-succeeded">{{ tCommon('apDeliverSucceeded') }}</option>
		<option value="ap-requests-deliver-failed">{{ tCommon('apDeliverFailed') }}</option>
	</MkSelect>
	<MkHeatmap :src="src"/>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import MkHeatmap from '@/components/MkHeatmap.vue';
import MkSelect from '@/components/MkSelect.vue';
import { tCommon } from '@/utility/ui-fb-i18n.js';

const src = ref('active-users');
</script>

<style lang="scss" module>
.root {
	padding: 20px;
}
</style>
