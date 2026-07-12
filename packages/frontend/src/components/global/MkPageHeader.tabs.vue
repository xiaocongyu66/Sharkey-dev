<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" :class="$style.tabs" @wheel="onTabWheel">
	<div :class="$style.tabsInner">
		<button
			v-for="t in tabs" :ref="(el) => tabRefs[t.key] = (el as HTMLElement)" v-tooltip.noDelay="t.title"
			class="_button" :class="[$style.tab, { [$style.active]: t.key != null && t.key === props.tab, [$style.animate]: prefer.s.animation }]"
			@mousedown="(ev) => onTabMousedown(t, ev)" @click="(ev) => onTabClick(t, ev)"
		>
			<div :class="$style.tabInner">
				<i v-if="t.icon" :class="[$style.tabIcon, t.icon]"></i>
				<!-- iconOnly: never expand with text (tooltips carry the label) — keeps mobile tab row short -->
				<template v-if="!t.iconOnly">
					<div
						v-if="!prefer.s.animation || t.key === tab"
						:class="$style.tabTitle"
					>
						{{ t.title }}
					</div>
					<Transition
						v-else mode="in-out" @enter="enter" @afterEnter="afterEnter" @leave="leave"
						@afterLeave="afterLeave"
					>
						<div v-show="t.key === tab" :class="[$style.tabTitle, $style.animate]">{{ t.title }}</div>
					</Transition>
				</template>
			</div>
		</button>
	</div>
	<!-- Class name must NOT contain "tab" — page CSS [class*='tab'] would match and inflate height -->
	<div
		ref="selectionBarEl"
		:class="[$style.selectionBar, { [$style.animate]: prefer.s.animation }]"
	></div>
</div>
</template>

<script lang="ts">
export type Tab = {
	key: string;
	onClick?: (ev: MouseEvent) => void;
	/** Always available for tooltips when iconOnly */
	title?: string;
	icon?: string;
	iconOnly?: boolean;
};
</script>

<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { prefer } from '@/preferences.js';

const props = withDefaults(defineProps<{
	tabs?: Tab[];
	tab?: string;
	rootEl?: HTMLElement | null;
}>(), {
	tabs: () => ([] as Tab[]),
});

const emit = defineEmits<{
	(ev: 'update:tab', key: string);
	(ev: 'tabClick', key: string);
}>();

const el = useTemplateRef('el');
const selectionBarEl = useTemplateRef('selectionBarEl');
const tabRefs: Record<string, HTMLElement | null> = {};

function onTabMousedown(tab: Tab, ev: MouseEvent): void {
	// ユーザビリティの観点からmousedown時にはonClickは呼ばない
	if (tab.key) {
		emit('update:tab', tab.key);
	}
}

function onTabClick(t: Tab, ev: MouseEvent): void {
	emit('tabClick', t.key);

	if (t.onClick) {
		ev.preventDefault();
		ev.stopPropagation();
		t.onClick(ev);
	}

	if (t.key) {
		emit('update:tab', t.key);
	}
}

function renderTab() {
	const tabEl = props.tab ? tabRefs[props.tab] : undefined;
	if (tabEl && selectionBarEl.value && selectionBarEl.value.parentElement) {
		// offsetWidth や offsetLeft は少数を丸めてしまうため getBoundingClientRect を使う必要がある
		// https://developer.mozilla.org/ja/docs/Web/API/HTMLElement/offsetWidth#%E5%80%A4
		const parentRect = selectionBarEl.value.parentElement.getBoundingClientRect();
		const rect = tabEl.getBoundingClientRect();
		// Always keep a thin underline; never let page CSS stretch this bar
		selectionBarEl.value.style.height = '3px';
		selectionBarEl.value.style.minHeight = '0';
		selectionBarEl.value.style.maxHeight = '3px';
		selectionBarEl.value.style.width = rect.width + 'px';
		selectionBarEl.value.style.left = (rect.left - parentRect.left + selectionBarEl.value.parentElement.scrollLeft) + 'px';
	}
}

function onTabWheel(ev: WheelEvent) {
	if (ev.deltaY !== 0 && ev.deltaX === 0) {
		ev.preventDefault();
		ev.stopPropagation();
		(ev.currentTarget as HTMLElement).scrollBy({
			left: ev.deltaY,
			behavior: 'instant',
		});
	}
	return false;
}

let entering = false;

async function enter(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	entering = true;
	const elementWidth = el.getBoundingClientRect().width;
	el.style.width = '0';
	el.style.paddingLeft = '0';
	el.offsetWidth; // reflow
	el.style.width = `${elementWidth}px`;
	el.style.paddingLeft = '';
	nextTick(() => {
		entering = false;
	});

	window.setTimeout(renderTab, 170);
}

function afterEnter(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	// element.style.width = '';
}

async function leave(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	const elementWidth = el.getBoundingClientRect().width;
	el.style.width = `${elementWidth}px`;
	el.style.paddingLeft = '';
	el.offsetWidth; // reflow
	el.style.width = '0';
	el.style.paddingLeft = '0';
}

function afterLeave(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	el.style.width = '';
}

let ro2: ResizeObserver | null;

onMounted(() => {
	watch([() => props.tab, () => props.tabs], () => {
		nextTick(() => {
			if (entering) return;
			renderTab();
		});
	}, {
		immediate: true,
	});

	if (props.rootEl) {
		ro2 = new ResizeObserver((entries, observer) => {
			if (window.document.body.contains(el.value as HTMLElement)) {
				nextTick(() => renderTab());
			}
		});
		ro2.observe(props.rootEl);
	}
});

onUnmounted(() => {
	if (ro2) ro2.disconnect();
});
</script>

<style lang="scss" module>
.tabs {
	display: block;
	position: relative;
	margin: 0;
	height: var(--height);
	font-size: 0.8em;
	text-align: center;
	overflow-x: auto;
	overflow-y: hidden;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

.tabsInner {
	display: inline-block;
	position: relative;
	z-index: 1;
	height: var(--height);
	white-space: nowrap;
}

.tab {
	display: inline-block;
	position: relative;
	z-index: 1;
	padding: 0 10px;
	height: 100%;
	font-weight: normal;
	opacity: 0.7;

	&:hover {
		opacity: 1;
	}

	&.active {
		opacity: 1;
		color: var(--MI_THEME-accent);
	}

	&.animate {
		transition: opacity 0.2s ease;
	}
}

.tabInner {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
	position: relative;
	z-index: 1;
}

.tabIcon {
	/* Keep icon above the underline indicator */
	position: relative;
	z-index: 1;
	line-height: 1;
	font-size: 1.15em;
}

.tabIcon + .tabTitle {
	padding-left: 4px;
}

.tabTitle {
	overflow: hidden;
	position: relative;
	z-index: 1;

	&.animate {
		transition: width .15s linear, padding-left .15s linear;
	}
}

/*
 * Active indicator: thin underline only.
 * Named selectionBar (not *tab*) so [class*='tab'] page overrides cannot match.
 */
.selectionBar {
	position: absolute;
	bottom: 0;
	left: 0;
	z-index: 0;
	height: 3px !important;
	min-height: 0 !important;
	max-height: 3px !important;
	background: var(--MI_THEME-accent);
	border-radius: var(--MI-radius-ellipse);
	transition: none;
	pointer-events: none;
	box-sizing: border-box;
	overflow: hidden;

	&.animate {
		transition: width 0.15s ease, left 0.15s ease;
	}
}
</style>
