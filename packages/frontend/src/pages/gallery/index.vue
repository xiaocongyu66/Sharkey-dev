<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<div class="_spacer" style="--MI_SPACER-w: 1400px;">
		<div v-if="tab === 'explore'">
			<MkFoldableSection class="_margin">
				<template #header><i class="ti ti-clock"></i>{{ i18n.ts.recentPosts }}</template>
				<MkPagination ref="recentPaging" v-slot="{items}" :pagination="recentPostsPagination" :disableAutoLoad="true">
					<div :class="$style.items">
						<MkGalleryPostPreview v-for="post in items" :key="post.id" :post="post" class="post"/>
					</div>
				</MkPagination>
			</MkFoldableSection>
			<MkFoldableSection class="_margin">
				<template #header><i class="ti ti-comet"></i>{{ i18n.ts.popularPosts }}</template>
				<MkPagination v-slot="{items}" :pagination="popularPostsPagination" :disableAutoLoad="true">
					<div :class="$style.items">
						<MkGalleryPostPreview v-for="post in items" :key="post.id" :post="post" class="post"/>
					</div>
				</MkPagination>
			</MkFoldableSection>
		</div>
		<div v-else-if="tab === 'liked'">
			<MkPagination v-slot="{items}" :pagination="likedPostsPagination">
				<div :class="$style.items">
					<MkGalleryPostPreview v-for="like in items" :key="like.id" :post="like.post" class="post"/>
				</div>
			</MkPagination>
		</div>
		<div v-else-if="tab === 'my'">
			<MkA to="/gallery/new" class="_link" style="margin: 16px;"><i class="ti ti-plus"></i> {{ i18n.ts.postToGallery }}</MkA>
			<MkPagination ref="myPaging" v-slot="{items}" :pagination="myPostsPagination">
				<div :class="$style.items">
					<MkGalleryPostPreview v-for="post in items" :key="post.id" :post="post" class="post"/>
				</div>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { watch, ref, computed, onMounted, onBeforeUnmount, useTemplateRef } from 'vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkGalleryPostPreview from '@/components/MkGalleryPostPreview.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import { globalEvents } from '@/events.js';

const router = useRouter();

const props = defineProps<{
	tag?: string;
}>();

const tab = ref('explore');
const tags = ref([]);
const tagsRef = ref();
const recentPaging = useTemplateRef('recentPaging');
const myPaging = useTemplateRef('myPaging');

const recentPostsPagination = {
	endpoint: 'gallery/posts' as const,
	limit: 6,
};
const popularPostsPagination = {
	endpoint: 'gallery/featured' as const,
	noPaging: true,
};
const myPostsPagination = {
	endpoint: 'i/gallery/posts' as const,
	limit: 5,
};
const likedPostsPagination = {
	endpoint: 'i/gallery/likes' as const,
	limit: 5,
};

function onContentCreated(payload: { kind: string; id: string; item?: any }) {
	if (payload.kind !== 'galleryPost') return;
	// Prefetch new item into open lists when possible
	if (payload.item && typeof payload.item === 'object' && payload.item.id) {
		recentPaging.value?.prepend?.(payload.item);
		myPaging.value?.prepend?.(payload.item);
	} else {
		recentPaging.value?.reload?.();
		myPaging.value?.reload?.();
	}
}

onMounted(() => {
	globalEvents.on('contentCreated', onContentCreated);
});
onBeforeUnmount(() => {
	globalEvents.off('contentCreated', onContentCreated);
});

const tagUsersPagination = computed(() => ({
	endpoint: 'hashtags/users' as const,
	limit: 30,
	params: {
		tag: props.tag,
		origin: 'combined',
		sort: '+follower',
	},
}));

watch(() => props.tag, () => {
	if (tagsRef.value) tagsRef.value.tags.toggleContent(props.tag == null);
});

const headerActions = computed(() => [{
	icon: 'ti ti-plus',
	text: i18n.ts.create,
	handler: () => {
		router.push('/gallery/new');
	},
}]);

const headerTabs = computed(() => [{
	key: 'explore',
	title: i18n.ts.gallery,
	icon: 'ph-images-square ph-bold ph-lg',
}, {
	key: 'liked',
	title: i18n.ts._gallery.liked,
	icon: 'ti ti-heart',
}, {
	key: 'my',
	title: i18n.ts._gallery.my,
	icon: 'ti ti-edit',
}]);

definePage(() => ({
	title: i18n.ts.gallery,
	icon: 'ph-images-square ph-bold ph-lg',
}));
</script>

<style lang="scss" module>
.items {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
	grid-gap: 12px;
	margin: 0 var(--MI-margin);
}
</style>
