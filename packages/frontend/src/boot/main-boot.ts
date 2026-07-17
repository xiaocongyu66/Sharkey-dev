/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createApp, defineAsyncComponent, markRaw } from 'vue';
import { ui } from '@@/js/config.js';
import * as Misskey from 'misskey-js';
import { compareVersions } from 'compare-versions';
import { common } from './common.js';
import type { Component } from 'vue';
import type { Keymap } from '@/utility/hotkey.js';
import { i18n } from '@/i18n.js';
import { alert, confirm, popup, post } from '@/os.js';
import { useStream } from '@/stream.js';
import * as sound from '@/utility/sound.js';
import { $i } from '@/i.js';
import { instance } from '@/instance.js';
import { store } from '@/store.js';
import { reactionPicker } from '@/utility/reaction-picker.js';
import { miLocalStorage } from '@/local-storage.js';
import { claimAchievement, claimedAchievements } from '@/utility/achievements.js';
import { initializeSw } from '@/utility/initialize-sw.js';
import { deckStore } from '@/ui/deck/deck-store.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import { mainRouter } from '@/router.js';
import { setFavIconDot } from '@/utility/favicon-dot.js';
import { makeHotkey } from '@/utility/hotkey.js';
import { addCustomEmoji, removeCustomEmojis, updateCustomEmojis } from '@/custom-emojis.js';
import { prefer } from '@/preferences.js';
import { launchPlugins } from '@/plugin.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import { signout } from '@/signout.js';
import { migrateOldSettings } from '@/pref-migrate.js';

export async function mainBoot() {
	const { isClientUpdated, lastVersion } = await common(async () => {
		let uiStyle = ui;
		const searchParams = new URLSearchParams(window.location.search);

		if (!$i) uiStyle = 'visitor';

		if (searchParams.has('zen')) uiStyle = 'zen';
		if (uiStyle === 'deck' && prefer.s['deck.useSimpleUiForNonRootPages'] && window.location.pathname !== '/') uiStyle = 'zen';

		if (searchParams.has('ui')) uiStyle = searchParams.get('ui');

		let rootComponent: Component;
		switch (uiStyle) {
			case 'zen':
				rootComponent = await import('@/ui/zen.vue').then(x => x.default);
				break;
			case 'deck':
				rootComponent = await import('@/ui/deck.vue').then(x => x.default);
				break;
			case 'visitor':
				rootComponent = await import('@/ui/visitor.vue').then(x => x.default);
				break;
			default:
				rootComponent = await import('@/ui/universal.vue').then(x => x.default);
				break;
		}

		return createApp(rootComponent);
	});

	reactionPicker.init();
	emojiPicker.init();

	if (isClientUpdated && $i) {
		const { dispose } = popup(defineAsyncComponent(() => import('@/components/MkUpdated.vue')), {}, {
			closed: () => dispose(),
		});

		// prefereces migration
		// TODO: そのうち消す
		if (lastVersion && (compareVersions('2025.3.2-alpha.0', lastVersion) === 1)) {
			console.log('Preferences migration');

			migrateOldSettings();
		}
	}

	const stream = useStream();

	let reloadDialogShowing = false;
	stream.on('_disconnected_', async () => {
		if (prefer.s.serverDisconnectedBehavior === 'dialog') {
			if (reloadDialogShowing) return;
			reloadDialogShowing = true;
			const { canceled } = await confirm({
				type: 'warning',
				title: i18n.ts.disconnectedFromServer,
				text: i18n.ts.reloadConfirm,
			});
			reloadDialogShowing = false;
			if (!canceled) {
				window.location.reload();
			}
		}
	});

	stream.on('emojiAdded', emojiData => {
		addCustomEmoji(emojiData.emoji);
	});

	stream.on('emojiUpdated', emojiData => {
		updateCustomEmojis(emojiData.emojis);
	});

	stream.on('emojiDeleted', emojiData => {
		removeCustomEmojis(emojiData.emojis);
	});

	// Profile display updates (avatar / name / signature) — patch in-memory without REST
	const onUserDisplayUpdated = (body: any) => {
		import('@/utility/live-user-cache.js').then(({ applyUserUpdated }) => {
			applyUserUpdated(body);
		}).catch(() => { /* ignore */ });
	};
	stream.on('userUpdated', onUserDisplayUpdated);
	// Avatar-only WS events must also update live cache (otherwise timeline avatars stay stale).
	stream.on('userAvatarUpdated', onUserDisplayUpdated);

	launchPlugins();

	try {
		if (prefer.s.enableSeasonalScreenEffect) {
			const month = new Date().getMonth() + 1;
			if (prefer.s.hemisphere === 'S') {
				// ▼南半球
				if (month === 7 || month === 8) {
					const SnowfallEffect = (await import('@/utility/snowfall-effect.js')).SnowfallEffect;
					new SnowfallEffect({}).render();
				}
			} else {
				// ▼北半球
				if (month === 12 || month === 1) {
					const SnowfallEffect = (await import('@/utility/snowfall-effect.js')).SnowfallEffect;
					new SnowfallEffect({}).render();
				} else if (month === 3 || month === 4) {
					const SakuraEffect = (await import('@/utility/snowfall-effect.js')).SnowfallEffect;
					new SakuraEffect({
						sakura: true,
					}).render();
				}
			}
		}
	} catch (error) {
		// console.error(error);
		console.error('Failed to initialise the seasonal screen effect canvas context:', error);
	}

	if ($i) {
		store.loaded.then(async () => {
			if (store.s.accountSetupWizard !== -1) {
				const { dispose } = popup(defineAsyncComponent(() => import('@/components/MkUserSetupDialog.vue')), {}, {
					closed: () => dispose(),
				});
			}
		});

		for (const announcement of ($i.unreadAnnouncements ?? []).filter(x => x.display === 'dialog')) {
			const { dispose } = popup(defineAsyncComponent(() => import('@/components/MkAnnouncementDialog.vue')), {
				announcement,
			}, {
				closed: () => dispose(),
			});
		}

		function onAnnouncementCreated(ev: { announcement: Misskey.entities.Announcement }) {
			const announcement = ev.announcement;
			if (announcement.display === 'dialog') {
				const { dispose } = popup(defineAsyncComponent(() => import('@/components/MkAnnouncementDialog.vue')), {
					announcement,
				}, {
					closed: () => dispose(),
				});
			}
		}

		stream.on('announcementCreated', onAnnouncementCreated);

		if ($i.isDeleted) {
			alert({
				type: 'warning',
				text: i18n.ts.accountDeletionInProgress,
			});
		}

		const now = new Date();
		const m = now.getMonth() + 1;
		const d = now.getDate();

		if ($i.birthday) {
			const bm = parseInt($i.birthday.split('-')[1]);
			const bd = parseInt($i.birthday.split('-')[2]);
			if (m === bm && d === bd) {
				claimAchievement('loggedInOnBirthday');
			}
		}

		if (m === 1 && d === 1) {
			claimAchievement('loggedInOnNewYearsDay');
		}

		if ($i.loggedInDays >= 3) claimAchievement('login3');
		if ($i.loggedInDays >= 7) claimAchievement('login7');
		if ($i.loggedInDays >= 15) claimAchievement('login15');
		if ($i.loggedInDays >= 30) claimAchievement('login30');
		if ($i.loggedInDays >= 60) claimAchievement('login60');
		if ($i.loggedInDays >= 100) claimAchievement('login100');
		if ($i.loggedInDays >= 200) claimAchievement('login200');
		if ($i.loggedInDays >= 300) claimAchievement('login300');
		if ($i.loggedInDays >= 400) claimAchievement('login400');
		if ($i.loggedInDays >= 500) claimAchievement('login500');
		if ($i.loggedInDays >= 600) claimAchievement('login600');
		if ($i.loggedInDays >= 700) claimAchievement('login700');
		if ($i.loggedInDays >= 800) claimAchievement('login800');
		if ($i.loggedInDays >= 900) claimAchievement('login900');
		if ($i.loggedInDays >= 1000) claimAchievement('login1000');

		if ($i.notesCount > 0) claimAchievement('notes1');
		if ($i.notesCount >= 10) claimAchievement('notes10');
		if ($i.notesCount >= 100) claimAchievement('notes100');
		if ($i.notesCount >= 500) claimAchievement('notes500');
		if ($i.notesCount >= 1000) claimAchievement('notes1000');
		if ($i.notesCount >= 5000) claimAchievement('notes5000');
		if ($i.notesCount >= 10000) claimAchievement('notes10000');
		if ($i.notesCount >= 20000) claimAchievement('notes20000');
		if ($i.notesCount >= 30000) claimAchievement('notes30000');
		if ($i.notesCount >= 40000) claimAchievement('notes40000');
		if ($i.notesCount >= 50000) claimAchievement('notes50000');
		if ($i.notesCount >= 60000) claimAchievement('notes60000');
		if ($i.notesCount >= 70000) claimAchievement('notes70000');
		if ($i.notesCount >= 80000) claimAchievement('notes80000');
		if ($i.notesCount >= 90000) claimAchievement('notes90000');
		if ($i.notesCount >= 100000) claimAchievement('notes100000');

		if ($i.followersCount > 0) claimAchievement('followers1');
		if ($i.followersCount >= 10) claimAchievement('followers10');
		if ($i.followersCount >= 50) claimAchievement('followers50');
		if ($i.followersCount >= 100) claimAchievement('followers100');
		if ($i.followersCount >= 300) claimAchievement('followers300');
		if ($i.followersCount >= 500) claimAchievement('followers500');
		if ($i.followersCount >= 1000) claimAchievement('followers1000');

		const createdAt = new Date($i.createdAt);
		const createdAtThreeYearsLater = new Date($i.createdAt);
		createdAtThreeYearsLater.setFullYear(createdAtThreeYearsLater.getFullYear() + 3);
		if (now >= createdAtThreeYearsLater) {
			claimAchievement('passedSinceAccountCreated3');
			claimAchievement('passedSinceAccountCreated2');
			claimAchievement('passedSinceAccountCreated1');
		} else {
			const createdAtTwoYearsLater = new Date($i.createdAt);
			createdAtTwoYearsLater.setFullYear(createdAtTwoYearsLater.getFullYear() + 2);
			if (now >= createdAtTwoYearsLater) {
				claimAchievement('passedSinceAccountCreated2');
				claimAchievement('passedSinceAccountCreated1');
			} else {
				const createdAtOneYearLater = new Date($i.createdAt);
				createdAtOneYearLater.setFullYear(createdAtOneYearLater.getFullYear() + 1);
				if (now >= createdAtOneYearLater) {
					claimAchievement('passedSinceAccountCreated1');
				}
			}
		}

		if (claimedAchievements.length >= 30) {
			claimAchievement('collectAchievements30');
		}

		if (!claimedAchievements.includes('justPlainLucky')) {
			let justPlainLuckyTimer: number | null = null;
			let lastVisibilityChangedAt = Date.now();

			function claimPlainLucky() {
				if (window.document.visibilityState !== 'visible') {
					if (justPlainLuckyTimer != null) window.clearTimeout(justPlainLuckyTimer);
					return;
				}

				if (Math.floor(Math.random() * 20000) === 0) {
					claimAchievement('justPlainLucky');
				} else {
					justPlainLuckyTimer = window.setTimeout(claimPlainLucky, 1000 * 10);
				}
			}

			window.addEventListener('visibilitychange', () => {
				const now = Date.now();

				if (window.document.visibilityState === 'visible') {
					// タブを高速で切り替えたら取得処理が何度も走るのを防ぐ
					if ((now - lastVisibilityChangedAt) < 1000 * 10) {
						justPlainLuckyTimer = window.setTimeout(claimPlainLucky, 1000 * 10);
					} else {
						claimPlainLucky();
					}
				} else if (justPlainLuckyTimer != null) {
					window.clearTimeout(justPlainLuckyTimer);
					justPlainLuckyTimer = null;
				}

				lastVisibilityChangedAt = now;
			}, { passive: true });

			claimPlainLucky();
		}

		if (!claimedAchievements.includes('client30min')) {
			window.setTimeout(() => {
				claimAchievement('client30min');
			}, 1000 * 60 * 30);
		}

		if (!claimedAchievements.includes('client60min')) {
			window.setTimeout(() => {
				claimAchievement('client60min');
			}, 1000 * 60 * 60);
		}

		// 邪魔
		//const lastUsed = miLocalStorage.getItem('lastUsed');
		//if (lastUsed) {
		//	const lastUsedDate = parseInt(lastUsed, 10);
		//	// 二時間以上前なら
		//	if (Date.now() - lastUsedDate > 1000 * 60 * 60 * 2) {
		//		toast(i18n.tsx.welcomeBackWithName({
		//			name: $i.name || $i.username,
		//		}), true);
		//	}
		//}
		//miLocalStorage.setItem('lastUsed', Date.now().toString());

		const latestDonationInfoShownAt = miLocalStorage.getItem('latestDonationInfoShownAt');
		const neverShowDonationInfo = miLocalStorage.getItem('neverShowDonationInfo');
		if (neverShowDonationInfo !== 'true' && (createdAt.getTime() < (Date.now() - (1000 * 60 * 60 * 24 * 3))) && !window.location.pathname.startsWith('/miauth')) {
			if (latestDonationInfoShownAt == null || (new Date(latestDonationInfoShownAt).getTime() < (Date.now() - (1000 * 60 * 60 * 24 * 30)))) {
				const { dispose } = popup(defineAsyncComponent(() => import('@/components/MkDonation.vue')), {}, {
					closed: () => dispose(),
				});
			}
		}

		const modifiedVersionMustProminentlyOfferInAgplV3Section13Read = miLocalStorage.getItem('modifiedVersionMustProminentlyOfferInAgplV3Section13Read');
		if (modifiedVersionMustProminentlyOfferInAgplV3Section13Read !== 'true' && instance.repositoryUrl !== 'https://activitypub.software/TransFem-org/Sharkey/') {
			const { dispose } = popup(defineAsyncComponent(() => import('@/components/MkSourceCodeAvailablePopup.vue')), {}, {
				closed: () => dispose(),
			});
		}

		if ('Notification' in window) {
			// 許可を得ていなかったらリクエスト
			if (Notification.permission === 'default') {
				Notification.requestPermission();
			}
		}

		function attemptShowNotificationDot() {
			if (prefer.s.enableFaviconNotificationDot) {
				setFavIconDot(true);
			}
		}

		if ($i.hasUnreadNotification) attemptShowNotificationDot();

		const main = markRaw(stream.useChannel('main', null, 'System'));

		// 自分の情報が更新されたとき
		main.on('meUpdated', i => {
			updateCurrentAccountPartial(i);
		});

		main.on('readAllNotifications', () => {
			setFavIconDot(false);

			updateCurrentAccountPartial({
				hasUnreadNotification: false,
				unreadNotificationsCount: 0,
			});
		});

		main.on('unreadNotification', () => {
			attemptShowNotificationDot();

			const unreadNotificationsCount = ($i?.unreadNotificationsCount ?? 0) + 1;
			updateCurrentAccountPartial({
				hasUnreadNotification: true,
				unreadNotificationsCount,
			});
		});

		main.on('unreadAntenna', () => {
			updateCurrentAccountPartial({ hasUnreadAntenna: true });
			sound.playMisskeySfx('antenna');
		});

		main.on('newChatMessage', () => {
			updateCurrentAccountPartial({ hasUnreadChatMessages: true });
			sound.playMisskeySfx('chatMessage');
		});

		main.on('readAllAnnouncements', () => {
			updateCurrentAccountPartial({ hasUnreadAnnouncement: false });
		});

		// Avatar / profile on own account (other devices / pack refresh)
		const onOwnProfilePatch = (body: any) => {
			const u = body?.user;
			if (!u?.id || !$i || u.id !== $i.id) return;
			const updatedAt = body?.updatedAt ? String(body.updatedAt) : String(Date.now());
			const base = u.avatarUrl ? String(u.avatarUrl).split('?')[0] : $i.avatarUrl;
			updateCurrentAccountPartial({
				...u,
				avatarUrl: base ? `${base}?t=${encodeURIComponent(updatedAt)}` : $i.avatarUrl,
			});
			import('@/utility/live-user-cache.js').then(({ applyUserUpdated }) => {
				applyUserUpdated(body);
			}).catch(() => { /* ignore */ });
		};
		main.on('userAvatarUpdated', onOwnProfilePatch);
		main.on('userUpdated', onOwnProfilePatch);

		// Gallery / Play / Page / Clip created — refresh open list UIs (other tabs too)
		main.on('contentCreated', (body: any) => {
			if (!body?.kind || !body?.id) return;
			import('@/events.js').then(({ globalEvents }) => {
				globalEvents.emit('contentCreated', {
					kind: body.kind,
					id: String(body.id),
					item: body.item,
				});
			}).catch(() => { /* ignore */ });
		});

		// 個人宛てお知らせが発行されたとき
		main.on('announcementCreated', onAnnouncementCreated);

		// トークンが再生成されたとき
		// このままではMisskeyが利用できないので強制的にサインアウトさせる
		main.on('myTokenRegenerated', () => {
			signout();
		});

		// After reconnect / tab wake: catch up notifications over WS so @mentions
		// and other alerts show as unread even if the tab was backgrounded.
		const stream = useStream();
		let notifCatchUpBusy = false;
		const catchUpNotifications = async () => {
			if (notifCatchUpBusy || !$i) return;
			notifCatchUpBusy = true;
			try {
				const { streamRequest } = await import('@/pages/chat/chat-ws.js');
				const res = await streamRequest<{
					notifications?: Misskey.entities.Notification[];
					hasMore?: boolean;
				}>(
					main as any,
					'notifications',
					{ limit: 30 },
					'notifications',
					'notificationsError',
					'i/notifications',
					// Do not mark as read on catch-up
					{ limit: 30, markAsRead: false },
					8000,
				);
				const list = Array.isArray(res)
					? res
					: (res as any)?.notifications;
				if (Array.isArray(list) && list.length > 0) {
					const unread = list.filter((n: any) => n && n.isRead !== true);
					if (unread.length > 0) {
						attemptShowNotificationDot();
						updateCurrentAccountPartial({
							hasUnreadNotification: true,
							unreadNotificationsCount: Math.max(
								$i.unreadNotificationsCount ?? 0,
								unread.length,
							),
						});
					}
					// Notify in-app listeners (notification page uses its own channel;
					// clientNotification reaches status bar / toast handlers)
					const { globalEvents } = await import('@/events.js');
					for (const n of unread.slice(0, 5).reverse()) {
						globalEvents.emit('clientNotification', n);
					}
				}
			} catch {
				// ignore
			} finally {
				notifCatchUpBusy = false;
			}
		};

		stream.on('_connected_', () => {
			void catchUpNotifications();
		});
		window.document.addEventListener('visibilitychange', () => {
			if (window.document.visibilityState === 'visible') {
				void catchUpNotifications();
			}
		});
	}

	// shortcut
	const keymap = {
		'p|n': () => {
			if ($i == null) return;
			post();
		},
		'd': () => {
			store.set('darkMode', !store.s.darkMode);
		},
		's': () => {
			mainRouter.push('/search');
		},
	} as const satisfies Keymap;
	window.document.addEventListener('keydown', makeHotkey(keymap), { passive: false });

	initializeSw();
}
