<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="[$style.root, { [$style.disabled]: !canCompose }]"
	@dragover.stop="onDragover"
	@drop.stop="onDrop"
>
	<div v-if="!canCompose" :class="$style.mutedBanner" role="status">
		<i class="ti ti-message-off" aria-hidden="true"></i>
		<div :class="$style.mutedBannerText">
			<div :class="$style.mutedBannerTitle">{{ mutedAllTitle }}</div>
			<div :class="$style.mutedBannerBody">{{ mutedAllBody }}</div>
		</div>
	</div>
	<div v-if="replyTo && canCompose" :class="$style.replyBar">
		<div :class="$style.replyBarAccent" aria-hidden="true"></div>
		<div :class="$style.replyBarBody">
			<div :class="$style.replyBarHead">
				<i class="ti ti-arrow-back-up"></i>
				<span>{{ i18n.ts.reply }}</span>
				<span v-if="replyAuthorLabel" :class="$style.replyBarName">{{ replyAuthorLabel }}</span>
			</div>
			<div :class="$style.replyBarText">{{ replyPreviewLabel }}</div>
		</div>
		<button class="_button" :class="$style.replyBarClose" @click="$emit('clearReply')"><i class="ti ti-x"></i></button>
	</div>
	<textarea
		ref="textareaEl"
		v-model="text"
		:class="$style.textarea"
		class="_acrylic"
		:placeholder="canCompose ? i18n.ts.inputMessageHere : mutedAllBody"
		:readonly="textareaReadOnly || !canCompose || sending"
		:disabled="!canCompose || sending"
		@keydown="onKeydown"
		@paste="onPaste"
	></textarea>
	<div v-if="showStickers && !sending" :class="$style.stickerPanel">
		<StickerPicker @pick="onStickerPick" @close="showStickers = false"/>
	</div>
	<footer :class="$style.footer">
		<div v-if="file && canCompose" :class="[$style.file, { [$style.fileDisabled]: sending }]" @click="!sending && (file = null)">{{ file.name }}</div>
		<div :class="$style.buttons">
			<button class="_button" :class="$style.button" :disabled="!canCompose || sending" :title="i18n.ts.attachFile" @click="chooseFile">
				<i class="ti ti-photo-plus"></i>
				<span :class="$style.btnLabel">{{ i18n.ts.attachFile }}</span>
			</button>
			<button class="_button" :class="$style.button" :disabled="!canCompose || sending" :title="i18n.ts.emoji" @click="insertEmoji">
				<i class="ti ti-mood-happy"></i>
				<span :class="$style.btnLabel">{{ i18n.ts.emoji }}</span>
			</button>
			<button class="_button" :class="[$style.button, showStickers ? $style.active : null]" :disabled="!canCompose || sending" :title="stickersLabel" @click="showStickers = !showStickers">
				<i class="ti ti-sticker"></i>
				<span :class="$style.btnLabel">{{ stickersLabel }}</span>
			</button>
			<button
				class="_button"
				:class="[$style.button, $style.send, { [$style.sending]: sending }]"
				:disabled="!canCompose || !canSend || sending"
				:title="sending ? sendBusyTitle : i18n.ts.send"
				:aria-busy="sending"
				@click="send"
			>
				<span :class="$style.sendIconWrap">
					<span v-if="sending" :class="$style.sendSpinner" aria-hidden="true"></span>
					<i v-else class="ti ti-send"></i>
				</span>
				<span :class="$style.btnLabel">{{ sending ? sendBusyLabel : i18n.ts.send }}</span>
			</button>
		</div>
	</footer>
	<input ref="fileEl" style="display: none;" type="file" @change="onChangeFile"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, shallowRef, computed, nextTick, readonly, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
//import insertTextAtCursor from 'insert-text-at-cursor';
import { formatTimeString } from '@@/js/format-time-string.js';
import { selectFile } from '@/utility/select-file.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { uploadFile } from '@/utility/upload.js';
import { miLocalStorage } from '@/local-storage.js';
import { misskeyApi, printError } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import { $i } from '@/i.js';
import StickerPicker from './StickerPicker.vue';
import { chatT, ensureChatLocaleFresh } from './chat-i18n.js';

const props = defineProps<{
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
	replyTo?: Misskey.entities.ChatMessageLite | null;
	/**
	 * Prefer WebSocket when provided.
	 * - false: not available, fall back to REST
	 * - true: handled (legacy sync)
	 * - Promise: wait until server acks so spinner matches real send time
	 */
	wsSend?: (payload: {
		text?: string;
		fileId?: string;
		replyId?: string;
		isE2ee?: boolean;
		ciphertext?: string;
	}) => boolean | Promise<boolean>;
}>();

const emit = defineEmits<{
	(ev: 'clearReply'): void;
}>();

const textareaEl = shallowRef<HTMLTextAreaElement>();
const fileEl = shallowRef<HTMLInputElement>();

const text = ref<string>('');
const file = ref<Misskey.entities.DriveFile | null>(null);
const sending = ref(false);
const textareaReadOnly = ref(false);
const showStickers = ref(false);
let autocompleteInstance: Autocomplete | null = null;

/** false when room is muted-all and current user is not owner/admin/instance mod */
const canCompose = computed(() => {
	const r = props.room as any;
	if (r == null) return true;
	if (!r.isMutedAll) return true;
	const role = r.myRole as string | null | undefined;
	if (role === 'owner' || role === 'admin') return true;
	if ($i?.isAdmin || $i?.isModerator) return true;
	return false;
});

ensureChatLocaleFresh();

const mutedAllTitle = computed(() => chatT('mutedAll'));
const mutedAllBody = computed(() => chatT('mutedAllComposerDisabled'));
const stickersLabel = computed(() => chatT('stickers'));

const canSend = computed(() => canCompose.value && !sending.value && ((text.value != null && text.value !== '') || file.value != null));
const sendBusyLabel = computed(() => chatT('sending'));
const sendBusyTitle = computed(() => chatT('sendingHint'));

const replyAuthorLabel = computed(() => {
	const r = props.replyTo as any;
	if (!r) return '';
	const u = r.fromUser;
	const name = u?.name;
	const username = u?.username;
	if (name && username) return `${name} (@${username})`;
	if (username) return `@${username}`;
	if (name) return name;
	return '';
});

const replyPreviewLabel = computed(() => {
	const r = props.replyTo as any;
	if (!r) return '';
	if (r.text && String(r.text).trim().length > 0) return r.text;
	const type = r.file?.type ?? '';
	if (type.startsWith('video/')) return chatT('replyVideo');
	if (type.startsWith('image/')) return chatT('replyImage');
	if (type.startsWith('audio/')) return chatT('replyAudio');
	if (r.file || r.fileId) return chatT('replyFile');
	if (r.isE2ee) return chatT('replyE2ee');
	return '…';
});

watch(canCompose, (ok) => {
	if (!ok) {
		// clear draft content that cannot be sent, but keep sticker panel usable for browsing
		text.value = '';
		file.value = null;
		emit('clearReply');
	}
});

function getDraftKey() {
	return props.user ? 'user:' + props.user.id : 'room:' + props.room?.id;
}

watch([text, file], saveDraft);

async function onPaste(ev: ClipboardEvent) {
	if (!canCompose.value) {
		ev.preventDefault();
		return;
	}
	if (!ev.clipboardData) return;

	const pastedFileName = 'yyyy-MM-dd HH-mm-ss [{{number}}]';

	const clipboardData = ev.clipboardData;
	const items = clipboardData.items;

	if (items.length === 1) {
		if (items[0].kind === 'file') {
			const pastedFile = items[0].getAsFile();
			if (!pastedFile) return;
			const lio = pastedFile.name.lastIndexOf('.');
			const ext = lio >= 0 ? pastedFile.name.slice(lio) : '';
			const formatted = formatTimeString(new Date(pastedFile.lastModified), pastedFileName).replace(/{{number}}/g, '1') + ext;
			if (formatted) upload(pastedFile, formatted);
		}
	} else {
		if (items[0].kind === 'file') {
			os.alert({
				type: 'error',
				text: i18n.ts.onlyOneFileCanBeAttached,
			});
		}
	}
}

function onDragover(ev: DragEvent) {
	if (!canCompose.value) return;
	if (!ev.dataTransfer) return;

	const isFile = ev.dataTransfer.items[0].kind === 'file';
	const isDriveFile = ev.dataTransfer.types[0] === _DATA_TRANSFER_DRIVE_FILE_;
	if (isFile || isDriveFile) {
		ev.preventDefault();
		switch (ev.dataTransfer.effectAllowed) {
			case 'all':
			case 'uninitialized':
			case 'copy':
			case 'copyLink':
			case 'copyMove':
				ev.dataTransfer.dropEffect = 'copy';
				break;
			case 'linkMove':
			case 'move':
				ev.dataTransfer.dropEffect = 'move';
				break;
			default:
				ev.dataTransfer.dropEffect = 'none';
				break;
		}
	}
}

function onDrop(ev: DragEvent): void {
	if (!canCompose.value) return;
	if (!ev.dataTransfer) return;

	// ファイルだったら
	if (ev.dataTransfer.files.length === 1) {
		ev.preventDefault();
		upload(ev.dataTransfer.files[0]);
		return;
	} else if (ev.dataTransfer.files.length > 1) {
		ev.preventDefault();
		os.alert({
			type: 'error',
			text: i18n.ts.onlyOneFileCanBeAttached,
		});
		return;
	}

	//#region ドライブのファイル
	const driveFile = ev.dataTransfer.getData(_DATA_TRANSFER_DRIVE_FILE_);
	if (driveFile != null && driveFile !== '') {
		file.value = JSON.parse(driveFile);
		ev.preventDefault();
	}
	//#endregion
}

function onKeydown(ev: KeyboardEvent) {
	if (!canCompose.value || sending.value) {
		if (sending.value && ev.key === 'Enter') ev.preventDefault();
		if (!canCompose.value) ev.preventDefault();
		return;
	}
	if (ev.key === 'Enter') {
		if (prefer.s['chat.sendOnEnter']) {
			if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
				ev.preventDefault();
				send();
			}
		} else {
			if ((ev.ctrlKey || ev.metaKey)) {
				ev.preventDefault();
				send();
			}
		}
	}
}

function chooseFile(ev: MouseEvent) {
	if (!canCompose.value) return;
	selectFile(ev.currentTarget ?? ev.target, i18n.ts.selectFile).then(selectedFile => {
		file.value = selectedFile;
	});
}

function onChangeFile() {
	if (fileEl.value == null || fileEl.value.files == null) return;

	if (fileEl.value.files[0]) upload(fileEl.value.files[0]);
}

function upload(fileToUpload: File, name?: string) {
	uploadFile(fileToUpload, prefer.s.uploadFolder, name).then(res => {
		file.value = res;
	});
}

async function sendPayload(payload: { text?: string; fileId?: string }) {
	if (!canCompose.value || sending.value) return;
	// Guard empty payload (race with double-tap)
	if (!payload.text && !payload.fileId) return;

	sending.value = true;
	const replyId = props.replyTo?.id;

	try {
		const wsPayload = {
			text: payload.text,
			fileId: payload.fileId,
			replyId,
		};

		// Prefer WebSocket (room + 1:1) — keep spinner until msgAck + bubble visible
		if (props.wsSend) {
			const handed = props.wsSend(wsPayload);
			if (handed !== false) {
				const ok = handed === true ? true : await handed;
				if (ok) {
					// Clear only after server accepted and message is (or should be) on screen
					clear();
					showStickers.value = false;
					return;
				}
				// WS rejected → try REST below
			}
		}

		const req = props.user
			? misskeyApi('chat/messages/create-to-user', {
				toUserId: props.user.id,
				text: payload.text,
				fileId: payload.fileId,
				replyId: replyId,
			} as any)
			: props.room
				? misskeyApi('chat/messages/create-to-room', {
					toRoomId: props.room.id,
					text: payload.text,
					fileId: payload.fileId,
					replyId: replyId,
				} as any)
				: null;

		if (!req) return;

		await req;
		clear();
		showStickers.value = false;
	} catch (err) {
		console.error('Error in chat:', err);
		await os.alert({
			type: 'error',
			title: i18n.ts.error,
			text: printError(err),
		});
	} finally {
		sending.value = false;
	}
}



function send() {
	if (!canCompose.value || sending.value || !canSend.value) return;
	void sendPayload({
		text: text.value ? text.value : undefined,
		fileId: file.value ? file.value.id : undefined,
	});
}

function onStickerPick(sticker: { fileId: string }) {
	if (!canCompose.value || sending.value) {
		if (!canCompose.value) {
			os.alert({
				type: 'warning',
				text: mutedAllBody.value,
			});
		}
		return;
	}
	void sendPayload({ fileId: sticker.fileId });
}

function clear() {
	text.value = '';
	file.value = null;
	emit('clearReply');
	deleteDraft();
}

function saveDraft() {
	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	drafts[getDraftKey()] = {
		updatedAt: new Date(),
		data: {
			text: text.value,
			file: file.value,
		},
	};

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

function deleteDraft() {
	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	delete drafts[getDraftKey()];

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

async function insertEmoji(ev: MouseEvent) {
	// allow opening emoji picker even when muted; insertion only applies if compose is allowed
	textareaReadOnly.value = true;
	const target = ev.currentTarget ?? ev.target;
	if (target == null) return;

	// emojiPickerはダイアログが閉じずにtextareaとやりとりするので、
	// focustrapをかけているとinsertTextAtCursorが効かない
	// そのため、投稿フォームのテキストに直接注入する
	// See: https://github.com/misskey-dev/misskey/pull/14282
	//      https://github.com/misskey-dev/misskey/issues/14274

	let pos = textareaEl.value?.selectionStart ?? 0;
	let posEnd = textareaEl.value?.selectionEnd ?? text.value.length;
	emojiPicker.show(
		target as HTMLElement,
		emoji => {
			if (!canCompose.value) return;
			const textBefore = text.value.substring(0, pos);
			const textAfter = text.value.substring(posEnd);
			text.value = textBefore + emoji + textAfter;
			pos += emoji.length;
			posEnd += emoji.length;
		},
		() => {
			textareaReadOnly.value = false;
			nextTick(() => focus());
		},
	);
}

onMounted(async () => {
	if (textareaEl.value != null) {
		autocompleteInstance = new Autocomplete(textareaEl.value, text);
	}

	// 書きかけの投稿を復元
	const draft = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}')[getDraftKey()];
	if (draft) {
		text.value = draft.data.text;
		file.value = draft.data.file;
	}

});

onBeforeUnmount(() => {
	if (autocompleteInstance) {
		autocompleteInstance.detach();
		autocompleteInstance = null;
	}
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	border-bottom: none;
	border-radius: 12px 12px 0 0;
	overflow: clip;
}

.replyBar {
	display: flex;
	align-items: stretch;
	gap: 0;
	padding: 0;
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panel));
	border-bottom: 1px solid var(--MI_THEME-divider);
	min-height: 40px;
}

.replyBarAccent {
	width: 3px;
	flex-shrink: 0;
	background: var(--MI_THEME-accent);
}

.replyBarBody {
	flex: 1;
	min-width: 0;
	padding: 6px 10px;
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 2px;
}

.replyBarHead {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 0.35em;
	font-weight: 700;
	font-size: 0.85em;
	color: var(--MI_THEME-accent);
	line-height: 1.25;
}

.replyBarName {
	font-weight: 600;
	opacity: 0.95;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
}

.replyBarText {
	overflow: hidden;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 1;
	line-clamp: 1;
	white-space: normal;
	font-size: 0.88em;
	line-height: 1.3;
	opacity: 0.9;
	word-break: break-word;
}

.replyBarClose {
	padding: 6px 10px;
	font-size: 1em;
	align-self: center;
}

.stickerPanel {
	padding: 8px;
	border-bottom: 1px solid var(--MI_THEME-divider);
}

.active {
	color: var(--MI_THEME-accent);
}

.disabled {
	opacity: 0.95;
}

.mutedBanner {
	padding: 10px 14px;
	font-size: 90%;
	line-height: 1.4;
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-infoWarnBg, #fff8e6);
	border-bottom: 1px solid var(--MI_THEME-divider);
	display: flex;
	align-items: flex-start;
	gap: 10px;

	i {
		flex-shrink: 0;
		margin-top: 2px;
		color: var(--MI_THEME-warn, #df9522);
		font-size: 1.15em;
	}
}

.mutedBannerText {
	min-width: 0;
	flex: 1;
	color: var(--MI_THEME-fg);
}

.mutedBannerTitle {
	font-weight: 700;
	margin-bottom: 2px;
}

.mutedBannerBody {
	opacity: 0.9;
	word-break: break-word;
}

.btnLabel {
	display: none;
	font-size: 11px;
	line-height: 1;
	max-width: 4.5em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* show text under icons when muted so the bar is not icon-only */
.disabled .button {
	flex-direction: column;
	gap: 1px;
	height: auto;
	min-height: 40px;
	padding: 4px 2px;
}

.disabled .btnLabel {
	display: block;
	opacity: 0.85;
}

.textarea {
	cursor: auto;
	display: block;
	width: 100%;
	min-width: 100%;
	max-width: 100%;
	min-height: 36px;
	max-height: 120px;
	margin: 0;
	padding: 8px 12px 4px 12px;
	resize: none;
	font-size: 0.95em;
	font-family: inherit;
	outline: none;
	border: none;
	border-radius: 0;
	box-shadow: none;
	box-sizing: border-box;
	color: var(--MI_THEME-fg);
	field-sizing: content;
	overflow-y: auto;
}

.footer {
	position: sticky;
	bottom: 0;
	background: var(--MI_THEME-panel);
}

.file {
	padding: 4px 8px;
	cursor: pointer;
	font-size: 85%;
}

.buttons {
	display: flex;
	align-items: center;
	min-height: 40px;
}

.button {
	height: 40px;
	width: 40px;
	aspect-ratio: 1;
	font-size: 1.05em;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}
.send {
	margin-left: auto;
	color: var(--MI_THEME-accent);
	min-width: 40px;

	&:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	&.sending {
		cursor: wait;
		opacity: 0.9;
	}
}

.sendIconWrap {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.25em;
	height: 1.25em;
}

.sendSpinner {
	display: inline-block;
	width: 1em;
	height: 1em;
	border: 2px solid color-mix(in srgb, var(--MI_THEME-accent) 28%, transparent);
	border-top-color: var(--MI_THEME-accent);
	border-radius: 50%;
	animation: chatSendSpin 0.7s linear infinite;
}

@keyframes chatSendSpin {
	to { transform: rotate(360deg); }
}

.fileDisabled {
	opacity: 0.55;
	pointer-events: none;
}
</style>
