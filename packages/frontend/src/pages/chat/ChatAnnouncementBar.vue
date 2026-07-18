<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!--
  Pinned announcement strip (Telegram / NagramX style).
  Layout only reserves the collapsed row height; expanding overlays the
  message list with a translucent panel so history is not pushed down.
-->
<template>
<div v-if="text" :class="$style.shell">
	<div :class="[$style.root, { [$style.expanded]: expanded }]">
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
/* Only collapsed height participates in document flow — expand does not reflow messages */
.shell {
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	z-index: 20;
	/* Only collapsed row height in document flow — expand overlays messages below */
	height: 40px;
	margin: 0 0 4px;
	overflow: visible;
	/* empty shell area lets clicks fall through to messages when not on the bar */
	pointer-events: none;
}

.root {
	pointer-events: auto;
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	z-index: 1;
	border-radius: 8px;
	/* Translucent so chat under the bar stays visible */
	background: color-mix(in srgb, var(--MI_THEME-panel) 72%, transparent);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-accent) 28%, var(--MI_THEME-divider));
	overflow: hidden;
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	box-shadow: 0 2px 10px color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	transition: box-shadow 0.15s ease, background 0.15s ease;
}

.expanded {
	max-height: min(45vh, 280px);
	overflow-y: auto;
	/* Stronger glass so long text is readable, still see messages beneath */
	background: color-mix(in srgb, var(--MI_THEME-panel) 82%, transparent);
	box-shadow:
		0 4px 18px color-mix(in srgb, var(--MI_THEME-fg) 14%, transparent),
		0 0 0 1px color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
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
	min-height: 1.2em;
	opacity: 1;
	text-shadow: 0 0 8px color-mix(in srgb, var(--MI_THEME-bg) 60%, transparent);
}

.body {
	font-size: 12px;
	line-height: 1.3;
	white-space: pre-wrap;
	word-break: break-word;
	color: var(--MI_THEME-fg);
	text-shadow: 0 0 6px color-mix(in srgb, var(--MI_THEME-bg) 50%, transparent);
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
