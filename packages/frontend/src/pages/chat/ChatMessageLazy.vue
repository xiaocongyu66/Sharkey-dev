<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!--
  Lazy mount for chat rows: light placeholder until near viewport, then mount
  XMessage. Once mounted we keep it mounted — remount thrash was a major
  cause of timeline 乱跳 (height estimate ≠ real media rows).
-->
<template>
<div
	ref="rootEl"
	:class="[$style.root, { [$style.mounted]: mounted }]"
	:style="placeholderStyle"
>
	<XMessage
		v-if="mounted"
		:message="message"
		:highlighted="highlighted"
		@reply="(m) => emit('reply', m)"
		@scrollToReply="(id) => emit('scrollToReply', id)"
	/>
	<div v-else :class="$style.placeholder" aria-hidden="true">
		<div :class="$style.phAvatar"/>
		<div :class="$style.phBody">
			<div :class="$style.phLine"/>
			<div :class="[$style.phLine, $style.phLineShort]"/>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import type { NormalizedChatMessage } from './room.vue';
import XMessage from './XMessage.vue';

const props = defineProps<{
	message: NormalizedChatMessage;
	highlighted?: boolean;
	/** Always mount (e.g. pinned / jump target) */
	forceMount?: boolean;
	/** Estimated height before real content measures */
	estimateHeight?: number;
}>();

const emit = defineEmits<{
	(ev: 'reply', message: NormalizedChatMessage): void;
	(ev: 'scrollToReply', id: string): void;
}>();

const rootEl = useTemplateRef<HTMLElement>('rootEl');
const mounted = ref(!!props.forceMount);

const placeholderStyle = computed(() => {
	if (mounted.value) return undefined;
	const h = props.estimateHeight || 72;
	return { minHeight: `${h}px` };
});

let io: IntersectionObserver | null = null;

function setupIo() {
	io?.disconnect();
	io = null;
	if (props.forceMount || mounted.value) {
		mounted.value = true;
		return;
	}
	const el = rootEl.value;
	if (!el || typeof IntersectionObserver === 'undefined') {
		mounted.value = true;
		return;
	}

	// Find scroll root if any
	let root: Element | null = null;
	let p: HTMLElement | null = el.parentElement;
	while (p) {
		const oy = getComputedStyle(p).overflowY;
		if (oy === 'auto' || oy === 'scroll') {
			root = p;
			break;
		}
		p = p.parentElement;
	}

	io = new IntersectionObserver((entries) => {
		for (const e of entries) {
			if (e.isIntersecting) {
				mounted.value = true;
				// Stay mounted forever once shown — unmounting caused 乱跳
				io?.disconnect();
				io = null;
			}
		}
	}, {
		root: root ?? null,
		// Prefetch a screen above/below
		rootMargin: '150% 0px',
		threshold: 0,
	});
	io.observe(el);
}

watch(() => props.forceMount, (v) => {
	if (v) mounted.value = true;
});

watch(() => props.highlighted, (v) => {
	if (v) mounted.value = true;
});

onMounted(() => {
	setupIo();
});

onBeforeUnmount(() => {
	io?.disconnect();
	io = null;
});
</script>

<style lang="scss" module>
.root {
	width: 100%;
}

.placeholder {
	display: flex;
	gap: 12px;
	padding: 6px 0;
	opacity: 0.35;
	pointer-events: none;
}

.phAvatar {
	width: 42px;
	height: 42px;
	border-radius: 999px;
	background: var(--MI_THEME-divider);
	flex-shrink: 0;
}

.phBody {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-top: 4px;
}

.phLine {
	height: 12px;
	border-radius: 6px;
	background: var(--MI_THEME-divider);
	width: 70%;
}

.phLineShort {
	width: 40%;
}
</style>
