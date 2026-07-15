#!/usr/bin/env node
/**
 * Local HTTP JSON gateway compatible with Sharkey XAlgorithmService.
 * "For You"-style ranking inspired by X/Twitter open-sourced Home Mixer ideas:
 * - In-network (following) + out-of-network candidate mix
 * - Engagement × recency × author diversity
 * - Mild negative feedback for pure renotes / reply spam
 * - Optional soft-rank by author activity (bot dampening)
 *
 * Env:
 *   PORT=8787
 *   PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=sharkey_dev PGUSER=sharkey PGPASSWORD=...
 *   API_KEY=optional
 *   RANK_POOL_MULT=6   (candidate pool = limit * mult, capped)
 *   OON_RATIO=0.35     (max fraction out-of-network on home when both mixes on)
 */
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pg;
try {
	pg = require('pg');
} catch {
	pg = require('/root/Sharkey-work/Sharkey-local-pg18/node_modules/.pnpm/pg@8.16.3/node_modules/pg');
}

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.API_KEY || '';
const RANK_POOL_MULT = Math.max(3, Number(process.env.RANK_POOL_MULT) || 6);
const OON_RATIO = Math.min(0.6, Math.max(0.1, Number(process.env.OON_RATIO) || 0.35));

const pool = new pg.Pool({
	host: process.env.PGHOST || '127.0.0.1',
	port: Number(process.env.PGPORT || 5432),
	database: process.env.PGDATABASE || 'sharkey_dev',
	user: process.env.PGUSER || 'sharkey',
	password: process.env.PGPASSWORD || 'example-misskey-pass',
	max: 6,
});

/** SK-2026-095: cap body size (default bind is 127.0.0.1; still defend mis-bind) */
const MAX_BODY_BYTES = 64 * 1024;

function parseBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let total = 0;
		const cl = req.headers['content-length'];
		if (cl != null && Number(cl) > MAX_BODY_BYTES) {
			reject(Object.assign(new Error('payload too large'), { statusCode: 413 }));
			return;
		}
		req.on('data', (c) => {
			total += c.length;
			if (total > MAX_BODY_BYTES) {
				reject(Object.assign(new Error('payload too large'), { statusCode: 413 }));
				req.destroy();
				return;
			}
			chunks.push(c);
		});
		req.on('end', () => {
			try {
				const raw = Buffer.concat(chunks).toString('utf8') || '{}';
				resolve(JSON.parse(raw));
			} catch (e) {
				reject(e);
			}
		});
		req.on('error', reject);
	});
}

/**
 * Approximate snowflake/aidx time from id head (ms). Best-effort for recency.
 */
function idTimeMs(id) {
	if (!id || typeof id !== 'string') return 0;
	// Misskey aid: first 8 chars base36 of timestamp
	const head = id.slice(0, 8);
	const n = Number.parseInt(head, 36);
	if (Number.isFinite(n) && n > 1e11 && n < 2e13) return n;
	// Fallback: use full string lexicographic as weak order only
	return 0;
}

function reactionSum(reactions) {
	if (!reactions || typeof reactions !== 'object') return 0;
	return Object.values(reactions).reduce((s, v) => s + (Number(v) || 0), 0);
}

async function rankNotes(body) {
	const userId = body.userId;
	if (!userId) throw new Error('userId required');

	const limit = Math.min(Number(body.limit) || 100, 200);
	const source = body.source === 'hybrid' ? 'hybrid' : 'home';
	const filters = body.filters || {};
	const pipeline = body.pipeline || {};
	const includeIn = pipeline.includeInNetwork !== false;
	const includeOut = pipeline.includeOutOfNetwork !== false;
	const untilId = body.untilId || null;
	const sinceId = body.sinceId || null;

	const following = await pool.query(
		`SELECT "followeeId" FROM following WHERE "followerId" = $1`,
		[userId],
	);
	const followeeIds = following.rows.map((r) => r.followeeId);
	const network = new Set(followeeIds);
	network.add(userId);

	const params = [];
	const where = [
		`n.visibility IN ('public', 'home')`,
		`(n."isHidden" = false OR n."isHidden" IS NULL)`,
		`n."userHost" IS NULL`,
	];

	if (filters.withFiles) where.push(`n."fileIds" <> '{}'`);
	if (filters.withRenotes === false) {
		where.push(`NOT (n."renoteId" IS NOT NULL AND (n.text IS NULL OR n.text = '') AND (n."fileIds" IS NULL OR n."fileIds" = '{}'))`);
	}
	if (filters.withReplies === false) where.push(`n."replyId" IS NULL`);
	if (filters.withBots === false) where.push(`(u."isBot" IS NULL OR u."isBot" = false)`);

	if (untilId) {
		params.push(untilId);
		where.push(`n.id < $${params.length}`);
	}
	if (sinceId) {
		params.push(sinceId);
		where.push(`n.id > $${params.length}`);
	}

	// Home in-network only: constrain at SQL for smaller pool
	if (source === 'home' && includeIn && !includeOut) {
		params.push(Array.from(network));
		where.push(`n."userId" = ANY($${params.length})`);
	}

	const poolSize = Math.min(Math.max(limit * RANK_POOL_MULT, 120), 600);

	const sql = `
		SELECT n.id, n."userId", n."replyId", n."renoteId", n.text,
			COALESCE(n."repliesCount", 0)::int AS replies,
			COALESCE(n."renoteCount", 0)::int AS renotes,
			COALESCE(n.reactions, '{}'::jsonb) AS reactions,
			COALESCE(u."isBot", false) AS "isBot",
			COALESCE(u."followersCount", 0)::int AS "followersCount"
		FROM note n
		LEFT JOIN "user" u ON u.id = n."userId"
		WHERE ${where.join(' AND ')}
		ORDER BY n.id DESC
		LIMIT ${poolSize}
	`;

	const { rows } = await pool.query(sql, params);
	const now = Date.now();
	const authorCount = new Map();

	const scored = [];
	for (const row of rows) {
		const inNet = network.has(row.userId);
		if (source === 'home' && includeIn && !includeOut && !inNet) continue;
		if (!includeIn && inNet && row.userId !== userId) continue;
		if (!includeOut && !inNet) continue;

		const t = idTimeMs(row.id);
		const ageH = Math.max(0.05, (now - (t || now - 3_600_000)) / 3_600_000);

		const reactions = reactionSum(row.reactions);
		// Thunder-like: weighted engagements (likes-ish, replies, renotes)
		const engagement =
			reactions * 1.0 +
			Number(row.replies) * 1.5 +
			Number(row.renotes) * 2.0;

		// Half-life style recency (stronger decay than linear)
		const recency = 1 / Math.pow(ageH + 1.2, 1.15);

		// In-network boost (following); OON dampened but not zero (discovery)
		const networkBoost = inNet ? 1.4 : 0.72;

		// Prefer original posts over pure renotes; mild boost for text notes
		const pureRenote = row.renoteId && (!row.text || row.text === '') && !row.replyId;
		const originalBoost = pureRenote ? 0.72 : (row.replyId ? 0.95 : 1.08);

		// Soft bot dampening (still allow if high engagement)
		const botPenalty = row.isBot ? 0.55 : 1.0;

		// Light authority prior from follower count (log scale, capped)
		const authority = 1 + Math.min(0.35, Math.log10(Math.max(1, row.followersCount)) / 12);

		const score =
			(0.4 + engagement) *
			recency *
			networkBoost *
			originalBoost *
			botPenalty *
			authority;

		scored.push({
			id: row.id,
			userId: row.userId,
			score,
			inNet,
			pureRenote,
		});
	}

	scored.sort((a, b) => b.score - a.score);

	// Author diversity + OON quota (X-style mix)
	const out = [];
	let outOfNetwork = 0;
	const maxOon = includeOut ? Math.ceil(limit * OON_RATIO) : 0;
	const maxPerAuthor = 3;

	for (const item of scored) {
		const c = authorCount.get(item.userId) || 0;
		if (c >= maxPerAuthor) continue;
		if (!item.inNet && outOfNetwork >= maxOon) continue;
		authorCount.set(item.userId, c + 1);
		if (!item.inNet) outOfNetwork++;
		out.push(item.id);
		if (out.length >= limit) break;
	}

	// Fill if following graph is sparse
	if (out.length < Math.min(limit, 12) && includeOut) {
		for (const item of scored) {
			if (out.includes(item.id)) continue;
			out.push(item.id);
			if (out.length >= limit) break;
		}
	}

	return {
		noteIds: out,
		meta: {
			candidates: rows.length,
			scored: scored.length,
			inNetwork: out.filter((id) => {
				const row = rows.find((r) => r.id === id);
				return row && network.has(row.userId);
			}).length,
			outOfNetwork: outOfNetwork,
		},
	};
}

const server = http.createServer(async (req, res) => {
	const send = (code, obj) => {
		res.writeHead(code, {
			'content-type': 'application/json',
			'cache-control': 'no-store',
		});
		res.end(JSON.stringify(obj));
	};

	if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
		return send(200, {
			ok: true,
			service: 'x-algorithm-gateway',
			version: 2,
			features: ['in-network', 'out-of-network', 'engagement', 'recency', 'diversity', 'bot-dampen'],
		});
	}

	if (req.method !== 'POST' || (req.url !== '/' && req.url !== '/timeline' && req.url !== '/home-mixer')) {
		return send(404, { error: 'not found' });
	}

	// SK-2026-028: require API_KEY in production (optional only outside production)
	const requireKey = process.env.NODE_ENV === 'production' || process.env.REQUIRE_API_KEY === '1';
	if (requireKey && !API_KEY) {
		return send(503, { error: 'API_KEY not configured' });
	}
	if (API_KEY) {
		const auth = req.headers.authorization || '';
		if (auth !== `Bearer ${API_KEY}`) return send(401, { error: 'unauthorized' });
	}

	const started = Date.now();
	try {
		const body = await parseBody(req);
		const ranked = await rankNotes(body);
		return send(200, {
			noteIds: ranked.noteIds,
			source: body.source || 'home',
			product: 'sharkey',
			latencyMs: Date.now() - started,
			debug: ranked.meta,
		});
	} catch (e) {
		const code = e?.statusCode === 413 ? 413 : 500;
		if (code !== 413) console.error(e);
		return send(code, { error: String(e?.message || e) });
	}
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`x-algorithm-gateway v2 listening on http://127.0.0.1:${PORT}`);
});
