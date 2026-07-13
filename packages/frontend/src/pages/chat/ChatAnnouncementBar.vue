<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!--
  NagramX / Telegram pinned-message strip:
  sticky under page header, compact ~48px collapsed row, expand on tap.
-->
<template>
<div v-if="text" :class="[$style.root, { [$style.expanded]: expanded }]">
	<button type="button" class="_button" :class="$style.main" @click="expanded = !expanded">
		<div :class="$style.accent" aria-hidden="true"></div>
		<div :class="$style.iconWrap" aria-hidden="true">
			<i class="ti ti-pinned"></i>
		</div>
		<div :class="$style.content">
			<div :class="$style.title">{{ title }}</div>
			<div :class="[$style.body, { [$style.clamp]: !expanded }]">{{ text }}</div>
		</div>
		<i :class="[$style.chevron, expanded ? 'ti ti-chevron-up' : 'ti ti-chevron-down']" aria-hidden="true"></i>
	</button>
	<div v-if="expanded && canEdit" :class="$style.actions">
		<button type="button" class="_textButton" :class="$style.editBtn" @click.stop="$emit('edit')">
			<i class="ti ti-pencil"></i>
			{{ editLabel }}
		</button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';

defineProps<{
	text: string;
	title: string;
	editLabel: string;
	canEdit?: boolean;
}>();

defineEmits<{
	(ev: 'edit'): void;
}>();

const expanded = ref(false);
</script>

<style lang="scss" module>
.root {
	position: sticky;
	/* Sit below PageWithHeader sticky chrome (title + tabs), not under it */
	top: var(--MI-stickyTop, 0px);
	z-index: 5;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, var(--MI_THEME-panel));
	border: 1px solid color-mix(in srgb, var(--MI_THEME-accent) 22%, var(--MI_THEME-divider));
	overflow: hidden;
	margin: 0 0 4px;
	/* Avoid being covered by fixed mobile header */
	box-shadow: 0 1px 0 color-mix(in srgb, var(--MI_THEME-bg) 80%, transparent);
}

.main {
	display: flex;
	align-items: center;
	gap: 6px;
	width: 100%;
	min-height: 36px;
	padding: 4px 8px 4px 0;
	text-align: left;
	color: inherit;
}

.accent {
	width: 3px;
	align-self: stretch;
	flex-shrink: 0;
	background: var(--MI_THEME-accent);
	border-radius: 0 2px 2px 0;
}

.iconWrap {
	flex-shrink: 0;
	width: 24px;
	height: 24px;
	border-radius: 999px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: color-mix(in srgb, var(--MI_THEME-accent) 18%, transparent);
	color: var(--MI_THEME-accent);
	font-size: 0.85em;
}

.content {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 1px;
}

.title {
	font-size: 11px;
	font-weight: 700;
	line-height: 1.2;
	letter-spacing: 0.02em;
	color: var(--MI_THEME-accent);
	/* Never collapse empty-looking title row */
	min-height: 1.2em;
	opacity: 1;
}

.body {
	font-size: 12px;
	line-height: 1.3;
	white-space: pre-wrap;
	word-break: break-word;
	color: var(--MI_THEME-fg);
}

.clamp {
	display: -webkit-box;
	-webkit-line-clamp: 1;
	-webkit-box-orient: vertical;
	overflow: hidden;
	white-space: normal;
}

.expanded .clamp {
	-webkit-line-clamp: unset;
}

.chevron {
	flex-shrink: 0;
	opacity: 0.5;
	font-size: 0.9em;
}

.actions {
	display: flex;
	justify-content: flex-end;
	padding: 0 10px 8px;
	border-top: 1px solid color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-divider));
	padding-top: 6px;
}

.editBtn {
	font-size: 85%;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	opacity: 0.85;

	&:hover {
		opacity: 1;
		color: var(--MI_THEME-accent);
	}
}
</style>
