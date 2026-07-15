# Sharkey Security / Bug / API Latency Audit — Pass 13

| Field | Value |
|-------|--------|
| **Document type** | Pass 13 findings register + API latency review |
| **Target tree** | `/root/Sharkey-work/Sharkey-dev-continue` |
| **Product** | Sharkey `2025.5.2-dev` (Misskey fork) |
| **Audit date** | 2026-07-16 |
| **Method** | Static code review only — no live exploitation, no PoC payloads, no load tests |
| **Baseline** | `docs/SECURITY-AUDIT-AMD.md` (SK-2026-001 … 090; Pass 1–12) |
| **New IDs** | **SK-2026-091 … 096** (+ performance backlog **PERF-01 … PERF-08**) |
| **Related docs** | `docs/SECURITY-AUDIT-AMD.md` §0 / §1 / §8; `docs/x-algorithm-integration.md` |
| **Disposition** | Private local report. Prefer responsible disclosure for residual design items. |

---

## 0. Executive summary

Pass 13 re-audited the tree after Pass 7–12 remediations and recent timeline / AI / WS work. Focus areas:

1. Residual authz / error-oracle gaps on note write paths  
2. Outbound fetch edges still outside `HttpRequestService`  
3. Home timeline and fanout latency root causes  
4. Broadcast / self-HTTP performance side effects of recent features  

### 0.1 Status snapshot (2026-07-16)

| Layer | Status |
|-------|--------|
| **Pass 7–12 (SK-061…090)** | **Remediated in tree** (verify deploy commits) |
| **Pass 13 security (SK-091…096)** | **Remediated / mitigated in tree (2026-07-16)** |
| **Pass 13 performance (PERF-01…02)** | **Remediated / mitigated**; PERF-03+ residual engineering |
| **Design residuals** | SK-010 escrow ≠ E2EE; SK-017 short tokens; SK-014 proxy surface |
| **Dynamic pentest / load test** | **Not completed** |

**One-line (security):**  
**“Pass 13 actionable items remediated/mitigated in tree (2026-07-16). Residual design: escrow, short tokens, proxy surface; PERF-03 packMany still open.”**

**One-line (latency):**  
**“Fanout reads capped (PERF-01); timeout fails 503 (SK-096). Remaining hotspot: packMany (PERF-03).”**

### 0.2 Scores (Pass 13 judgment)

| Dimension | Score (1–10) | Note |
|-----------|--------------|------|
| Security baseline (post Pass 12) | **8.0** | Oracle family largely closed |
| Pass 13 residual security | **7.0** | SK-091+ open |
| API latency / timeline | **5.5–6.5** | Fanout full-list read is P0 |
| Chat perf architecture | **8.0** | Prefetch / lazy mount / WS still sound (§8 AMD) |
| Composite (ship readiness) | **~7.0** | Conditional; need PERF-01 + SK-091 before polish |

### 0.3 Recent code context reviewed

| Area | Paths / commits (examples) |
|------|----------------------------|
| Home timeline | `endpoints/notes/timeline.ts` — fanout-first, DB timeout → `[]` |
| Fanout | `core/FanoutTimelineService.ts`, `core/FanoutTimelineEndpointService.ts` |
| X-algorithm | `core/XAlgorithmService.ts` — `isEnabled() === false`; admin `test` still calls gateway |
| AI abuse | `core/AiAbuseControlService.ts` — seed-only suspend; bounded cooldown Map |
| Live profile WS | `endpoints/i/update.ts`, `GlobalEventService` `userUpdated`, `frontend/.../live-user-cache.ts` |
| Gateway | `services/x-algorithm-gateway/server.mjs` |

---

## 1. Findings register (Pass 13)

Severity: **C**ritical / **H**igh / **M**edium / **L**ow / **I**nfo.  
IDs continue the AMD series: `SK-2026-NNN`.

---

### SK-2026-091 — Reaction / like inaccessible-note error not mapped (existence oracle)

| | |
|--|--|
| **Severity** | **L–M** |
| **CWE** | CWE-209 / CWE-203 |
| **Status** | **FIXED** (map inaccessible → `NO_SUCH_NOTE`) |
| **Components** | `core/ReactionService.ts` `create`; `endpoints/notes/reactions/create.ts`; `endpoints/notes/like.ts` |

**Description**  
`ReactionService.create` correctly gates visibility:

```ts
const { accessible } = await this.noteVisibilityService.checkNoteVisibilityAsync(note, user);
if (!accessible) {
  throw new IdentifiableError('68e9d2d1-48bf-42c2-b90a-b20e09fd3d48', 'Note not accessible for you.');
}
```

Endpoint catch blocks map only:

- `51c42bb4-…` → already reacted  
- `e70412a4-…` → blocked  
- `12c35529-…` → cannot react to renote  

They **do not** map `68e9d2d1-…` → `NO_SUCH_NOTE`. Clients / attackers can distinguish:

| Condition | Typical response |
|-----------|------------------|
| Note missing | Mapped `NO_SUCH_NOTE` from `getNote` |
| Note private / inaccessible | Unmapped IdentifiableError → 500 or distinct body |

**Impact**  
Existence oracle for private / followers-only / specified notes (weaker than pre-Pass-9 list oracles, still privacy-relevant).

**Remediation**

```ts
if (err.id === '68e9d2d1-48bf-42c2-b90a-b20e09fd3d48') {
  throw new ApiError(meta.errors.noSuchNote);
}
```

Apply to `notes/reactions/create` and `notes/like`. Prefer same mapping on any other endpoint that surfaces this id.

---

### SK-2026-092 — Mastodon bridge still uses process-local HTTP `fetch` (latency + residual surface)

| | |
|--|--|
| **Severity** | **L** (security residual after SK-064); **M** for latency |
| **CWE** | CWE-918 (historical); performance |
| **Status** | **FIXED** (in-process; no self-HTTP) |
| **Components** | `server/api/mastodon/endpoints/search.ts` (`/v1/trends/statuses`, `/v2/suggestions`) |

**Description**  
After SK-064, `baseUrl` is fixed to `config.url` and headers are minimal. Code still does:

```ts
const res = await fetch(`${baseUrl}/api/notes/featured`, { method: 'POST', ... });
// and
const res = await fetch(`${baseUrl}/api/users`, { ... });
```

**Impact**

- Extra TCP/HTTP hop on every Mastodon trends/suggestions request  
- Depends on loopback/public URL routing health  
- Bypasses in-process services (harder to share caches / transaction context)

**Remediation**  
Call `FeaturedService` / user listing services (or shared endpoint handlers) in-process; delete self-`fetch`.

---

### SK-2026-093 — Telegram sticker import: native `fetch` + bot token in URL

| | |
|--|--|
| **Severity** | **L** (extends SK-037) |
| **CWE** | CWE-532 / CWE-598 |
| **Status** | **MITIGATED** (HttpRequestService + scrub; Telegram path token residual) |
| **Components** | `core/ChatStickerService.ts` `importTelegramPack` |

**Description**

```ts
const setRes = await fetch(`https://api.telegram.org/bot${token}/getStickerSet?...`);
const url = `https://api.telegram.org/file/bot${token}/${file_path}`;
await this.driveService.uploadFromUrl({ url, ... });
```

- Token appears in request URL (access logs, error logs, intermediate proxies)  
- Does not use `HttpRequestService` agent / timeout policy  
- Up to ~80 stickers imported **serially** (also PERF)

**Remediation**

1. Prefer Telegram Bot API patterns that keep token in header if available; otherwise scrub logs  
2. Route downloads through `HttpRequestService` with timeout  
3. Queue import job; rate-limit concurrent uploads  

---

### SK-2026-094 — `userUpdated` instance-wide broadcast (privacy + fan-out cost)

| | |
|--|--|
| **Severity** | **L** privacy / **M** performance under churn |
| **CWE** | CWE-359 (limited); CWE-400 |
| **Status** | **MITIGATED** (slim payload + async room fan-out; broadcast kept for UX) |
| **Components** | `endpoints/i/update.ts`; `core/GlobalEventService.ts` `BroadcastEventTypes.userUpdated`; `frontend/src/utility/live-user-cache.ts` |

**Description**  
On display-facing profile changes, server:

1. `publishBroadcastStream('userUpdated', { user: UserLite, updatedAt })` — **all connected clients**  
2. Own `main` stream `userUpdated` + `userAvatarUpdated`  
3. Up to **200 memberships + 100 owned rooms** → `publishChatRoomStream(..., 'userAvatarUpdated')`  

Frontend caches up to 2000 patches (`live-user-cache.ts`).

**Impact**

- Every online user receives other users’ lite profile patches (avatar URL, name, description fields in pack)  
- High-frequency profile edits (or bots) amplify Redis/WS bandwidth  
- Room loop is O(rooms) sequential awaits on the update request path  

**Remediation**

- Prefer targeted publish (followers / open timelines / shared rooms) over global broadcast  
- Debounce broadcast; omit long `description` from broadcast payload if not needed for avatar bust  
- Fire room fan-out asynchronously after response  

---

### SK-2026-095 — X-algorithm gateway: unbounded request body parse

| | |
|--|--|
| **Severity** | **L–M** (local bind mitigates) |
| **CWE** | CWE-400 |
| **Status** | **FIXED** (64 KiB + 413) |
| **Components** | `services/x-algorithm-gateway/server.mjs` `parseBody` |

**Description**

```js
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    // no Content-Length / total size cap
```

Server listens on `127.0.0.1` by default (good). Production requires `API_KEY` when `NODE_ENV=production` (SK-028). If gateway is exposed or mis-bound, large bodies cause memory DoS.

**Remediation**  
Reject when cumulative size > e.g. 64 KiB; require `Content-Length` or streaming limit.

---

### SK-2026-096 — Home timeline DB timeout returns empty array (availability / integrity bug)

| | |
|--|--|
| **Severity** | **M** (availability / UX integrity) |
| **CWE** | CWE-755 |
| **Status** | **FIXED** (`TEMPORARILY_UNAVAILABLE` 503) |
| **Components** | `endpoints/notes/timeline.ts` `getFromDbSafe` |

**Description**

```ts
if (/statement timeout|canceling statement/i.test(msg)) {
  this.logger.warn(`home timeline DB timed out ...`);
  return [];
}
```

Clients interpret `[]` as “no notes”, not “backend overloaded / query failed”. Combined with fanout miss + DB fallback, users see blank home.

**Remediation**

- Return structured error (`INTERNAL_ERROR` / `TEMPORARILY_UNAVAILABLE`) or `{ notes: [], partial: true, reason: 'timeout' }` with non-200 if API allows  
- Metrics + alert on timeout rate  
- Fix root latency (PERF-01 / PERF-02) so path is rare  

---

### Pass 13 negatives (checked, no new High)

| Area | Result |
|------|--------|
| Chat room WS membership | Gate present (`hasPermissionToViewRoomTimeline`) |
| Note-id oracle family 073–088 | Visibility gates present on reviewed seeds |
| AI translation / abuse / X-algo main path | `HttpRequestService` + `assertSafeAiEndpointUrl` |
| AI abuse auto-suspend cohort | Seed-only (SK-063) |
| Invite ignore join | Enforced (SK-043) |
| Escrow reveal vs write preference | Decrypt when keys present (SK-067) |
| X timeline main diversion | `XAlgorithmService.isEnabled()` hard `false` |
| Reaction **create** visibility | Enforced in service (mapping gap only = SK-091) |

---

## 2. Residual open items from earlier passes (not re-opened)

| ID | Why still open |
|----|----------------|
| **SK-010** | Escrow is operator-readable at-rest crypto, not peer E2EE |
| **SK-014** | `/proxy` intentional outbound surface |
| **SK-017 / 018** | Short native token; some IDs use `Math.random` |
| **SK-021** | Ops: `reset-db` if `NODE_ENV=test` |
| **SK-022** | OAuth redirect not full app allowlist |
| **SK-028** | Gateway key optional outside production |
| **SK-037** | Telegram token-in-URL (see SK-093) |
| **SK-046 residual** | Making clip public does not re-scan attached notes |
| **SK-055** | ZIP / slacc residual |

---

## 3. API latency & performance backlog

### 3.1 Severity legend

| Tag | Meaning |
|-----|---------|
| **PERF-P0** | Dominant user-visible latency / scale risk |
| **PERF-P1** | Clear waste or secondary hotspot |
| **PERF-P2** | Engineering / observability |

---

### PERF-01 — Fanout timeline Redis full-list `LRANGE 0 -1` (**P0**)

| | |
|--|--|
| **Severity** | **PERF-P0** |
| **Status** | **FIXED** (`LRANGE 0..FANOUT_READ_MAX-1`, always `LTRIM` on push) |
| **Components** | `core/FanoutTimelineService.ts` `get` / `getMulti` |

**Problem**  
Every timeline read pulls the **entire** Redis list for each key, then filters/sorts in Node:

```ts
pipeline.lrange('list:' + n, 0, -1);
```

`perUserHomeTimelineCacheMax` can be large; `LTRIM` only runs with ~10% probability on push → lists grow and stay fat.

**Effect on `notes/timeline`**

1. Large Redis payload + CPU sort  
2. Adaptive re-fetch loop in `FanoutTimelineEndpointService` may issue multiple DB `IN` queries  
3. Then `NoteEntityService.packMany`  

**Fix direction**

- Bound read: `LRANGE 0, max(limit * k, N)` or structure that supports id-range  
- Always `LTRIM` on push (or deterministic trim cadence)  
- Metric: list length histogram per TL type  

---

### PERF-02 — Home DB fallback query cost + silent timeout (**P0**)

| | |
|--|--|
| **Severity** | **PERF-P0** |
| **Components** | `endpoints/notes/timeline.ts` `getFromDb` / `getFromDbSafe` |

**Problem**  
When fanout off or insufficient:

- `userId IN (:...followeeIds)` (includes self) — good vs correlated EXISTS, bad when follow graph is huge  
- Multiple joins: user, reply, renote, replyUser, renoteUser  
- Mute / block / visibility / host / suspended / silence / thread-mute filters  
- Statement timeout → **empty array** (SK-096)

**Fix direction**

- Cap followee IN list / force fanout for heavy users  
- Confirm indexes `(user_id, id DESC)`, channel paths  
- Fail loud (SK-096); track fallback rate  

**Positive in tree:** IN-list rewrite and timeout guard already reduce 500s vs unbounded EXISTS.

---

### PERF-03 — `NoteEntityService.packMany` weight on every TL (**P0/P1**)

| | |
|--|--|
| **Severity** | **PERF-P0** for cold TL; **P1** when fanout warm |
| **Components** | `core/entities/NoteEntityService.ts` (~1100 lines) |

**Problem**  
Timeline responses pack full detail: files, users, reactions buffer, favorites, renotes, mutes, polls, recursive reply/renote graphs.

**Fix direction**

- Timeline-specific lite pack (less recursion, deferred polls)  
- Ensure batch paths always hit (avoid per-note N+1 regressions)  
- Optional: defer `myReaction` / favorite flags to secondary call  

---

### PERF-04 — Mastodon self-HTTP (**P1**)

See **SK-092**. Extra hop on trends/suggestions.

---

### PERF-05 — `i/update` synchronous outbound + broadcast fan-out (**P1**)

| | |
|--|--|
| **Severity** | **PERF-P1** |
| **Components** | `endpoints/i/update.ts` |

**Problem**

- `verifyFieldLinks` may perform outbound HTTP on profile update path  
- Sequential `publishChatRoomStream` for many rooms  
- Global broadcast (SK-094)  

**Fix direction**  
Async verify; batch or background room notify; targeted WS.

---

### PERF-06 — X-algorithm path (disabled) & gateway SQL (**P1** if re-enabled)

| | |
|--|--|
| **Severity** | **PERF-P1** (currently main path disabled) |
| **Components** | `XAlgorithmService`, `services/x-algorithm-gateway/server.mjs` |

**Notes**

- Runtime timelines: `isEnabled()` always `false` — good for latency/availability  
- Admin `admin/x-algorithm/test` still hits gateway  
- Gateway ranks up to **600** candidate notes with engagement scoring; following list full scan  

**If re-enabled:** short TTL cache already designed; enforce endpoint + fallback (historical SK-049); index note filters; smaller pool.

---

### PERF-07 — AI translation / abuse outbound (**P1** under load)

| | |
|--|--|
| **Severity** | **PERF-P1** |
| **Components** | `AiTranslationService`, `AiAbuseControlService` |

**Notes**

- Translation: content-hash Redis cache — keep  
- Abuse: fire-and-forget on signin/signup with cooldown Map (bounded 10k) — good  
- LLM timeouts up to 60s config cap — isolate from request path (already async for scheduleCheck)  

**Fix direction**  
Worker queue for abuse; cache stampede lock on translate; never block HTTP on LLM.

---

### PERF-08 — Observability gap (**P2**)

| | |
|--|--|
| **Severity** | **PERF-P2** |
| **Components** | `ApiCallService`, timeline / pack paths |

No systematic p50/p95 per endpoint in-tree for:

- `notes/timeline`, hybrid/local  
- `packMany` duration  
- fanout hit/miss / DB fallback / statement_timeout  

**Fix direction**  
Histogram metrics + slow-query log sampling.

---

### 3.2 Latency path diagram (home)

```
Client POST /api/notes/timeline
        │
        ├─ enableFanoutTimeline?
        │     NO ──► getFromDbSafe ──► packMany ──► response
        │              │
        │              └─ timeout ──► []   (SK-096 / PERF-02)
        │
        └─ YES ──► FanoutTimelineEndpointService.timeline
                      │
                      ├─ getMulti: LRANGE 0 -1  × keys   (PERF-01)
                      ├─ filter loop + DB IN batches
                      ├─ optional dbFallback (PERF-02)
                      └─ packMany (PERF-03)
```

---

## 4. Priority remediation plan

### P0 (1–2 days)

| # | Item | Owner hint |
|---|------|------------|
| 1 | **SK-091** map reaction inaccessible → `NO_SUCH_NOTE` | backend API |
| 2 | **PERF-01** bound Redis timeline reads + aggressive LTRIM | fanout |
| 3 | **SK-096 / PERF-02** stop silent empty TL on timeout | timeline API |
| 4 | **SK-095** gateway body size cap | gateway |

### P1 (1–2 weeks)

| # | Item |
|---|------|
| 5 | **PERF-03** lite pack for timelines |
| 6 | **SK-092 / PERF-04** remove Mastodon self-fetch |
| 7 | **SK-094 / PERF-05** narrow `userUpdated` broadcast |
| 8 | **SK-093** Telegram import hygiene + queue |
| 9 | Align `docs/x-algorithm-integration.md` with `isEnabled()===false` |

### P2

| # | Item |
|---|------|
| 10 | **PERF-08** latency metrics |
| 11 | Heavy-follower fanout-only policy |
| 12 | AMD §8.7 minimum unit tests (chat ACL, revealForPack, history prefetch) |

---

## 5. Operator verification checklist

- [ ] `NODE_ENV=production` on public nodes  
- [ ] Strong dedicated `chatEscrowSecret` / `CHAT_ESCROW_SECRET`  
- [ ] `reset-db` unreachable (no public `NODE_ENV=test`)  
- [ ] Fanout Redis healthy; `enableFanoutTimeline=true` if expecting fast home  
- [ ] Deploy includes Pass 7–12 fix commits (see AMD §0.2)  
- [ ] x-algorithm gateway not public without `API_KEY`; prefer `127.0.0.1` only  
- [ ] `aiAbuseControlConfig.autoSuspend` off unless human review process exists  
- [ ] Smoke: private note reaction does not distinguish exist vs missing after SK-091 fix  
- [ ] Smoke: home TL under DB pressure does not look like “zero posts” after SK-096 fix  
- [ ] Smoke: non-member cannot receive `chatRoom` live events  

---

## 6. Methodology (Pass 13)

- Read AMD status matrix + §8 optimization evaluation  
- Traced home timeline control flow (fanout → filter → pack → DB fallback)  
- Grepped: `requireCredential: false`, `getNote`, `checkNoteVisibility`, native `fetch(`, `LRANGE`, `Math.random`  
- Reviewed AI services, gateway, chat room channel, `i/update` broadcast, live-user-cache  
- **Did not** run exploits, load tests, or production traffic analysis  

---

## 7. Key file index (Pass 13)

| Area | Paths |
|------|--------|
| Home TL | `packages/backend/src/server/api/endpoints/notes/timeline.ts` |
| Fanout read | `packages/backend/src/core/FanoutTimelineService.ts` |
| Fanout endpoint | `packages/backend/src/core/FanoutTimelineEndpointService.ts` |
| Note pack | `packages/backend/src/core/entities/NoteEntityService.ts` |
| Reactions | `packages/backend/src/core/ReactionService.ts`, `endpoints/notes/reactions/create.ts`, `endpoints/notes/like.ts` |
| X-algo | `packages/backend/src/core/XAlgorithmService.ts`, `services/x-algorithm-gateway/server.mjs` |
| AI | `packages/backend/src/core/AiTranslationService.ts`, `AiAbuseControlService.ts`, `misc/ai-endpoint-url.ts` |
| Profile WS | `packages/backend/src/server/api/endpoints/i/update.ts`, `core/GlobalEventService.ts` |
| Live cache UI | `packages/frontend/src/utility/live-user-cache.ts` |
| Mastodon | `packages/backend/src/server/api/mastodon/endpoints/search.ts` |
| Stickers | `packages/backend/src/core/ChatStickerService.ts` |
| Chat stream | `packages/backend/src/server/api/stream/channels/chat-room.ts` |

---

## 8. Revision history

| Rev | Date | Notes |
|-----|------|--------|
| 0.1 | 2026-07-16 | Pass 13 initial: SK-091…096, PERF-01…08, scores, plans |

---

## 9. Relationship to AMD master document

- Master register: `docs/SECURITY-AUDIT-AMD.md`  
- Pass 13 detail lives in **this file** to keep AMD size manageable  
- AMD §0 / revision history / §7 index should link here for SK-091+ and PERF backlog  
- Continue numbering: next pass starts at **SK-2026-097**  

---

*End of Pass 13 document. Append new findings as SK-2026-0xx; update scores when remediations land.*
