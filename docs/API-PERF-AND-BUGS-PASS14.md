# Sharkey API Latency Deep-Dive & Bug Hunt — Pass 14

| Field | Value |
|-------|--------|
| **Document type** | Performance deep-dive + functional bug register |
| **Target tree** | `/root/Sharkey-work/Sharkey-dev-continue` |
| **Date** | 2026-07-16 |
| **Baseline** | Pass 13 remediated in `6514330` (SK-091…096, PERF-01 bound LRANGE, TL timeout 503) |
| **Method** | Static code review — no load tests |
| **Related** | `docs/SECURITY-AUDIT-PASS13.md`, `docs/SECURITY-AUDIT-AMD.md`, **`docs/API-OPTIMIZATION-DECISIONS.md`** (改因/收益/风险全文) |
| **New IDs** | **SK-2026-097 … 101**, **PERF-09 … PERF-16** |

> **决策说明书（为什么改、为什么这么做、优化点、会引入什么 bug）：**  
> → [`API-OPTIMIZATION-DECISIONS.md`](./API-OPTIMIZATION-DECISIONS.md)

---

## 0. Executive summary

Pass 13 closed the worst **security residuals** and **unbounded fanout LRANGE**.  
Pass 14 digs into **what still makes APIs slow** and **logic bugs still in packing / timeline / search**.

### 0.1 Headline findings

| Pri | ID | One-line |
|-----|-----|----------|
| **P0 bug** | **SK-097** | poll `isVoted` wrong user — **FIXED** (`2d72032`) |
| **P0 perf** | **PERF-09** | poll vote overfetch — **FIXED** |
| **P0 perf** | **PERF-03** | packMany weight — **partial** (skip poll queries when no polls) |
| **P1 perf** | **PERF-10** | Hybrid EXISTS — **FIXED** (IN-list) |
| **P1 perf** | **PERF-11** | `allowPartial` default false — OPEN (MkPagination already sends true) |
| **P1 perf** | **PERF-12** | sqlLike ILIKE — **mitigated** (min len 2, max 80); still recommend Meili/pgroonga |
| **P1 bug** | **SK-098** | Fanout window hole — **FIXED** (windowFull → DB fallback on home/hybrid path) |
| **P2** | **PERF-13…16** | Mute EXISTS forest, Cache-Control, metrics |

**One-line:**  
**“Poll/hybrid/fanout-window fixed; remaining: packMany depth (PERF-03), production search provider, mute EXISTS on DB path.”**

### 0.2 Scores (after Pass 14 partial land)

| Dimension | Score | Note |
|-----------|-------|------|
| Fanout Redis read | **8.0** | Bounded LRANGE + window-miss DB fallback |
| Home DB fallback | **7.5** | IN-list + 503 on timeout |
| Note packing | **5.5** | SK-097 fixed; skip empty poll queries; still heavy |
| Hybrid/social DB | **7.0** | IN-list aligned with home |
| Search (sqlLike) | **5.0** | Length caps; still not index-friendly |
| Composite API feel | **~7.0** | Main residual packMany + search provider |

---

## 1. What Pass 13 already fixed (do not re-litigate)

| Item | Status in tree |
|------|----------------|
| SK-091 reaction oracle mapping | Fixed `6514330` |
| PERF-01 fanout `LRANGE 0..FANOUT_READ_MAX` | Fixed |
| SK-096 home timeout → 503 not `[]` | Fixed |
| SK-092 Mastodon in-process | Fixed |
| SK-094 broadcast slim + async rooms | Fixed |
| SK-095 gateway body cap | Fixed |

Remaining work below is **Pass 14**.

---

## 2. Bugs (functional)

---

### SK-2026-097 — Poll `isVoted` wrong user in `packMany` (**P0 correctness**)

| | |
|--|--|
| **Severity** | **M–H** (wrong poll UI; possible privacy confusion) |
| **CWE** | CWE-284 / logic error |
| **Status** | **FIXED** (viewer-scoped pollVotes map + pack lookup by noteId only) |
| **Components** | `core/entities/NoteEntityService.ts` `pack` + `packMany` |

**Broken code:**

```ts
// packMany batch load — ALL users appearing on notes, not only me:
this.pollVotesRepository.findBy({
  noteId: IsOne(noteIds),
  userId: IsOne(userIds),  // authors + reply/renote users
})

// pack() attaches votes under the NOTE AUTHOR key:
myVotes: opts._hint_?.pollVotes?.get(note.id)?.get(note.userId),
//                                              ^^^^^^^^^^^^ should be meId
```

**What happens**

1. Batch map is `noteId → userId → votes[]`.  
2. Lookup uses **`note.userId` (author)** instead of **viewer `meId`**.  
3. Viewer’s `choices[].isVoted` reflects **whether the author voted**, not the viewer.  
4. If lookup misses, `populatePoll` falls back to per-note `findBy({ userId: meId })` → **N+1**.  
5. Batch also loads **every listed user’s** votes for those notes (unnecessary I/O, wider data than needed).

**Impact**

- Timelines / notifications packing polls: **wrong “you voted” state** when hint hits.  
- Especially wrong when author voted on own poll (common).  
- Extra DB load when hint misses.

**Fix (minimal):**

```ts
// only load viewer votes
me
  ? this.pollVotesRepository.findBy({
      noteId: IsOne(noteIds),
      userId: me.id,
    }).then(votes => /* Map noteId → MiPollVote[] */)
  : Promise.resolve(new Map())

// pack:
myVotes: meId
  ? opts._hint_?.pollVotes?.get(note.id)  // Map noteId → votes[]
  : undefined
```

Or keep nested map but **`.get(meId)`**, and query only `userId: me.id`.

**Test cases**

1. Author voted choice 0; viewer never voted → viewer must see all `isVoted: false`.  
2. Viewer voted choice 1 → only choice 1 `isVoted: true` in `packMany` of home TL.  
3. Multiple polls in one packMany → single query, no per-note poll vote queries.

---

### SK-2026-098 — Fanout read window can create pagination holes (**P1**)

| | |
|--|--|
| **Severity** | **L–M** (missing notes when scrolling) |
| **Status** | **FIXED** on `FanoutTimelineEndpointService` (getMultiDetailed + forced DB when untilId past window) |
| **Components** | `FanoutTimelineService`, `FanoutTimelineEndpointService` |

**Behavior**  
Reads only first `FANOUT_READ_MAX` list elements (newest). Client `untilId` pagination filters **within that window** only.

If list is longer than the cap, older IDs still exist in Redis but are **never returned**. Combined with `allowPartial=false`, endpoint may pull more from DB with wrong cursor, or appear “stuck”.

**Remediation**

- Prefer Redis structures that support id-range (or store score=id).  
- Or: when `untilId` is older than the last id in the window, **explicitly DB-fallback** with that cursor (document invariant).  
- Emit metric `fanout_window_miss` when `untilId < min(window)`.

---

### SK-2026-099 — `allowPartial` default false worsens TL latency & empty-feeling pages (**L product/perf**)

| | |
|--|--|
| **Severity** | **L** (compat intentional; cost real) |
| **Status** | **OPEN** (by design comment) |
| **Components** | `notes/timeline`, `hybrid-timeline`, `local-timeline`, `user-list-timeline` |

Comment in schema: *“true is recommended but for compatibility false by default”*.

With `false`, fanout filter loop keeps fetching until **`limit` fully filled**, amplifying:

- Redis window scans  
- DB `IN` batches  
- mute/visibility filter discards  

**Remediation**

- Frontend always send `allowPartial: true` (Misskey client may already in places — verify Sharkey UI).  
- Consider default `true` on new API version / Sharkey-only clients.  
- Document that `false` is the expensive mode.

---

### SK-2026-100 — Hybrid DB fallback still correlated `EXISTS` following (**perf bug vs home**)

| | |
|--|--|
| **Severity** | **M** latency under fanout miss |
| **Status** | **FIXED** (cached followee + channel IN lists) |
| **Components** | `endpoints/notes/hybrid-timeline.ts` `getFromDb` |

Home was optimized to:

```ts
note.userId IN (:...followeeIds)  // from userFollowingsCache
```

Hybrid still:

```ts
.orFollowingUser(qb, ':meId', 'note.userId')  // EXISTS (SELECT 1 FROM following ...)
.orFollowingChannel(qb, ':meId', 'note.channelId')
```

Plus the full mute/block/visibility EXISTS forest.

**Impact**  
When fanout insufficient or disabled, **hybrid/social is much slower than home** for the same user.

**Remediation**  
Port home’s cached ID-list pattern for following (and channel follows via `userFollowingChannelsCache`).

---

### SK-2026-101 — Default fulltext `ILIKE '%q%'` (**perf / DoS-adjacent**)

| | |
|--|--|
| **Severity** | **M** at scale |
| **Status** | **OPEN** (config-dependent) |
| **Components** | `core/SearchService.ts` provider `sqlLike` |

```ts
query.andWhere('note.text ILIKE :q', { q: `%${sqlLikeEscape(q)}%` });
```

- Cannot use normal B-tree indexes  
- Concurrent searches + visibility EXISTS = CPU/IO spikes  
- Mitigated only if operator sets Meili / pgroonga / tsvector  

**Remediation**

- Prefer `sqlPgroonga` / `sqlTsvector` / Meili in production docs as **required**, not optional  
- Rate-limit `notes/search` tighter for unauthenticated  
- Reject 1–2 char queries  

---

### Minor / polish bugs

| ID | Issue | Note |
|----|--------|------|
| **SK-097b** | `poll.votes[poll.choices.indexOf(c)]` | O(n²) per pack; use index in `map((c,i)=>…)` |
| **I** | `packMany` TODO: dedupe same note refs | Comment at NoteEntityService ~908 |
| **I** | `ReactionService` pair cache `startsWith(meId)` | Ambiguous if ids share prefixes (unlikely with fixed id alphabet) |

---

## 3. Performance backlog (Pass 14)

### Already improved (Pass 13)

| ID | Change |
|----|--------|
| PERF-01 | Bound fanout LRANGE |
| PERF-02 | Home timeout → 503 |
| PERF-04 | Mastodon no self-HTTP |
| PERF-05 | userUpdated slimmer |

### Still open / newly identified

---

#### PERF-03 — `NoteEntityService.packMany` weight (**P0**)

**Cost centers (one TL response):**

| Step | Work |
|------|------|
| `fetchRequiredNotes` | 1–2 extra note SELECTs for reply/renote graphs |
| `getReactions` + buffer | Redis pipeline 2 ops × note (+ renotes) |
| `packMany` users | Full user pack + relations |
| **polls + pollVotes** | Broken/overfetch (SK-097 / PERF-09) |
| favorites / renotes | 2 queries for me |
| mutes caches | OK if warm |
| `customEmojiService.prefetchEmojis` | Aggregate all emoji keys |
| per-note `pack` | Still builds rich Note JSON |

**Optimizations**

1. Fix SK-097 (correctness + kill N+1).  
2. Skip poll vote query when no `hasPoll` in set.  
3. Timeline lite schema: `detail: false`, shallow renote, defer polls.  
4. Cap recursive renote depth for pure renotes already partially done.  
5. Avoid packing `reactionAndUserPairCache` to clients when unused.

---

#### PERF-09 — Poll vote batch wrong scope (**P0**, tied to SK-097)

Load only `userId = me.id`. Map `noteId → votes[]`.

---

#### PERF-10 — Hybrid/list DB EXISTS following (**P1**)

See SK-100. Same for any timeline still on `orFollowingUser` without cache IN-list.

---

#### PERF-11 — `allowPartial: false` default (**P1**)

See SK-099. Frontend + docs.

---

#### PERF-12 — Search ILIKE (**P1**)

See SK-101. Ops + provider.

---

#### PERF-13 — Mute/block/visibility `EXISTS` forest on DB timelines (**P1**)

`QueryService.generateMutedUserQueryForNotes` + blocked + visibility attach **many correlated subqueries** per row.

**Ideas**

- For fanout path, filtering is already in Node with caches (good).  
- For DB path: pre-fetch mute/block id sets and use `NOT IN` / anti-join with materialised sets (home partially did followees).  
- Keep EXISTS only where sets are huge and IN would explode.

---

#### PERF-14 — Global API `Cache-Control: private, max-age=0` (**P2**)

`ApiServerService` sets no-store-ish headers on **all** endpoints including public `meta`.

**Ideas**

- Allow short public cache for `meta` (detail=false), emoji, manifest-like payloads.  
- Keep private for credentialed routes.

---

#### PERF-15 — Reactions buffer Redis shape (**P2**)

`getMany`: per note `HGETALL` + `ZRANGE 0 -1`. Fine for small pages; with renote expansion note count grows.

**Ideas**  
Only fetch buffer for notes with `reactions` non-empty or recent ids.

---

#### PERF-16 — Observability (**P2**)

Still missing histograms:

- `notes_timeline_seconds` {path=fanout|db, partial}  
- `pack_many_seconds` {note_count}  
- `fanout_list_len`, `fanout_window_miss`  
- `search_seconds` {provider}  
- statement_timeout count on home/hybrid  

---

## 4. Hot path diagrams

### 4.1 Home timeline (post Pass 13)

```
POST /api/notes/timeline
  ├─ fanout ON?
  │   ├─ getMulti LRANGE 0..MAX-1     ← bounded (PERF-01)
  │   ├─ filter (visibility, mute…) in Node
  │   ├─ DB IN (noteIds) batches
  │   ├─ optional DB fallback (IN followees)  ← better than EXISTS
  │   └─ packMany  ← DOMINANT remaining cost (PERF-03, SK-097)
  └─ fanout OFF → getFromDb → packMany
```

### 4.2 Hybrid timeline DB fallback (weaker)

```
hybrid getFromDb
  EXISTS following(user)
  EXISTS following(channel)
  + mute/block/visibility EXISTS forest
  + joins user/reply/renote
  → packMany
```

### 4.3 packMany poll path (buggy)

```
noteIds, userIds (all authors…)
  SELECT poll_vote WHERE noteId IN (…) AND userId IN (all authors…)  ← overfetch
  pack: myVotes = map[noteId][note.userId]  ← WRONG USER
       miss → per-note SELECT for me  ← N+1
```

---

## 5. Priority fix plan

### Day 1 (must)

| # | Work | Effort |
|---|------|--------|
| 1 | **SK-097 / PERF-09** fix poll vote key + query only `me` | S |
| 2 | Add unit/integration test for packMany poll isVoted | S |
| 3 | Frontend: force `allowPartial: true` on TL fetchers | S |

### Week 1

| # | Work | Effort |
|---|------|--------|
| 4 | **PERF-10 / SK-100** hybrid DB use followee/channel ID caches | M |
| 5 | **PERF-03** timeline lite pack option | M |
| 6 | **SK-098** fanout window miss → forced DB fallback | S–M |
| 7 | Ops doc: forbid sqlLike in prod; recommend Meili/pgroonga | S |

### Later

| # | Work |
|---|------|
| 8 | PERF-13 mute set anti-join for DB TL |
| 9 | PERF-14 public meta cache headers |
| 10 | PERF-16 metrics |

---

## 6. Suggested code patch sketch (SK-097)

```ts
// packMany — replace pollVotes branch
const pollVotesPromise = me
  ? this.pollVotesRepository.findBy({
      noteId: IsOne(noteIds),
      userId: me.id,
    }).then(votes => {
      const map = new Map<string, MiPollVote[]>();
      for (const v of votes) {
        const list = map.get(v.noteId) ?? [];
        list.push(v);
        map.set(v.noteId, list);
      }
      return map;
    })
  : Promise.resolve(new Map<string, MiPollVote[]>());

// pack — replace myVotes line
myVotes: meId ? opts._hint_?.pollVotes?.get(note.id) : undefined,

// populatePoll hint type: myVotes?: MiPollVote[]  (unchanged)
```

Optional micro-opt:

```ts
const choices = poll.choices.map((c, i) => ({
  text: c,
  votes: poll.votes[i],
  isVoted: false,
}));
```

---

## 7. Verification checklist

- [ ] Pack home TL with foreign poll: viewer `isVoted` all false if never voted  
- [ ] Vote then reload TL: correct choice marked without extra N+1 (log SQL)  
- [ ] Hybrid with fanout off: EXPLAIN no longer nested-loop EXISTS on following (after PERF-10)  
- [ ] Scroll deep home with large redis list: no permanent hole (SK-098)  
- [ ] Search with sqlLike disabled / Meili on: p95 acceptable  
- [ ] Client sends `allowPartial: true`  

---

## 8. Methodology (Pass 14)

- Re-read `NoteEntityService.packMany` / `populatePoll` / fanout after `6514330`  
- Compared home vs hybrid DB builders  
- Traced `SearchService` providers  
- Reviewed QueryService mute EXISTS helpers  
- **Did not** run EXPLAIN ANALYZE on live DB or k6  

---

## 9. Key files

| Area | Path |
|------|------|
| Poll pack bug | `packages/backend/src/core/entities/NoteEntityService.ts` |
| Fanout bound | `packages/backend/src/core/FanoutTimelineService.ts` |
| Home TL | `packages/backend/src/server/api/endpoints/notes/timeline.ts` |
| Hybrid TL | `packages/backend/src/server/api/endpoints/notes/hybrid-timeline.ts` |
| Search | `packages/backend/src/core/SearchService.ts` |
| Mute EXISTS | `packages/backend/src/core/QueryService.ts` |
| API cache headers | `packages/backend/src/server/api/ApiServerService.ts` |
| Reactions buffer | `packages/backend/src/core/ReactionsBufferingService.ts` |

---

## 10. Revision history

| Rev | Date | Notes |
|-----|------|--------|
| 0.1 | 2026-07-16 | Pass 14: SK-097…101, PERF-09…16; poll isVoted root cause; hybrid EXISTS; search ILIKE; fanout window hole |

---

## 11. Numbering continuity

| Pass | IDs |
|------|-----|
| 13 | SK-091…096, PERF-01…08 |
| **14** | **SK-097…101, PERF-09…16** |
| Next | SK-102+ |

---

*End of Pass 14. Highest ROI next code change: **SK-097 poll isVoted + me-only vote query**.*
