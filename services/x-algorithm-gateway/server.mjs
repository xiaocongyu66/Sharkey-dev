#!/usr/bin/env node
/**
 * Local HTTP JSON gateway compatible with Sharkey XAlgorithmService.
 * Ranks notes from PostgreSQL using engagement + recency + author diversity
 * (Thunder/in-network + out-of-network candidate mix).
 *
 * Env:
 *   PORT=8787
 *   PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=sharkey_dev PGUSER=sharkey PGPASSWORD=...
 *   API_KEY=optional
 */
import http from 'node:http';
import { createRequire } from 'node:module';
import { createRequire as _cr } from 'node:module';
const require = createRequire(import.meta.url);
// resolve pg from Sharkey workspace if not installed next to this service
let pg;
try {
	pg = require('pg');
} catch {
	pg = require('/root/Sharkey-work/Sharkey-local-pg18/node_modules/.pnpm/pg@8.16.3/node_modules/pg');
}

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.API_KEY || '';

const pool = new pg.Pool({
	host: process.env.PGHOST || '127.0.0.1',
	port: Number(process.env.PGPORT || 5432),
	database: process.env.PGDATABASE || 'sharkey_dev',
	user: process.env.PGUSER || 'sharkey',
	password: process.env.PGPASSWORD || 'example-misskey-pass',
	max: 4,
});

function parseBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on('data', (c) => chunks.push(c));
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

function idTimeMs(id) {
	// aidx/aid style: first 8 chars hex of timestamp ms roughly; fall back to 0
	if (!id || typeof id !== 'string') return 0;
	const head = id.slice(0, 8);
	const n = Number.parseInt(head, 36);
	return Number.isFinite(n) ? n : 0;
}

async function rankNotes(body) {
	const userId = body.userId;
	const limit = Math.min(Number(body.limit) || 100, 200);
	const source = body.source === 'hybrid' ? 'hybrid' : 'home';
	const filters = body.filters || {};
	const pipeline = body.pipeline || {};
	const includeIn = pipeline.includeInNetwork !== false;
	const includeOut = pipeline.includeOutOfNetwork !== false;

	const following = await pool.query(
		`SELECT "followeeId" FROM following WHERE "followerId" = $1`,
		[userId],
	);
	const followeeIds = following.rows.map((r) => r.followeeId);
	const network = new Set(followeeIds);
	network.add(userId);

	// Candidate pull: recent public notes
	const params = [];
	const where = [`n.visibility = 'public'`, `n."deletedAt" IS NULL`, `n."userHost" IS NULL`];
	if (filters.withFiles) where.push(`n."fileIds" <> '{}'`);
	if (filters.withRenotes === false) where.push(`n."renoteId" IS NULL`);
	if (filters.withReplies === false) where.push(`n."replyId" IS NULL`);

	let sql = `
		SELECT n.id, n."userId", n."replyId", n."renoteId", n."fileIds",
			n."score", n."reactionAcceptance",
			COALESCE((SELECT COUNT(*) FROM note_reaction nr WHERE nr."noteId" = n.id), 0)::int AS reactions,
			COALESCE((SELECT COUNT(*) FROM note r WHERE r."replyId" = n.id), 0)::int AS replies,
			COALESCE((SELECT COUNT(*) FROM note rn WHERE rn."renoteId" = n.id), 0)::int AS renotes
		FROM note n
		WHERE ${where.join(' AND ')}
	`;

	if (source === 'home' && includeIn && !includeOut) {
		params.push(Array.from(network));
		sql += ` AND n."userId" = ANY($${params.length})`;
	}

	sql += ` ORDER BY n.id DESC LIMIT 800`;

	const { rows } = await pool.query(sql, params);
	const now = Date.now();
	const authorCount = new Map();

	const scored = rows.map((row) => {
		const ageH = Math.max(0.1, (now - idTimeMs(row.id)) / 3_600_000);
		const engagement =
			Number(row.reactions) * 1.0 +
			Number(row.replies) * 1.5 +
			Number(row.renotes) * 2.0 +
			Number(row.score || 0) * 0.01;
		const recency = 1 / Math.pow(ageH + 2, 1.15);
		const inNetwork = network.has(row.userId) ? 1.25 : 1.0;
		if (source === 'home' && includeIn && !includeOut && !network.has(row.userId)) {
			return null;
		}
		if (!includeIn && network.has(row.userId) && row.userId !== userId) return null;
		if (!includeOut && !network.has(row.userId)) return null;

		const base = engagement * recency * inNetwork;
		return { id: row.id, userId: row.userId, score: base };
	}).filter(Boolean);

	scored.sort((a, b) => b.score - a.score);

	// Author diversity: penalize repeated authors
	const out = [];
	for (const item of scored) {
		const c = authorCount.get(item.userId) || 0;
		if (c >= 3) continue;
		authorCount.set(item.userId, c + 1);
		out.push(item.id);
		if (out.length >= limit) break;
	}

	return out;
}

const server = http.createServer(async (req, res) => {
	const send = (code, obj) => {
		res.writeHead(code, { 'content-type': 'application/json' });
		res.end(JSON.stringify(obj));
	};

	if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
		return send(200, { ok: true, service: 'x-algorithm-gateway' });
	}

	if (req.method !== 'POST' || (req.url !== '/' && req.url !== '/timeline' && req.url !== '/home-mixer')) {
		return send(404, { error: 'not found' });
	}

	if (API_KEY) {
		const auth = req.headers.authorization || '';
		if (auth !== `Bearer ${API_KEY}`) return send(401, { error: 'unauthorized' });
	}

	try {
		const body = await parseBody(req);
		const noteIds = await rankNotes(body);
		return send(200, { noteIds, source: body.source || 'home', product: 'sharkey' });
	} catch (e) {
		console.error(e);
		return send(500, { error: String(e?.message || e) });
	}
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`x-algorithm-gateway listening on http://127.0.0.1:${PORT}`);
});
