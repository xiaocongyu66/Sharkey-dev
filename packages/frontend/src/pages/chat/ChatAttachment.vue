<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!--
  Chat-optimized media: fixed readable size so videos/images aren't crushed by
  container-query height (cqh) / shrink-wrap bubbles. Lazy: poster until play;
  deactivate player when far off-screen (Telegram-like, lower decoder cost).
-->
<template>
<div ref="rootEl" :class="$style.root">
	<!-- Image -->
	<template v-if="isImage">
		<a
			:href="file.url"
			target="_blank"
			rel="noopener"
			:class="$style.imageLink"
			@click.prevent="openImage"
		>
			<img
				v-if="nearViewport || activated"
				:src="file.thumbnailUrl || file.url"
				:alt="file.name || ''"
				:class="$style.image"
				loading="lazy"
				decoding="async"
			/>
			<div v-else :class="$style.imagePlaceholder" />
		</a>
	</template>

	<!-- Video: poster first, play on demand; unload when far away -->
	<template v-else-if="isVideo">
		<div :class="$style.videoBox">
			<video
				v-if="activated"
				ref="videoEl"
				:class="$style.video"
				:src="file.url"
				:poster="file.thumbnailUrl || undefined"
				controls
				playsinline
				preload="metadata"
				@click.stop
				@play="playing = true"
				@pause="playing = false"
				@ended="playing = false"
			/>
			<button
				v-else
				type="button"
				:class="$style.videoPoster"
				@click.stop="activateVideo"
			>
				<img
					v-if="file.thumbnailUrl"
					:src="file.thumbnailUrl"
					alt=""
					:class="$style.posterImg"
					loading="lazy"
					decoding="async"
				/>
				<div v-else :class="$style.posterFallback">
					<i class="ti ti-movie"></i>
				</div>
				<span :class="$style.playBtn"><i class="ti ti-player-play-filled"></i></span>
				<span v-if="file.size" :class="$style.sizeHint">{{ bytes(file.size) }}</span>
			</button>
		</div>
	</template>

	<!-- Other files -->
	<a
		v-else
		:href="file.url"
		target="_blank"
		rel="noopener"
		:class="$style.fileLink"
		@click.stop
	>
		<i class="ti ti-file"></i>
		<span class="_nowrap">{{ file.name || 'file' }}</span>
		<span v-if="file.size" :class="$style.sizeHintInline">{{ bytes(file.size) }}</span>
	</a>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { FILE_TYPE_BROWSERSAFE } from '@@/js/const.js';
import bytes from '@/filters/bytes.js';

const props = defineProps<{
	file: Misskey.entities.DriveFile;
}>();

const rootEl = useTemplateRef('rootEl');
const videoEl = useTemplateRef('videoEl');
const activated = ref(false);
const playing = ref(false);
const nearViewport = ref(false);
let io: IntersectionObserver | null = null;

const isImage = computed(() =>
	props.file.type.startsWith('image/') && FILE_TYPE_BROWSERSAFE.includes(props.file.type),
);
const isVideo = computed(() =>
	props.file.type.startsWith('video/') && FILE_TYPE_BROWSERSAFE.includes(props.file.type),
);

function activateVideo() {
	activated.value = true;
}

function unloadVideo(force = false) {
	if (!activated.value) return;
	// Keep player if actively playing unless forced (tab hidden / unmount)
	if (playing.value && !force) return;
	const v = videoEl.value;
	if (v) {
		try {
			v.pause();
			v.removeAttribute('src');
			v.removeAttribute('poster');
			v.load();
		} catch { /* ignore */ }
	}
	activated.value = false;
	playing.value = false;
}

function openImage() {
	window.open(props.file.url, '_blank', 'noopener');
}

function onDocVisibility() {
	// Background tab: free decoder even if still "near" in layout
	if (window.document.hidden) {
		unloadVideo(true);
	}
}

onMounted(() => {
	window.document.addEventListener('visibilitychange', onDocVisibility);
	if (!rootEl.value || typeof IntersectionObserver === 'undefined') {
		nearViewport.value = true;
		return;
	}
	io = new IntersectionObserver((entries) => {
		for (const e of entries) {
			if (e.isIntersecting) {
				nearViewport.value = true;
				continue;
			}
			nearViewport.value = false;
			// Far off-screen: free decoder / main-thread cost
			const r = e.boundingClientRect;
			const far =
				r.bottom < -window.innerHeight * 0.35 ||
				r.top > window.innerHeight * 1.35;
			if (far) unloadVideo(true);
		}
	}, { rootMargin: '80px 0px', threshold: [0, 0.01] });
	io.observe(rootEl.value);
});

onBeforeUnmount(() => {
	window.document.removeEventListener('visibilitychange', onDocVisibility);
	io?.disconnect();
	io = null;
	playing.value = false;
	if (videoEl.value) {
		try {
			videoEl.value.pause();
			videoEl.value.removeAttribute('src');
			videoEl.value.load();
		} catch { /* ignore */ }
	}
	activated.value = false;
});
</script>

<style lang="scss" module>
.root {
	/*
	  Definite width (not % of shrink-wrapped fukidashi) so video/image
	  establish bubble size — was collapsing to tiny/unusable in groups.
	*/
	width: min(72vw, 320px);
	max-width: 100%;
	min-width: min(100%, 200px);
	box-sizing: border-box;
}

.imageLink {
	display: block;
	border-radius: 10px;
	overflow: hidden;
	line-height: 0;
	background: #000;
	min-height: 120px;
}

.image {
	display: block;
	width: 100%;
	max-height: min(50vh, 360px);
	object-fit: contain;
	background: #111;
}

.imagePlaceholder {
	width: 100%;
	min-height: 140px;
	aspect-ratio: 4 / 3;
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, #111);
}

.videoBox {
	position: relative;
	width: 100%;
	/* Force readable size even when parent has no height / cqh collapses */
	aspect-ratio: 16 / 9;
	min-height: 200px;
	max-height: min(52vh, 400px);
	border-radius: 10px;
	overflow: hidden;
	background: #000;
}

.video {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: contain;
	background: #000;
}

.videoPoster {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	padding: 0;
	border: none;
	cursor: pointer;
	background: #111;
	color: #fff;
}

.posterImg {
	width: 100%;
	height: 100%;
	object-fit: cover;
	opacity: 0.92;
}

.posterFallback {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 2.2rem;
	opacity: 0.55;
	background: linear-gradient(145deg, #1a1a1a, #0a0a0a);
}

.playBtn {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	width: 56px;
	height: 56px;
	border-radius: 999px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: color-mix(in srgb, var(--MI_THEME-accent) 92%, #000);
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
	font-size: 1.3rem;
	pointer-events: none;
}

.sizeHint {
	position: absolute;
	right: 8px;
	bottom: 8px;
	font-size: 0.75rem;
	padding: 2px 6px;
	border-radius: 6px;
	background: rgba(0, 0, 0, 0.55);
	color: #fff;
	pointer-events: none;
}

.sizeHintInline {
	opacity: 0.65;
	font-size: 0.85em;
	margin-left: 4px;
}

.fileLink {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	max-width: 100%;
	padding: 8px 10px;
	border-radius: 10px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	color: inherit;
	text-decoration: none;
	font-size: 0.9em;
}
</style>
