/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'eventemitter3';
import * as Misskey from 'misskey-js';

export const globalEvents = new EventEmitter<{
	themeChanging: () => void;
	themeChanged: () => void;
	clientNotification: (notification: Misskey.entities.Notification) => void;
	/** WS-driven profile patch (avatar / name / description / …) */
	userUpdated: (payload: {
		user: Misskey.entities.UserLite | Misskey.entities.User;
		updatedAt: string;
	}) => void;
	/**
	 * Extended content created (gallery / play / page / clip).
	 * Fired from main WS and from the creating tab after a successful create.
	 */
	contentCreated: (payload: {
		kind: 'galleryPost' | 'flash' | 'page' | 'clip';
		id: string;
		item?: Record<string, unknown>;
	}) => void;
}>();
