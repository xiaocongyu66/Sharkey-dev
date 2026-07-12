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
		<div :class="$style.meta">
			<div :class="[$style.role, row.kind === 'owner' && $style.roleOwner, row.kind === 'admin' && $style.roleAdmin]">
				{{ row.kind === 'owner' ? tChat('roleOwner') : row.kind === 'admin' ? tChat('roleAdmin') : tChat('roleMember') }}
			</div>
			<div v-if="row.mutedUntil" :class="$style.mutedBadge" :title="row.mutedUntil">
				{{ tChat('mutedUntil') }} {{ formatMutedUntil(row.mutedUntil) }}
			</div>
		</div>
		<button
			v-if="canManageMember(row)"
			class="_button"
			:class="$style.roleBtn"
			@click="openMemberMenu(row, $event)"
		>
			<i class="ti ti-dots"></i>
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

	<template v-if="canModerate">
		<hr>
		<div class="_gaps_s">
			<div style="font-weight: 600;">{{ tChat('blacklist') }}</div>
			<div style="opacity: 0.75; font-size: 90%;">{{ tChat('blacklistHint') }}</div>
			<div v-if="bans.length === 0" style="opacity: 0.7;">{{ tChat('blacklistEmpty') }}</div>
			<div v-for="ban in bans" :key="ban.id" :class="$style.banRow">
				<MkA v-if="ban.user" :class="$style.banBody" :to="`${userPage(ban.user)}`">
					<MkUserCardMini :user="ban.user"/>
				</MkA>
				<div v-else :class="$style.banBody">{{ ban.userId }}</div>
				<button class="_button" :class="$style.roleBtn" @click="unban(ban)">
					{{ tChat('unbanMember') }}
				</button>
			</div>
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
import type { MenuItem } from '@/types/menu.js';
import { chatT, chatFb } from './chat-i18n.js';

const $i = ensureSignin();
const tChat = (key: keyof typeof chatFb) => chatT(key, chatFb[key]);

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'inviteUser'): void,
}>();

const isOwner = computed(() => props.room.ownerId === $i.id);
const isSiteStaff = computed(() => !!( $i.isAdmin || $i.isModerator ));
const myRole = computed(() => (props.room as any).myRole as string | null | undefined);

const canModerate = computed(() => {
	const role = myRole.value;
	return role === 'owner' || role === 'admin' || isSiteStaff.value;
});

/** Owner or site staff can appoint room admins */
const canAppointAdmin = computed(() => isOwner.value || isSiteStaff.value);

const canInvite = computed(() => canModerate.value);

const memberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);
const bans = ref<Array<{
	id: string;
	userId: string;
	user?: Misskey.entities.UserLite;
	reason?: string | null;
}>>([]);

type MemberRow = {
	key: string;
	kind: 'owner' | 'admin' | 'member';
	user: Misskey.entities.UserLite;
	membership?: Misskey.entities.ChatRoomMembership;
	mutedUntil?: string | null;
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
		rows.push({
			key: m.id,
			kind: 'admin',
			user: m.user!,
			membership: m,
			mutedUntil: (m as any).mutedUntil ?? null,
		});
	}
	const members = memberships.value
		.filter(m => (m as any).role !== 'admin' && m.userId !== props.room.ownerId && m.user)
		.sort((a, b) => (a.user!.username || '').localeCompare(b.user!.username || ''));
	for (const m of members) {
		rows.push({
			key: m.id,
			kind: 'member',
			user: m.user!,
			membership: m,
			mutedUntil: (m as any).mutedUntil ?? null,
		});
	}
	return rows;
});

function formatMutedUntil(iso: string): string {
	try {
		const d = new Date(iso);
		if (d.getTime() <= Date.now()) return '';
		return d.toLocaleString();
	} catch {
		return iso;
	}
}

/** Whether current user can open moderation menu for this row */
function canManageMember(row: MemberRow): boolean {
	if (!canModerate.value) return false;
	if (row.user.id === $i.id) return false;
	if (row.kind === 'owner') return false;

	if (isSiteStaff.value) return true;
	if (isOwner.value) {
		// Owner: admins + members
		return row.kind === 'admin' || row.kind === 'member';
	}
	if (myRole.value === 'admin') {
		// Room admin: only normal members
		return row.kind === 'member';
	}
	return false;
}

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

async function applyMute(userId: string, durationSeconds: number) {
	const updated = await os.apiWithDialog('chat/rooms/members/mute' as any, {
		roomId: props.room.id,
		userId,
		durationSeconds,
	} as any);
	const idx = memberships.value.findIndex(m => m.userId === userId);
	if (idx >= 0 && updated) {
		memberships.value[idx] = updated as any;
	}
}

async function openCustomMute(userId: string) {
	const { canceled, result } = await os.form(tChat('muteCustomTitle'), {
		amount: {
			type: 'number',
			label: tChat('muteAmount'),
			default: 10,
			step: 1,
		},
		unit: {
			type: 'enum',
			label: tChat('muteUnit'),
			default: 'minutes',
			enum: [
				{ label: tChat('muteUnitSeconds'), value: 'seconds' },
				{ label: tChat('muteUnitMinutes'), value: 'minutes' },
				{ label: tChat('muteUnitHours'), value: 'hours' },
				{ label: tChat('muteUnitDays'), value: 'days' },
				{ label: tChat('muteUnitMonths'), value: 'months' },
			],
		},
	});
	if (canceled || !result) return;
	const amount = Math.max(1, Math.floor(Number(result.amount) || 1));
	const unit = String(result.unit || 'minutes');
	const mult =
		unit === 'seconds' ? 1
		: unit === 'minutes' ? 60
		: unit === 'hours' ? 3600
		: unit === 'days' ? 86400
		: unit === 'months' ? 30 * 86400
		: 60;
	const sec = Math.min(amount * mult, 365 * 24 * 60 * 60);
	await applyMute(userId, sec);
}

async function kick(userId: string) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: tChat('kickMemberConfirm'),
	});
	if (canceled) return;
	await os.apiWithDialog('chat/rooms/members/kick' as any, {
		roomId: props.room.id,
		userId,
	} as any);
	memberships.value = memberships.value.filter(m => m.userId !== userId);
}

async function ban(userId: string) {
	const { canceled, result } = await os.form(tChat('banMember'), {
		reason: {
			type: 'string',
			label: tChat('banReason'),
			default: '',
		},
	});
	if (canceled) return;
	const { canceled: c2 } = await os.confirm({
		type: 'warning',
		text: tChat('banMemberConfirm'),
	});
	if (c2) return;
	const banRow = await os.apiWithDialog('chat/rooms/members/ban' as any, {
		roomId: props.room.id,
		userId,
		reason: result?.reason || null,
	} as any);
	memberships.value = memberships.value.filter(m => m.userId !== userId);
	if (banRow) {
		bans.value = [banRow as any, ...bans.value.filter(b => b.userId !== userId)];
	}
}

async function unban(ban: { userId: string }) {
	await os.apiWithDialog('chat/rooms/members/unban' as any, {
		roomId: props.room.id,
		userId: ban.userId,
	} as any);
	bans.value = bans.value.filter(b => b.userId !== ban.userId);
}

function openMemberMenu(row: MemberRow, ev: MouseEvent) {
	if (!row.membership && row.kind !== 'owner') return;
	const menu: MenuItem[] = [];
	const userId = row.user.id;
	const muted = row.mutedUntil && new Date(row.mutedUntil).getTime() > Date.now();

	if (canAppointAdmin.value && row.membership && (row.kind === 'admin' || row.kind === 'member')) {
		menu.push({
			text: row.kind === 'admin' ? tChat('demoteToMember') : tChat('promoteToAdmin'),
			icon: row.kind === 'admin' ? 'ti ti-user-down' : 'ti ti-user-up',
			action: () => {
				void toggleRole(row.membership!);
			},
		});
		menu.push({ type: 'divider' });
	}

	// Mute presets
	const mutePresets: Array<{ text: string; sec: number }> = [
		{ text: tChat('mute10m'), sec: 10 * 60 },
		{ text: tChat('mute30m'), sec: 30 * 60 },
		{ text: tChat('mute1h'), sec: 60 * 60 },
		{ text: tChat('mute2h'), sec: 2 * 60 * 60 },
		{ text: tChat('mute1d'), sec: 24 * 60 * 60 },
		{ text: tChat('mute1mo'), sec: 30 * 24 * 60 * 60 },
	];

	menu.push({
		type: 'parent',
		text: tChat('muteMember'),
		icon: 'ti ti-message-off',
		children: [
			...mutePresets.map(p => ({
				text: p.text,
				action: () => {
					void applyMute(userId, p.sec);
				},
			})),
			{
				text: tChat('muteCustom'),
				action: () => {
					void openCustomMute(userId);
				},
			},
		],
	});

	if (muted) {
		menu.push({
			text: tChat('unmuteMember'),
			icon: 'ti ti-message',
			action: () => {
				void applyMute(userId, 0);
			},
		});
	}

	menu.push({ type: 'divider' });

	menu.push({
		text: tChat('kickMember'),
		icon: 'ti ti-boot',
		danger: true,
		action: () => {
			void kick(userId);
		},
	});

	menu.push({
		text: tChat('banMember'),
		icon: 'ti ti-ban',
		danger: true,
		action: () => {
			void ban(userId);
		},
	});

	os.popupMenu(menu, ev.currentTarget ?? ev.target);
}

async function loadBans() {
	if (!canModerate.value) return;
	try {
		bans.value = await misskeyApi('chat/rooms/bans' as any, {
			roomId: props.room.id,
			limit: 100,
		} as any) as any;
	} catch {
		bans.value = [];
	}
}

onMounted(async () => {
	memberships.value = await misskeyApi('chat/rooms/members', {
		roomId: props.room.id,
		limit: 100,
	});

	if (canInvite.value) {
		try {
			invitations.value = await misskeyApi('chat/rooms/invitations/outbox', {
				roomId: props.room.id,
				limit: 50,
			});
		} catch {
			invitations.value = [];
		}
	}

	await loadBans();
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

.meta {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 2px;
	flex-shrink: 0;
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

.mutedBadge {
	font-size: 70%;
	opacity: 0.85;
	color: var(--MI_THEME-warn);
	white-space: nowrap;
	max-width: 140px;
	overflow: hidden;
	text-overflow: ellipsis;
}

.roleBtn {
	font-size: 75%;
	padding: 4px 8px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 999px;
	white-space: nowrap;
	flex-shrink: 0;
}

.invitation {
	display: flex;
}

.invitationBody {
	flex: 1;
	min-width: 0;
	margin-right: 8px;
}

.banRow {
	display: flex;
	align-items: center;
	gap: 8px;
}

.banBody {
	flex: 1;
	min-width: 0;
}
</style>
