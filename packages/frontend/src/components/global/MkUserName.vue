<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Mfm :text="liveUser.name ?? liveUser.username" :author="liveUser" :plain="true" :nowrap="nowrap" :emojiUrls="liveUser.emojis"/>
</template>

<script lang="ts" setup>
import { toRef } from 'vue';
import * as Misskey from 'misskey-js';
import { useLiveUser } from '@/utility/live-user-cache.js';

const props = withDefaults(defineProps<{
	user: Misskey.entities.User;
	nowrap?: boolean;
}>(), {
	nowrap: true,
});

const liveUser = useLiveUser(toRef(props, 'user'));
</script>
