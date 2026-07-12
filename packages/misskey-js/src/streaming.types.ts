import type {
	Antenna,
	ChatMessage,
	ChatMessageLite,
	DriveFile,
	DriveFolder,
	Note,
	Notification,
	Signin,
	User,
	UserDetailed,
	UserDetailedNotMe,
	UserLite,
} from './autogen/models.js';
import type {
	AnnouncementCreated,
	EmojiAdded, EmojiDeleted,
	EmojiUpdated,
	PageEvent,
	QueueLogs,
	ServerStats,
	ServerStatsLog,
	ReversiGameDetailed,
} from './entities.js';
import type {
	ReversiUpdateKey,
} from './consts.js';

type ReversiUpdateSettings<K extends ReversiUpdateKey> = {
	key: K;
	value: ReversiGameDetailed[K];
};

export type Channels = {
	main: {
		params: null;
		events: {
			notification: (payload: Notification) => void;
			mention: (payload: Note) => void;
			reply: (payload: Note) => void;
			renote: (payload: Note) => void;
			follow: (payload: UserDetailedNotMe) => void; // 自分が他人をフォローしたとき
			followed: (payload: UserDetailed | UserLite) => void; // 他人が自分をフォローしたとき
			unfollow: (payload: UserDetailed) => void; // 自分が他人をフォロー解除したとき
			meUpdated: (payload: UserDetailed) => void;
			pageEvent: (payload: PageEvent) => void;
			urlUploadFinished: (payload: { marker: string; file: DriveFile; }) => void;
			readAllNotifications: () => void;
			unreadNotification: (payload: Notification) => void;
			notificationFlushed: () => void;
			unreadAntenna: (payload: Antenna) => void;
			newChatMessage: (payload: ChatMessage) => void;
			readAllAnnouncements: () => void;
			myTokenRegenerated: () => void;
			signin: (payload: Signin) => void;
			registryUpdated: (payload: {
				scope?: string[];
				key: string;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				value: any | null;
			}) => void;
			driveFileCreated: (payload: DriveFile) => void;
			readAntenna: (payload: Antenna) => void;
			receiveFollowRequest: (payload: User) => void;
			announcementCreated: (payload: AnnouncementCreated) => void;
			edited: (payload: Note) => void;
			/** Response to requestNotifications over main WS */
			notifications: (payload: {
				reqId?: string | null;
				notifications: Notification[];
				hasMore: boolean;
			}) => void;
			notificationsError: (payload: {
				code?: string;
				message?: string;
				reqId?: string | null;
			}) => void;
		};
		receives: {
			/** Load / catch-up notifications without REST */
			notifications: {
				limit?: number;
				untilId?: string;
				sinceId?: string;
				reqId?: string;
			};
			requestNotifications: {
				limit?: number;
				untilId?: string;
				sinceId?: string;
				reqId?: string;
			};
		};
	};
	homeTimeline: {
		params: {
			withRenotes?: boolean;
			withFiles?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	localTimeline: {
		params: {
			withRenotes?: boolean;
			withReplies?: boolean;
			withFiles?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	hybridTimeline: {
		params: {
			withRenotes?: boolean;
			withReplies?: boolean;
			withFiles?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	globalTimeline: {
		params: {
			withRenotes?: boolean;
			withFiles?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	bubbleTimeline: {
		params: {
			withRenotes?: boolean;
			withFiles?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	userList: {
		params: {
			listId: string;
			withFiles?: boolean;
			withRenotes?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	hashtag: {
		params: {
			q: string[][];
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	roleTimeline: {
		params: {
			roleId: string;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	antenna: {
		params: {
			antennaId: string;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	channel: {
		params: {
			channelId: string;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	drive: {
		params: null;
		events: {
			fileCreated: (payload: DriveFile) => void;
			fileDeleted: (payload: DriveFile['id']) => void;
			fileUpdated: (payload: DriveFile) => void;
			folderCreated: (payload: DriveFolder) => void;
			folderDeleted: (payload: DriveFolder['id']) => void;
			folderUpdated: (payload: DriveFolder) => void;
		};
		receives: null;
	};
	serverStats: {
		params: null;
		events: {
			stats: (payload: ServerStats) => void;
			statsLog: (payload: ServerStatsLog) => void;
		};
		receives: {
			requestLog: {
				length?: number;
			};
		};
	};
	queueStats: {
		params: null;
		events: {
			stats: (payload: QueueLogs) => void;
			statsLog: (payload: QueueLogs[]) => void;
		};
		receives: {
			requestLog: {
				length?: number;
			};
		};
	};
	admin: {
		params: null;
		events: {
			newAbuseUserReport: {
				id: string;
				targetUserId: string;
				reporterId: string;
				comment: string;
			}
		};
		receives: null;
	};
	reversiGame: {
		params: {
			gameId: string;
		};
		events: {
			started: (payload: { game: ReversiGameDetailed; }) => void;
			ended: (payload: { winnerId: User['id'] | null; game: ReversiGameDetailed; }) => void;
			canceled: (payload: { userId: User['id']; }) => void;
			changeReadyStates: (payload: { user1: boolean; user2: boolean; }) => void;
			updateSettings: <K extends ReversiUpdateKey>(payload: { userId: User['id']; key: K; value: ReversiGameDetailed[K]; }) => void;
			log: (payload: Record<string, unknown>) => void;
		};
		receives: {
			putStone: {
				pos: number;
				id: string;
			};
			ready: boolean;
			cancel: null | Record<string, never>;
			updateSettings: ReversiUpdateSettings<ReversiUpdateKey>;
			claimTimeIsUp: null | Record<string, never>;
		}
	};
	chatUser: {
		params: {
			otherId: string;
		};
		events: {
			message: (payload: ChatMessageLite) => void;
			deleted: (payload: ChatMessageLite['id']) => void;
			msgAck: (payload: { ok: boolean }) => void;
			msgError: (payload: { code?: string; message?: string }) => void;
			history: (payload: {
				reqId?: string | null;
				messages: ChatMessageLite[];
				hasMore: boolean;
				untilId?: string | null;
			}) => void;
			historyError: (payload: { code?: string; message?: string; reqId?: string | null }) => void;
			react: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
			unreact: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
		};
		receives: {
			read: {
				id: ChatMessageLite['id'];
			};
			msg: {
				text?: string | null;
				fileId?: string | null;
				replyId?: string | null;
				isE2ee?: boolean;
				ciphertext?: string | null;
			};
			react: {
				messageId: ChatMessageLite['id'];
				reaction: string;
			};
			unreact: {
				messageId: ChatMessageLite['id'];
				reaction: string;
			};
			delete: {
				messageId: ChatMessageLite['id'];
			};
			history: {
				limit?: number;
				untilId?: string | null;
				sinceId?: string | null;
				reqId?: string;
			};
		};
	};
	chatRoom: {
		params: {
			roomId: string;
		};
		events: {
			message: (payload: ChatMessageLite) => void;
			deleted: (payload: ChatMessageLite['id']) => void;
			cleared: (payload: { roomId: string }) => void;
			msgAck: (payload: { ok: boolean }) => void;
			msgError: (payload: { code?: string; message?: string }) => void;
			clearAck: (payload: { ok: boolean; deleted?: number }) => void;
			history: (payload: {
				reqId?: string | null;
				messages: ChatMessageLite[];
				hasMore: boolean;
				untilId?: string | null;
			}) => void;
			historyError: (payload: { code?: string; message?: string; reqId?: string | null }) => void;
			room: (payload: { reqId?: string | null; room: Record<string, unknown> }) => void;
			roomError: (payload: { code?: string; message?: string; reqId?: string | null }) => void;
			members: (payload: { reqId?: string | null; memberships: unknown[] }) => void;
			membersError: (payload: { code?: string; message?: string; reqId?: string | null }) => void;
			memberMuted: (payload: { userId: string; mutedUntil: string | null; byUserId: string }) => void;
			memberKicked: (payload: { userId: string; byUserId: string }) => void;
			memberBanned: (payload: { userId: string; byUserId: string }) => void;
			memberUnbanned: (payload: { userId: string; byUserId: string }) => void;
			react: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
			unreact: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
		};
		receives: {
			read: {
				id: ChatMessageLite['id'];
			};
			msg: {
				text?: string | null;
				fileId?: string | null;
				replyId?: string | null;
			};
			react: {
				messageId: ChatMessageLite['id'];
				reaction: string;
			};
			unreact: {
				messageId: ChatMessageLite['id'];
				reaction: string;
			};
			delete: {
				messageId: ChatMessageLite['id'];
			};
			clearMessages: Record<string, never>;
			history: {
				limit?: number;
				untilId?: string | null;
				sinceId?: string | null;
				reqId?: string;
			};
			roomShow: {
				reqId?: string;
			};
			members: {
				limit?: number;
				reqId?: string;
			};
		};
	};
};

export type NoteUpdatedEvent = { id: Note['id'] } & ({
	type: 'reacted';
	body: {
		reaction: string;
		emoji?: {
			name: string;
			url: string;
		} | null;
		userId: User['id'];
	};
} | {
	type: 'unreacted';
	body: {
		reaction: string;
		userId: User['id'];
	};
} | {
	type: 'updated';
	body: {
		/** Full packed note when available (avoids notes/show stampede) */
		note?: Note;
	};
} | {
	type: 'deleted';
	body: {
		deletedAt: string;
	};
} | {
	type: 'pollVoted';
	body: {
		choice: number;
		userId: User['id'];
	};
} | {
	type: 'replied';
	body: {
		id: Note['id'];
		userId: User['id'];
		/** Full packed reply note when available */
		note?: Note;
	};
});

export type BroadcastEvents = {
	noteUpdated: (payload: NoteUpdatedEvent) => void;
	emojiAdded: (payload: EmojiAdded) => void;
	emojiUpdated: (payload: EmojiUpdated) => void;
	emojiDeleted: (payload: EmojiDeleted) => void;
	announcementCreated: (payload: AnnouncementCreated) => void;
};
