<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkButton v-if="canInvite" primary rounded style="margin: 0 auto;" @click="emit('inviteUser')"><i class="ti ti-plus"></i> {{ i18n.ts._chat.inviteUser }}</MkButton>

	<!-- Sorted: owner → admins → members -->
	<div v-for="row in sortedMembers" :key="row.key" :class="$style.membership">
		<MkA :class="$style.membershipBody" :to="`${userPage(row.user)}`">
			<MkUserCardMini :user="row.user"/>
		</MkA>
		<div :class="[$style.role, row.kind === 'owner' && $style.roleOwner, row.kind === 'admin' && $style.roleAdmin]">
			{{ row.kind === 'owner' ? tChat('roleOwner') : row.kind === 'admin' ? tChat('roleAdmin') : tChat('roleMember') }}
		</div>
		<button
			v-if="isOwner && row.kind !== 'owner' && row.membership"
			class="_button"
			:class="$style.roleBtn"
			@click="toggleRole(row.membership)"
		>
			{{ row.kind === 'admin' ? tChat('demoteToMember') : tChat('promoteToAdmin') }}
		</button>
	</div>

	<template v-if="canInvite">
		<hr>

		<div>{{ i18n.ts._chat.sentInvitations }}</div>

		<div v-for="invitation in invitations" :key="invitation.id" :class="$style.invitation">
			<MkA :class="$style.invitationBody" :to="`${userPage(invitation.user)}`">
				<MkUserCardMini :user="invitation.user"/>
			</MkA>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { userPage } from '@/filters/user.js';
import { ensureSignin } from '@/i.js';
import * as os from '@/os.js';
import { chatT, chatFb } from './chat-i18n.js';

const $i = ensureSignin();
const tChat = (key: keyof typeof chatFb) => chatT(key, chatFb[key]);

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'inviteUser'): void,
}>();

const isOwner = computed(() => {
	return props.room.ownerId === $i.id;
});

const canInvite = computed(() => {
	const role = (props.room as any).myRole;
	return role === 'owner' || role === 'admin' || $i.isAdmin || $i.isModerator;
});

const memberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);

type MemberRow = {
	key: string;
	kind: 'owner' | 'admin' | 'member';
	user: Misskey.entities.UserLite;
	membership?: Misskey.entities.ChatRoomMembership;
};

/** Owner first, then admins, then members */
const sortedMembers = computed((): MemberRow[] => {
	const rows: MemberRow[] = [];
	const owner = props.room.owner as Misskey.entities.UserLite | undefined;
	if (owner) {
		rows.push({ key: `owner:${owner.id}`, kind: 'owner', user: owner });
	}
	const admins = memberships.value
		.filter(m => (m as any).role === 'admin' && m.userId !== props.room.ownerId && m.user)
		.sort((a, b) => (a.user!.username || '').localeCompare(b.user!.username || ''));
	for (const m of admins) {
		rows.push({ key: m.id, kind: 'admin', user: m.user!, membership: m });
	}
	const members = memberships.value
		.filter(m => (m as any).role !== 'admin' && m.userId !== props.room.ownerId && m.user)
		.sort((a, b) => (a.user!.username || '').localeCompare(b.user!.username || ''));
	for (const m of members) {
		rows.push({ key: m.id, kind: 'member', user: m.user!, membership: m });
	}
	return rows;
});

async function toggleRole(membership: Misskey.entities.ChatRoomMembership) {
	const next = (membership as any).role === 'admin' ? 'member' : 'admin';
	const updated = await os.apiWithDialog('chat/rooms/members/update-role', {
		roomId: props.room.id,
		userId: membership.userId,
		role: next,
	} as any);
	const idx = memberships.value.findIndex(m => m.id === membership.id);
	if (idx >= 0) {
		memberships.value[idx] = updated as any;
	}
}

onMounted(async () => {
	memberships.value = await misskeyApi('chat/rooms/members', {
		roomId: props.room.id,
		limit: 100,
	});

	if (canInvite.value) {
		invitations.value = await misskeyApi('chat/rooms/invitations/outbox', {
			roomId: props.room.id,
			limit: 50,
		});
	}
});
</script>

<style lang="scss" module>
.membership {
	display: flex;
	align-items: center;
	gap: 8px;
}

.membershipBody {
	flex: 1;
	min-width: 0;
	margin-right: 8px;
}

.role {
	font-size: 75%;
	opacity: 0.7;
	white-space: nowrap;
}

.roleOwner {
	opacity: 1;
	font-weight: 700;
	color: var(--MI_THEME-accent);
}

.roleAdmin {
	opacity: 0.9;
	font-weight: 600;
}

.roleBtn {
	font-size: 75%;
	padding: 4px 8px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 999px;
	white-space: nowrap;
}

.invitation {
	display: flex;
}

.invitationBody {
	flex: 1;
	min-width: 0;
	margin-right: 8px;
}
</style>
