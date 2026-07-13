# Sharkey Security Audit / Advisory Document (AMD)

| Field | Value |
|-------|--------|
| **Document type** | Local security audit memo (AMD-style findings register) **+ project optimization evaluation** |
| **Target tree** | `/root/Sharkey-work/Sharkey-dev-continue` |
| **Product** | Sharkey `2025.5.2-dev` (Misskey fork) |
| **Audit date** | 2026-07-14 |
| **Remediation status date** | 2026-07-14 |
| **Optimization review date** | 2026-07-14 (multi-pass static code review) |
| **Method** | Static code review only — no live exploitation, no PoC payloads, no load tests |
| **Scope** | Backend API, chat, MFM/CSS rendering, media proxy, federation edges, OAuth/Mastodon glue, auth tokens; **chat performance, WebSocket expansion, escrow crypto, X-algorithm, engineering process** |
| **Out of scope** | Production traffic, third-party deps CVE enumeration, full ActivityPub protocol fuzz, production load benchmarks |
| **Disposition** | **Private local report.** Code P0/P1 remediations are largely in-tree; residual items are design/ops/low severity. Optimization work is **conditionally pass** for internal beta. Prefer responsible disclosure via instance SECURITY.md / upstream for anything still open. |

---

## 0. Executive summary

Sharkey inherits a mature Misskey security baseline (private-IP SSRF guards, SVG not browser-safe, signed ActivityPub inbox, role policies). Local/custom surface area (chat rooms, escrow crypto, MFM advanced styling, channel colors, OAuth, media `/proxy`) produced **multiple real findings** (SK-2026-001 … 042).

### 0.1 Current overall status (2026-07-14)

| Layer | Status |
|-------|--------|
| **Code: high/medium fixable issues (P0/P1)** | **Mostly done** in this tree |
| **Design / privacy / product honesty** | Residual open (e.g. escrow ≠ E2EE) |
| **Ops / deploy configuration** | Operator checklist still required |
| **Dynamic pentest / full regression** | **Not completed** (audit was static) |

**One-line conclusion (security):**  
**“Findings that could be fixed in code (P0/P1) are largely remediated. Security work is not 100% finished: residual design/low items, ops config, and no full dynamic verification.”**

**One-line conclusion (optimization / engineering — see §8):**  
**“Performance and chat architecture investments are sound; security remediations largely landed; overall ~8.1/10 — internal beta OK, public production needs uncommitted fixes committed, escrow honesty, and smoke tests.”**

### 0.2 Remediation commits (this tree)

| Commit | Summary |
|--------|---------|
| `f95ed57` | Chat room live stream membership gate; escrow no longer from `setupPassword` |
| `15b00d8` | AMD P0/P1 batch: SSRF always-on, OAuth stub reject, channel color, invite CSPRNG, room invite blocks, `sw/unregister`, sponsors, federation update-remote-user, storage path, docs |
| `7ba243c` | P1: `fetch-rss` auth, webhook https, poll/chat SQL params, sanitize-html no `style`, frontend `safeCssHexColor` |
| `4eb55e4` | Continue: reaction/hashtag SQL params, MFM clamps, export-emoji moderator, page-push bounds, gateway `API_KEY` in prod, role colors |

**Must verify on deploy:** the above commits (or equivalent) are present in production builds.

### 0.3 Finding counts (original audit)

| Severity | Count (approx.) | Themes |
|----------|-----------------|--------|
| **Critical / High** | 3–4 | Chat WS leak, non-prod SSRF disable, OAuth dummy tokens |
| **Medium** | 15+ | CSS, invite entropy, SQL concat, blocks, escrow, push unregister, SSRF surfaces |
| **Low / Info** | 20+ | Token length, DoS knobs, privacy, misconfig, TODOs |
| **Total IDs** | **SK-2026-001 … 060** | Living document (pass 6: reverse API / inject / tamper) |

### 0.4 Remediation status matrix (code vs residual)

#### Fixed in tree (code verified)

| ID | Topic |
|----|--------|
| **001** | Chat WS stream membership |
| **002** | Private-IP SSRF checks always on |
| **003** | OAuth `client_credentials` rejected |
| **004 / 005 / 030** | Channel / theme / role colors hex-safe |
| **006** | `sanitize-html` drops `style` |
| **008** | Chat invite CSPRNG (`secureRndstr`) |
| **009** | Room invite respects blocks |
| **011** (most) | Poll / chat react / note reaction / hashtag SQL parameterized |
| **012** | `federation/update-remote-user` requires credential |
| **013** | Public `sponsors.forceUpdate` ignored |
| **015** | `fetch-rss` requires login + URL validation |
| **016** (partial→good) | Webhooks require https, no userinfo; socket SSRF still applies |
| **019** (partial) | `page-push` event/var size bounds |
| **022** (partial) | OAuth authorize scheme restricted (not full app allowlist) |
| **026** | Internal storage path traversal guard |
| **028** (partial) | Gateway requires `API_KEY` in production |
| **029** | Escrow config comments aligned |
| **036** | `sw/unregister` requires login; scoped by `userId` |
| **039** | `export-custom-emojis` requireModerator |
| **007** (partial) | MFM `position` ±50; animation duration floor/cap |
| **043** | Invite ignore enforced on join |
| **044** | Re-invite after ignore |
| **045** | Chat unreact membership |
| **046** | Clip addNote visibility / public clip rule |
| **047** | Favorite visibility gate |
| **048** | Chat reaction dedupe / race |
| **049** | X-algo endpoint gate + fallback default |
| **051** | Import APIs require drive file ownership |
| **052** | Private Flash visibility on show/like |
| **053** | Admin emoji only own/unowned drive files |
| **054** | Meili filter/sort: escape + order enum + host pattern |
| **057** | WS `serverStats` gated by `enableServerMachineStats` |
| **058** | WS `queueStats` requires login + moderator |
| **059** | WS auth via `Sec-WebSocket-Protocol` (no `?i=` in modern client) |

#### Still open / residual (not “all clear”)

| ID | Why still open |
|----|----------------|
| **010** | Escrow is operator-readable at-rest crypto, **not** E2EE — product/UX honesty + optional pack-time viewer binding |
| **014** | `/proxy` remains intentional outbound fetch surface (guards on; abuse residual) |
| **016** | Webhooks still call out to user URLs (by design); private-IP blocked at socket |
| **017 / 018** | Short native token; some ID schemes use `Math.random` |
| **020** | Shared-access / miauth high-privilege grants (feature risk) |
| **021** | `reset-db` if `NODE_ENV=test` on a public host (ops) |
| **022** | OAuth redirect not full registered-app allowlist |
| **023–025** | Enumeration / CORS (low or intentional) |
| **031** | AiScript sandbox dependency |
| **032** | WS reconnect rate-limit TODO |
| **033** | Encrypted chat not searchable by plaintext |
| **037–038** | Telegram bot token in URL logs; translator third-party privacy |
| **007** residual | MFM UI abuse (scale/animation/phishing) still possible within clamps |
| **046** residual | Making a private clip public does not re-scan already-attached notes |
| **050** | Site mod can mute/rate-limit any room (open-ops privilege — skip for product) |
| **055** | ZIP extract zip-slip residual via `slacc` (L–M; library claims path-safe — residual) |
| **056** | `app/create` free permission strings (L, accepted design) |

| **060** | ~~Public API catalog~~ **Mitigated** — `/api.json` + catalog endpoints require login |

#### Ops-only (not closed by code alone)

- [ ] Public nodes: `NODE_ENV=production`
- [ ] Dedicated strong `chatEscrowSecret` / `CHAT_ESCROW_SECRET`
- [ ] `reset-db` unreachable on internet-facing instances
- [ ] x-algorithm gateway not public without `API_KEY`
- [ ] Smoke: private IP via `/proxy` and authenticated `fetch-rss` fails closed

---

## 1. Findings register

IDs are local (`SK-YYYY-NNN`). Severity uses: **C**ritical / **H**igh / **M**edium / **L**ow / **I**nfo.

---

### SK-2026-001 — Chat room WebSocket live stream without membership (FIXED in tree)

| | |
|--|--|
| **Severity** | **H** (was H; fixed) |
| **CWE** | CWE-862 Missing Authorization |
| **Status** | Fixed in `f95ed57` |
| **Components** | `packages/backend/src/server/api/stream/channels/chat-room.ts` |

**Description**  
Prior to the fix, any authenticated user could open channel `chatRoom` with an arbitrary `roomId` and subscribe to `chatRoomStream:${roomId}`, receiving live messages without being a member.

**Fix summary**  
Subscribe only when `hasPermissionToViewRoomTimeline` (member or site moderator). Read receipts gated to actual members.

**Residual**  
Deployments without `f95ed57` remain vulnerable. Confirm production revision.

---

### SK-2026-002 — Private-IP SSRF validation only when `NODE_ENV=production`

| | |
|--|--|
| **Severity** | **H** (if mis-deployed) / **M** (dev-only) |
| **CWE** | CWE-918 Server-Side Request Forgery |
| **Status** | **Fixed in tree** — `validateSocketConnect` always runs (not only production) |
| **Components** | `packages/backend/src/core/HttpRequestService.ts` (`HttpRequestServiceAgent` / `HttpsRequestServiceAgent`) |

**Description**  
`validateSocketConnect` (blocks non-unicast / non-allowlisted private nets) runs **only** when `NODE_ENV === 'production'`. Development, staging mislabeled as non-production, or `NODE_ENV=test` skips the socket-level private IP kill.

**Attack surface (user-influenced URLs)**  

| Entry | Auth | Notes |
|-------|------|--------|
| `GET /proxy/:url*` | Rate limit | Media proxy |
| `fetch-rss` | **None** | Arbitrary RSS URL |
| `fetch-external-resources` | Credential | JSON + hash check |
| `drive/files/upload-from-url` | Credential | Server-side download |
| URL preview `/url` | Config-dependent | Summaly |
| User / system webhooks | Credential | Deliver processor uses `httpRequestService.send` |
| ActivityPub resolve (`ap/show`, federation) | Varies | Remote fetch |

**Impact**  
Probe localhost, RFC1918, link-local, cloud metadata (`169.254.169.254`) when SSRF guards are off.

**Remediation**  
1. Always enforce private-IP checks; use config allowlist only.  
2. Fail closed if `NODE_ENV` is not production in internet-facing deploys.  
3. Harden unauthenticated fetch endpoints (`fetch-rss`) with host allowlists / stricter limits.

---

### SK-2026-003 — OAuth `client_credentials` returns random non-persisted Bearer token

| | |
|--|--|
| **Severity** | **M–H** (protocol / client trust) |
| **CWE** | CWE-287 Improper Authentication |
| **Status** | **Fixed in tree** — `client_credentials` returns `unsupported_grant_type` |
| **Components** | `packages/backend/src/server/oauth/OAuth2ProviderService.ts` |

**Description**  
```ts
if (body.grant_type === 'client_credentials') {
  return { access_token: uuid(), token_type: 'Bearer', scope: 'read', ... };
}
```  
Token is a fresh UUID **not stored** in `access_tokens`. Legitimate API auth will reject it, but:

- Clients/libraries may treat HTTP 200 as successful app-only auth.  
- Confuses security scanners and third-party apps.  
- Combined with other bugs could mask failed auth paths.

**Remediation**  
Return `400` / `unsupported_grant_type`, or implement real client credentials with DB-backed tokens and scoped permissions.

---

### SK-2026-004 — Channel `color` unsanitized → CSS injection on notes

| | |
|--|--|
| **Severity** | **M** |
| **CWE** | CWE-79 (CSS injection) / CWE-20 |
| **Status** | **Fixed in tree** — API hex-only; frontend `safeCssHexColor` on note/post channel bars + instance ticker themeColor. |
| **Components** | Backend: `channels/create.ts`, `channels/update.ts`. Frontend: `MkNote.vue`, `SkNote.vue`, `MkNoteSub.vue`, `MkPostForm.vue` — `:style="{ background: note.channel.color }"` |

**Description**  
Any user who can create/update a channel sets `color` freely (≤16 chars). Value is applied as CSS `background` on note chrome.

**Examples that fit length**  
`url(//e.co)`, `red;opacity:0`, other browser-accepted `background` tokens.

**Impact**  
UI spoofing; possible browser fetch of attacker URL when opening notes in that channel (client-side tracking / limited “SSRF from browser”). Not full script XSS via this binding alone.

**Remediation**  
Server + client: allow only `#RGB` / `#RRGGBB`. Reject otherwise; default `#86b300`.

---

### SK-2026-005 — Instance `themeColor` / remote instance theme in CSS gradients

| | |
|--|--|
| **Severity** | **M** (federation) / **L** (local admin) |
| **CWE** | CWE-79 |
| **Status** | **Fixed in tree** — `safeCssHexColor` on Mk/Sk InstanceTicker |
| **Components** | `MkInstanceTicker.vue` / `SkInstanceTicker.vue` |

**Description**  
Remote instances’ theme colors are interpolated into CSS without strict hex validation.

**Remediation**  
Same hex whitelist; strip non-matching remote values.

---

### SK-2026-006 — `sanitize-html` allows `style` on all tags (admin-controlled HTML)

| | |
|--|--|
| **Severity** | **M** (requires admin content) |
| **CWE** | CWE-79 |
| **Status** | **Fixed in tree** — global `style` attribute removed from allowlist |
| **Components** | `packages/frontend/src/utility/sanitize-html.ts`; consumers: about page, visitor dashboard, signup rules |

**Description**  
```ts
'*': (...).concat(['style'])
```  
plus `img`/`audio`/`video`. Instance description / server rules rendered via `v-html="sanitizeHtml(...)"`.

**Impact**  
Stored CSS injection for all visitors if admin account or meta is compromised; layout hijack, tracking via `url()`, UI redress.

**Remediation**  
Remove global `style`; use allowlist of tags only; prefer MFM/plain text for rules.

---

### SK-2026-007 — MFM style assembly (notes + chat + profile) — intentional CSS with incomplete hardening

| | |
|--|--|
| **Severity** | **L–M** (abuse / UX / phishing) |
| **CWE** | CWE-79 (limited), CWE-400 |
| **Status** | **Partially fixed** — position clamped ±50em; animation duration floor 0.05s / cap 120s |
| **Components** | `packages/frontend/src/components/global/MkMfm.ts` |

**Description**  
Inline comment admits CSS injection via `token.props.args`. Current mitigations:

- `validColor` → `/^[0-9a-f]{3,6}$/i`  
- `validTime` → `/^\-?[0-9.]+s$/`  
- `border.style` enum  
- mfm-js rejects args containing `;` as function args (treated as plain text)

**Still abusive (any poster / chat member)**  

| Feature | Risk |
|---------|------|
| `$[position.x=N,y=M]` | No clamp → huge offsets, overlay / mis-click |
| `$[scale.x=5,y=5]` | Large scale (clamped ±5 only) |
| Fast animations (`speed=0.001s`) | CPU / vestibular harm |
| Same fg/bg colors | Hidden phishing links |
| `$[followmouse]` | Pointer tracking annoyance |
| Math (KaTeX `trust:false`) | Render cost DoS |

**Chat** uses the same `Mfm` component (`pages/chat/XMessage.vue`, room announcements) with full advanced MFM — not plain text.

**Remediation**  
Clamp position; rate-limit animation; optional “simple MFM” for chat; document abuse policy.

---

### SK-2026-008 — Chat invite codes use `Math.random()`

| | |
|--|--|
| **Severity** | **M** |
| **CWE** | CWE-330 / CWE-338 |
| **Status** | **Fixed in tree** — uses `secureRndstr` / CSPRNG |
| **Components** | `ChatService.generateInviteCode` |

**Description**  
16-char alphabet via `Math.random()` for room `inviteCode`. Used by `join-by-code` / link join policy.

**Impact**  
Weaker than CSPRNG; theoretical prediction / reduced entropy vs `crypto.randomInt`.

**Remediation**  
Use `secureRndstr` / `crypto.randomInt`; rate-limit join-by-code failures.

---

### SK-2026-009 — Room invitation ignores user blocks

| | |
|--|--|
| **Severity** | **M** |
| **CWE** | CWE-862 / business logic |
| **Status** | **Fixed in tree** — block checks both directions before invite + notify |
| **Components** | `ChatService.createRoomInvitation` |

**Description**  
DM path calls `userBlockingService.checkBlocked`; room invitations do not. Blocked users can still invite and fire `chatRoomInvitationReceived` notifications.

**Remediation**  
Mirror DM block checks both directions before insert + notify.

---

### SK-2026-010 — Chat escrow is operator-readable “encryption at rest”, not E2EE

| | |
|--|--|
| **Severity** | **M** (privacy / trust) |
| **CWE** | CWE-311 / CWE-654 |
| **Components** | `ChatCryptoService.ts`, admin `admin/chat-escrow.ts`, pack `ChatEntityService.revealBody` |

**Description**  
AES-256-GCM with server-held master secrets. Pack always reveals plaintext for authorized API paths. Moderators can view room timelines by design.

`f95ed57` stopped deriving keys from `setupPassword` (good). Config comments may still claim setupPassword default — **doc drift**.

**Impact**  
Admin, DB+key theft, or buggy new pack call without ACL → full chat plaintext. Users may believe messages are peer E2EE.

**Remediation**  
Honest UX (“escrow / operator can read”); require dedicated `chatEscrowSecret`; optional `viewerId` check inside `revealForPack`.

---

### SK-2026-011 — SQL string concatenation (poll votes, chat reactions, hashtags)

| | |
|--|--|
| **Severity** | **M** (pattern) / **L** (current exploitability) |
| **CWE** | CWE-89 |
| **Status** | **Mostly fixed** — poll, chat reactions, note reactions, hashtag array_* parameterized |
| **Status** | **Partially fixed** — poll vote `noteId` parameterized; chat reaction array_append/remove parameterized. HashtagService / ReactionService patterns may remain. |
| **Components** | |

**Poll**  
```sql
UPDATE poll SET votes[${index}] = ... WHERE "noteId" = '${poll.noteId}'
```  
(`notes/polls/vote.ts`, `PollService.ts`)  
`noteId` from DB; `choice` bounds-checked via `poll.choices[choice]`. ID format `^[a-zA-Z0-9]+$`.

**Chat react / unreact**  
```sql
array_append("reactions", '${userId}/${reaction}')
array_remove("reactions", '${userId}/${reaction}')
```  
userId alphanumeric; reaction normalized / custom emoji `\w+`.

**HashtagService / ReactionService** similar `array_append` patterns with user ids.

**Impact**  
Not trivially injectable today; fragile if validators change.

**Remediation**  
Parameterized queries / TypeORM parameter binding exclusively.

---

### SK-2026-012 — Unauthenticated `federation/update-remote-user` forces remote re-fetch

| | |
|--|--|
| **Severity** | **M** |
| **CWE** | CWE-770 / amplification |
| **Status** | **Fixed in tree** — requires credential (`write:account`) |
| **Components** | `endpoints/federation/update-remote-user.ts` |

**Description**  
Anyone can trigger `apPersonService.updatePerson(uri)` for a known remote user id (bucket limit 10 then 4/s). Causes outbound federation traffic / remote load.

**Remediation**  
Require credential or moderator; tighter global rate limit; CAPTCHA for anonymous.

---

### SK-2026-013 — `sponsors` `forceUpdate` unauthenticated cache bust (DoS)

| | |
|--|--|
| **Severity** | **L–M** |
| **CWE** | CWE-770 |
| **Status** | **Fixed in tree** — public `forceUpdate` ignored (always false) |
| **Components** | `endpoints/sponsors.ts` |

**Description**  
Anonymous callers can set `forceUpdate: true` (2 req/s) to force sponsor JSON re-fetch.

**Remediation**  
Staff-only or remove `forceUpdate` from public API.

---

### SK-2026-014 — Media `/proxy` open redirector-style fetch (authenticated rate-limited SSRF surface)

| | |
|--|--|
| **Severity** | **M** (depends on env guards) |
| **CWE** | CWE-918 |
| **Components** | `FileServerService` `/proxy/:url*` |

**Description**  
Fetches remote URL content (with User-Agent check against recursive Misskey UA). Relies on HttpRequestService private-IP guards (see SK-2026-002). Used for avatars/emoji transforms; also abuse for bandwidth / scanning when guards fail.

**Remediation**  
Same as SSRF hardening; consider signed proxy URLs; stricter host allowlist for non-media types.

---

### SK-2026-015 — `fetch-rss` unauthenticated outbound HTTP

| | |
|--|--|
| **Severity** | **M** |
| **CWE** | CWE-918 |
| **Status** | **Fixed in tree** — requires credential; URL validated via `isValidUrl` |
| **Components** | `endpoints/fetch-rss.ts` |

**Description**  
Server fetches attacker-supplied URL and parses feed. Amplifies SSRF when private-IP checks off; even in production, probes public IPs / port scan via timing/errors.

**Remediation**  
Auth or instance setting; block non-http(s); optional domain allowlist; lower limits.

---

### SK-2026-016 — User webhooks: arbitrary deliver URL (SSRF as authenticated user)

| | |
|--|--|
| **Severity** | **M** |
| **CWE** | CWE-918 |
| **Status** | **Partially fixed** — create/update require valid https URL without userinfo; private-IP still blocked at socket layer. |
| **Components** | `i/webhooks/create.ts`, `i/webhooks/update.ts` |

**Description**  
Logged-in users register webhook URLs; instance POSTs events there. Classic “SSRF with user auth” (metadata, internal HTTP if guards fail).

**Remediation**  
Validate URL (https only, public unicast, block metadata ranges always); optional admin approval.

---

### SK-2026-017 — Native user token length 16

| | |
|--|--|
| **Severity** | **L** |
| **CWE** | CWE-330 |
| **Components** | `misc/token.ts` — `secureRndstr(16)`; `isNativeUserToken = length === 16` |

**Description**  
~95 bits if full charset — acceptable but short vs modern 32+ tokens. Session theft impact is full account.

**Remediation**  
Lengthen native tokens (migration careful because length discriminates native vs app tokens).

---

### SK-2026-018 — ID generators use `Math.random` in some schemes

| | |
|--|--|
| **Severity** | **L** |
| **CWE** | CWE-330 |
| **Components** | `misc/id/meid.ts`, `meidg.ts`, `object-id.ts`; local config uses `id: 'aidx'` |

**Description**  
Non-crypto PRNG in ID tails. Affects unpredictability of resource IDs if those schemes are used.

**Remediation**  
Prefer CSPRNG for all ID random parts.

---

### SK-2026-019 — `page-push` arbitrary events to page owner stream

| | |
|--|--|
| **Severity** | **L** |
| **CWE** | CWE-862 (logic) |
| **Status** | **Partially fixed** — event name truncated; var JSON size capped |
| **Components** | `endpoints/page-push.ts` |

**Description**  
Any authenticated user pushes `pageEvent` with arbitrary `event`/`var` to page owner’s main stream (120/min). Harassment / AiScript interaction abuse.

**Remediation**  
Verify page interaction policy; rate-limit per target; schema-validate `var`.

---

### SK-2026-020 — Shared-access / miauth tokens can carry admin `rank` + broad `permission`

| | |
|--|--|
| **Severity** | **L–M** (feature risk) |
| **CWE** | CWE-269 |
| **Components** | `miauth/gen-token.ts`, `i/shared-access/login.ts`, `RoleService` rank demotion |

**Description**  
Admin can mint token with `rank: 'admin'` and permissions, grant to grantees; grantee obtains full token string via `shared-access/login`. Rank demotes privileges when set to `user`/`mod` but **cannot elevate** non-admins. Risk is intentional privilege sharing + token exfiltration.

**Remediation**  
Audit UX warnings; force expiry; disallow `rank: admin` on shared grants; scope permissions tightly.

**Note**  
`ApiCallService` admin checks use `getUserRoles`, which **does** apply rank demotion — good. Root user id bypasses admin checks regardless of rank.

---

### SK-2026-021 — `reset-db` exposed when `NODE_ENV=test`

| | |
|--|--|
| **Severity** | **H** if test mode on internet; **I** otherwise |
| **CWE** | CWE-284 |
| **Components** | `endpoints/reset-db.ts` |

**Description**  
Unauthenticated endpoint flushes Redis + DB when `NODE_ENV === 'test'`.

**Remediation**  
Never expose test mode publicly; bind localhost only in CI.

---

### SK-2026-022 — OAuth authorize `client_id` base64 URL open redirect pattern

| | |
|--|--|
| **Severity** | **L–M** |
| **CWE** | CWE-601 |
| **Status** | **Partially fixed** — only `http:`/`https:` schemes accepted after base64 decode; still not full app registration allowlist |
| **Components** | `OAuth2ProviderService` GET `/authorize` |

**Description**  
```ts
const redirectUri = new URL(Buffer.from(request.query.client_id, 'base64').toString());
return reply.redirect(redirectUri.toString());
```  
Redirects to decoded `client_id` without strict app registration check in this handler.

**Impact**  
Phishing open redirect if this path is reachable and users trust the host.

**Remediation**  
Validate against registered OAuth apps / allowlisted redirect URIs only.

---

### SK-2026-023 — Password reset: username+email enumeration timing / silent fail

| | |
|--|--|
| **Severity** | **I–L** |
| **CWE** | CWE-203 |
| **Components** | `request-reset-password.ts` |

**Description**  
Returns empty success for missing user / wrong email (good), but differential timing / email send side-channels may remain. Token is 64-char CSPRNG; 30-minute expiry — good.

**Remediation**  
Constant-time path; generic response always; rate-limit by IP+username.

---

### SK-2026-024 — Sign-in user existence observable (404 vs flow)

| | |
|--|--|
| **Severity** | **L** |
| **CWE** | CWE-203 |
| **Components** | `SigninApiService` — `assertClientUser` deletedError 404 |

**Description**  
Unknown users may differ from known users in response, enabling username enumeration (rate-limited).

---

### SK-2026-025 — CORS `Access-Control-Allow-Origin: *` on API utility / files / AP

| | |
|--|--|
| **Severity** | **I** (often intentional for public APIs) |
| **CWE** | CWE-942 |
| **Components** | `ServerUtilityService.addCORS`, FileServer, ActivityPub GET |

**Description**  
Public federation/media APIs use `*`. Sign-in uses origin-locked CORS with credentials — better.

**Remediation**  
Ensure credentialed endpoints never pair with `*`.

---

### SK-2026-026 — `InternalStorageService.resolvePath` no path traversal guard

| | |
|--|--|
| **Severity** | **L** (keys are UUID-generated today) |
| **CWE** | CWE-22 |
| **Status** | **Fixed in tree** — reject `..`, separators, and escape from media root |
| **Components** | `InternalStorageService.resolvePath(key)` |

**Description**  
If a key ever contains `../`, path could escape media root. Current writers use `randomUUID()` keys.

**Remediation**  
Reject keys matching `[/\\]` or not matching UUID pattern; `path.resolve` + ensure prefix under media root.

---

### SK-2026-027 — SVG treated as unsafe for browser display (positive control)

| | |
|--|--|
| **Severity** | **I** (hardening note) |
| **Components** | `const.ts` FILE_TYPE_BROWSERSAFE excludes SVG; drive converts SVG |

Documented intentional XSS prevention for SVG. Keep tests for regressions.

---

### SK-2026-028 — x-algorithm gateway optional API key + DB credentials in example

| | |
|--|--|
| **Severity** | **M** if exposed |
| **CWE** | CWE-306 / CWE-798 |
| **Status** | **Partially fixed** — production requires API_KEY env |
| **Components** | `services/x-algorithm-gateway/server.mjs` |

**Description**  
`API_KEY` optional; default PG password in source; ranks notes via raw SQL with parameterized userId (good) but entire service is privileged to DB.

**Remediation**  
Require API key; no default passwords; bind loopback; network policy.

---

### SK-2026-029 — Escrow / setupPassword documentation vs code mismatch

| | |
|--|--|
| **Severity** | **L** |
| **Status** | **Fixed in tree** — config comments aligned; no setupPassword fallback in code |
| **Components** | `.config/default.yml` comments vs `ChatCryptoService.listKeyMaterials` |

**Description**  
Comments may still say fallback to `setupPassword`; code after `f95ed57` uses only `chatEscrowSecret` / env / meta keys.

**Remediation**  
Align docs; warn operators who relied on old behavior.

---

### SK-2026-030 — Role color CSS custom property injection (admin)

| | |
|--|--|
| **Severity** | **L** |
| **Components** | User profile roles `:style="{ '--color': role.color }"` |

Admin-defined role colors without hex validation.

---

### SK-2026-031 — Flash / Page AiScript scripts stored and executed client-side

| | |
|--|--|
| **Severity** | **L–M** (sandbox dependent) |
| **CWE** | CWE-94 (if sandbox breaks) |
| **Status** | **Fixed in tree** — `safeCssHexColor` on role chips/previews |
| **Components** | `flash/create`, `pages/create` — free `script` strings |

**Description**  
User-supplied AiScript. Security depends on AiScript sandbox isolation (not fully re-audited here). Historical Misskey AiScript issues should be tracked upstream.

**Remediation**  
Keep sandbox updated; permission prompts; limit public flash capabilities.

---

### SK-2026-032 — WebSocket connect/disconnect not fully rate-limited (TODO)

| | |
|--|--|
| **Severity** | **L** |
| **Components** | `stream/Connection.ts` — `TODO rate-limit connect/disconnect cycles` |

Resource exhaustion via reconnect storms.

---

### SK-2026-033 — Chat search only matches plaintext `message.text`

| | |
|--|--|
| **Severity** | **I** (functional / privacy side-effect) |
| **Components** | `ChatService.searchMessages` — `LOWER(message.text) LIKE` |

Escrow-encrypted messages store null text → invisible to search (not an auth bypass; operational surprise). Ciphertext not searchable without server-side decrypt index.

---

### SK-2026-034 — `ap/get` admin-only federation fetch (intentional powerful SSRF-ish)

| | |
|--|--|
| **Severity** | **I** for admin abuse |
| **Components** | `endpoints/ap/get.ts` — `requireAdmin` |

Admins can resolve arbitrary URIs (expand collections). High privilege by design; protect admin accounts.

---

### SK-2026-035 — ActivityPub inbox signature + digest verification (positive)

| | |
|--|--|
| **Severity** | **I** |
| **Components** | `ActivityPubServerService` |

Host header, digest SHA-256, signature verify with key refresh — solid baseline. Continue regression tests for signature bypass classes known in Fediverse history.

---

### SK-2026-036 — Unauthenticated `sw/unregister` deletes push subscription by endpoint only

| | |
|--|--|
| **Severity** | **M** |
| **CWE** | CWE-862 / CWE-306 |
| **Status** | **Fixed in tree** — requires credential; delete scoped by `userId` + endpoint |
| **Components** | `endpoints/sw/unregister.ts` |

**Description**  
```ts
requireCredential: false
// ...
await this.swSubscriptionsRepository.delete({
  ...(me ? { userId: me.id } : {}),
  endpoint: ps.endpoint,
});
```  
Without auth, delete filter is **only** `endpoint`. Anyone who learns or guesses a Web Push `endpoint` URL can unregister that subscription (DoS against push notifications for that device/user).

**Remediation**  
Require credential; always scope delete by `userId`; or require proof (endpoint secret / subscription auth key).

---

### SK-2026-037 — Telegram sticker import embeds bot token in fetch URLs

| | |
|--|--|
| **Severity** | **L–M** |
| **CWE** | CWE-532 / CWE-598 |
| **Components** | `ChatStickerService.ts` — `https://api.telegram.org/file/bot${token}/...` |

**Description**  
Bot token appears in URL path for `getFile` downloads and drive `uploadFromUrl`. Access logs, proxy logs, or error telemetry that store full URLs may leak `TELEGRAM_BOT_TOKEN`, enabling sticker spam / Telegram API abuse as the bot.

Uses raw `fetch()` (not always the guarded agent path for Telegram API host — fixed public host, low SSRF).

**Remediation**  
Avoid logging full Telegram URLs; prefer header-based auth if API allows; rotate token if logs exposed; restrict import to trusted roles.

---

### SK-2026-038 — Translator sends note text to third-party (DeepL/Libre) with shared instance keys

| | |
|--|--|
| **Severity** | **L** (privacy) |
| **CWE** | CWE-359 |
| **Components** | `endpoints/notes/translate.ts` |

**Description**  
Users with `canUseTranslator` send note body to configured DeepL/Libre endpoints using **instance** API keys. Visibility is checked (good). Privacy risk: third-party processors see private/followers-only note text if policy allows those users to translate.

**Remediation**  
Document data sharing; optional local-only translator; restrict translator policy carefully.

---

### SK-2026-039 — `export-custom-emojis` any logged-in user can queue full emoji export

| | |
|--|--|
| **Severity** | **L** |
| **CWE** | CWE-770 |
| **Status** | **Fixed in tree** — requireModerator |
| **Components** | `endpoints/export-custom-emojis.ts` — `secure: true`, 1/hour |

**Description**  
Any authenticated user triggers server-side custom emoji pack export job (resource cost / bulk download of instance assets). Rate-limited to 1/hour — mitigates but not staff-only.

**Remediation**  
Moderator-only if emoji pack is sensitive/large.

---

### SK-2026-040 — Admin API checks use role flags but root user bypasses

| | |
|--|--|
| **Severity** | **I** (design) |
| **Components** | `ApiCallService` — `rootUserId !== user?.id` skips role checks |

Root account is superuser regardless of token rank demotion on some paths. Protect root credentials strongly; prefer break-glass use only.

---

### SK-2026-041 — Public user list membership enumeration when `isPublic`

| | |
|--|--|
| **Severity** | **I** |
| **Components** | `users/lists/show`, `get-memberships` — unauthenticated for public lists |

By design for public lists; ensure private lists always 404 for non-owners (code checks `isPublic` — OK).

---

### SK-2026-042 — `deeplFreeInstance` URL fully admin-controlled outbound target

| | |
|--|--|
| **Severity** | **L** (admin SSRF) |
| **Components** | `notes/translate.ts` — `deeplFreeInstance` as POST endpoint |

Admin-set URL receives note text + instance may send DeepL-shaped traffic. Malicious/compromised admin can point at internal services (subject to HttpRequestService guards).

---

## 1b. Continued screening (2026-07-14 pass 2) — logic / auth / integrity

Second static pass focused on **business logic**, IDOR-ish gaps, and integrity bugs after P0/P1 remediations. No live exploitation.

---

### SK-2026-043 — Ignored room invitations still allow join (logic bug)

| | |
|--|--|
| **Severity** | **M** |
| **CWE** | CWE-863 Incorrect Authorization / business logic |
| **Status** | **Fixed in tree** — join requires invitation with `ignored = false` |
| **Components** | `ChatService.joinToRoom` (invite policy branch); `ignoreRoomInvitation` |

**Description**  
Inbox listing filters `invitation.ignored = FALSE`, so ignored invites disappear from UI. Prior bug: join still accepted ignored rows.

**Fix summary**  
`joinToRoom` invite branch: `if (invitation == null || invitation.ignored) throw 'no invitation'`.

---

### SK-2026-044 — Cannot re-invite after ignore (`already invited` on ignored row)

| | |
|--|--|
| **Severity** | **L** (logic / UX) |
| **CWE** | CWE-754 |
| **Status** | **Fixed in tree** — ignored row re-issued (`ignored=false` + notify) |
| **Components** | `ChatService.createRoomInvitation` |

**Description**  
Prior: any existing invitation row blocked re-invite, including ignored ones.

**Fix summary**  
Only non-ignored existing invites throw `already invited`. Ignored rows are un-ignored and re-notified.

---

### SK-2026-045 — Chat `unreact` skips membership / party checks (logic / info leak surface)

| | |
|--|--|
| **Severity** | **L–M** |
| **CWE** | CWE-862 |
| **Status** | **Fixed in tree** — DM party / room membership; publish only if token removed |
| **Components** | `ChatService.unreact` |

**Description**  
Prior: `unreact` skipped membership checks and always published stream events.

**Fix summary**  
Mirror `react` auth; `array_remove` with `RETURNING` so events fire only when a self-token was present.

---

### SK-2026-046 — Clip private notes into public clip (integrity / metadata)

| | |
|--|--|
| **Severity** | **L–M** |
| **CWE** | CWE-200 / CWE-862 (partial) |
| **Status** | **Fixed in tree** — visibility on add; public clips reject non-public notes |
| **Components** | `ClipService.addNote` |

**Description**  
Prior: `addNote` only checked clip ownership + note FK.

**Fix summary**  
Load note; `checkNoteVisibilityAsync` for non-authors; if `clip.isPublic`, require `note.visibility === 'public'`.

**Residual**  
Making an existing private clip public with private notes already attached is not re-scanned (optional follow-up on `update`).

---

### SK-2026-047 — Favorite private notes without explicit visibility gate at API layer

| | |
|--|--|
| **Severity** | **L** |
| **CWE** | CWE-862 (soft) |
| **Status** | **Fixed in tree** — `checkNoteVisibilityAsync` before insert |
| **Components** | `notes/favorites/create.ts` |

**Description**  
Prior: favorites only loaded note by id without visibility gate.

**Fix summary**  
Same pattern as `ReactionService.create` for non-author favorites.

---

### SK-2026-048 — Chat reaction race: duplicate tokens / count limit bypass

| | |
|--|--|
| **Severity** | **L** |
| **CWE** | CWE-362 |
| **Status** | **Fixed in tree** — reject existing token; conditional append under MAX |
| **Components** | `ChatService.react` |

**Description**  
Prior: concurrent reacts could duplicate tokens and exceed MAX.

**Fix summary**  
In-memory reject if token present; SQL `NOT ($1 = ANY(reactions)) AND cardinality < MAX` with `RETURNING`.

---

### SK-2026-049 — X Algorithm timeline black-hole when enabled without endpoint (logic bug; WIP fix in working tree)

| | |
|--|--|
| **Severity** | **M** (availability / product) |
| **CWE** | CWE-754 |
| **Status** | **Fixed in tree** — endpoint required for `isEnabled`; default fallback true |
| **Components** | `XAlgorithmService.isEnabled` / `getTimelineNoteIds`; `Meta.defaultXAlgorithmConfig` |

**Description**  
Prior: enabled without mixer URL could empty or error home/hybrid timelines.

**Fix summary**  
`isEnabled()` true only with endpoint; `fallbackToSharkeyTimeline` defaults true; admin form default aligned.

---

### SK-2026-050 — Site moderator can set room `isMutedAll` / rate limit without being owner

| | |
|--|--|
| **Severity** | **I–L** (by design / open moderation) |
| **Components** | `chat/rooms/update.ts` — only `joinPolicy` restricted to owner |

**Description**  
`canModerateRoom` includes **site moderators**. They can change announcement, mute-all, rate limits for any room. Treat as intentional staff power for open-moderation instances, not a product defect unless policy says otherwise.

---

## 1c. Pass 3 (2026-07-14) — real vuln focus (skip open-ops design)

Screening focused on **IDOR, authz bypass, secret exposure** — not “site mods can moderate” style open-ops features.

---

### SK-2026-051 — Import APIs: no Drive file ownership check (IDOR / cross-user file read)

| | |
|--|--|
| **Severity** | **H** |
| **CWE** | CWE-639 / CWE-862 |
| **Status** | **Fixed in tree** — all listed import endpoints use `findOneBy({ id, userId: me.id })` |
| **Components** | `i/import-following.ts`, `i/import-blocking.ts`, `i/import-muting.ts`, `i/import-user-lists.ts`, `i/import-antennas.ts`, `i/import-notes.ts` |

**Description**  
Prior: imports loaded any drive file by id and processed it as the caller.

**Fix summary**  
Query scoped to caller ownership; missing/other-user file → `NO_SUCH_FILE`.

---

### SK-2026-052 — Private Flash (`visibility: private`) readable by anyone with `flashId`

| | |
|--|--|
| **Severity** | **M** |
| **CWE** | CWE-639 / CWE-284 |
| **Status** | **Fixed in tree** — private only for owner on show; like rejects private |
| **Components** | `flash/show.ts`, `flash/like.ts` (`FlashService.featured` already public-only) |

**Description**  
Prior: `flash/show` packed private scripts for anyone with `flashId`.

**Fix summary**  
`visibility === 'private'` → only owner on show; like treats private as not found.

---

### SK-2026-053 — Admin emoji add detaches any drive file from its owner (staff-only)

| | |
|--|--|
| **Severity** | **L** (requires admin/mod emoji rights) |
| **CWE** | CWE-862 |
| **Status** | **Fixed in tree** — only `userId === me.id` or already-unowned files |
| **Components** | `admin/emoji/add.ts` |

**Description**  
Prior: staff could detach any user’s drive file into emoji storage.

**Fix summary**  
Reject files owned by others; clear ownership only on own files.

---

## 1d. Pass 4 (2026-07-14) — injection / crypto / reverse-engineering surface

Focus: **SQL/Meili filter injection**, command/eval, unsafe deserialize, path/zip, crypto misuse.  
Open-ops design (public TL, mod powers, escrow) not treated as defects.

### Injection scan summary

| Class | Result |
|-------|--------|
| Classic SQL concat of user text | Mostly parameterized; poll `votes[index]` integer-bounded |
| SQL LIKE | `sqlLikeEscape` on note search |
| ORDER BY free string | `users` sort **enum-switched** (safe) |
| Meili filter/sort | **SK-054** when provider is meilisearch |
| Command injection | No user-driven `child_process` + input |
| `eval` / `new Function` | Not found on user input in backend src |
| Prototype pollution | AP header copy strips `__proto__` |
| JSON.parse on imports | Archive data only; no code exec |
| XSS | sanitize-html (SK-006); MFM color/time validated |

---

### SK-2026-054 — MeiliSearch filter/sort injection (`compileValue` unescaped + free `order`/`host`)

| | |
|--|--|
| **Severity** | **M–H** **only if** `fulltextSearch.provider = 'meilisearch'` |
| **CWE** | CWE-74 / CWE-943 |
| **Status** | **Fixed in tree** — escape + `order` enum + host pattern |
| **Components** | `core/SearchService.ts`; `notes/search.ts` |

**Description**  
Prior: `compileValue` unescaped strings; free `order`/`host` into Meili filter/sort.

**Fix summary**  
1. Escape `\` and `'` in `compileValue`; strip control chars.  
2. `order` API enum `asc`|`desc`; service `normalizeMeiliOrder`.  
3. `host` pattern `^(\.|[a-zA-Z0-9._:-]{1,253})$` + service `normalizeMeiliHost`.

---

### SK-2026-055 — ZIP extract via `slacc` (zip-slip residual)

| | |
|--|--|
| **Severity** | **L–M** (library-dependent; not fully confirmed) |
| **CWE** | CWE-22 |
| **Status** | **Open / residual** |
| **Components** | `ImportNotesProcessorService`, `ImportCustomEmojisProcessorService` — `ZipReader.withDestinationPath(...).viaBuffer(...)` |

User ZIP extracted by native `slacc`. If entries with `../` are not rejected, zip-slip could write outside the temp dir under the worker user. Code then reads fixed subpaths; slip is the residual concern.

**Remediation**  
Confirm `slacc` path sanitization; or use extract-to-prefix with explicit rejection of `..` / absolute paths.

---

### SK-2026-056 — Unauthenticated `app/create` arbitrary permission strings

| | |
|--|--|
| **Severity** | **L** (Misskey app model) |
| **CWE** | CWE-862 (soft / phishing) |
| **Status** | **Accepted design** for open instances unless you want stricter apps |
| **Components** | `app/create.ts` — `requireCredential: false`, free `permission[]` |

Tokens still require user `auth/accept` (secure). Risk is social engineering (“app wants admin scopes”), not silent grant.

**Remediation (optional)**  
Allowlist known `kind` values; hard-warn on admin scopes.

---

### Crypto / reverse-engineering notes (pass 4)

| Topic | Assessment |
|-------|------------|
| Password hashing | argon2 + bcrypt verify/migrate — OK |
| 2FA backup codes | `equalsConstantTime` — OK |
| Native session token | 16-char CSPRNG (length residual SK-017) |
| App access token | `sha256(token+app.secret)` as lookup hash — OK |
| Chat escrow | AES-256-GCM + HMAC-SHA256 KDF; operator-readable by design (SK-010) |
| AP HTTP signatures | digest + verify; JsonLd forbids `@graph` / `@reverse` / `@included` |
| JsonLd remote `@context` | Fetched via `HttpRequestService` (SSRF guards) |
| “逆向” practical path | Steal tokens/keys, Meili filter (054), residual import/zip — not breaking GCM without key |

---

## 1e. Pass 5 (2026-07-14) — WS info leak, authz consistency

### SK-2026-057 — WebSocket `serverStats` ignores `enableServerMachineStats` (info disclosure)

| | |
|--|--|
| **Severity** | **M** (when admin disabled machine stats for privacy) |
| **CWE** | CWE-200 / CWE-862 |
| **Status** | **Fixed in tree** — tick + channel init/send gated on `enableServerMachineStats` |
| **Components** | `stream/channels/server-stats.ts`; `ServerStatsService.tick` |

**Description**  
Prior: REST `server-info` respected the flag; WS `serverStats` always leaked live host metrics.

**Fix summary**  
`ServerStatsService.tick` no-ops when disabled; channel `init` returns false; live/log handlers re-check flag.

---

### SK-2026-058 — WebSocket `queueStats` unauthenticated (explicit TODO)

| | |
|--|--|
| **Severity** | **L–M** |
| **CWE** | CWE-200 |
| **Status** | **Fixed in tree** — credential + `read:admin:queue` + moderator check in init |
| **Components** | `stream/channels/queue-stats.ts` |

**Description**  
Prior: unauthenticated `queueStats` WS (TODO require auth).

**Fix summary**  
`requireCredential = true`, `kind = read:admin:queue`; `init` requires `roleService.isModerator`.

---

### Pass 5 negatives (checked, no new high IDOR)

| Area | Result |
|------|--------|
| `i/update` avatar/banner/background/page | Ownership checked (`userId === me`) |
| Gallery/pages file attach | `userId: me.id` on drive lookup |
| Invite delete | Creator or moderator |
| Import endpoints | Ownership fixed (SK-051) |
| Private flash | Fixed (SK-052) |
| App secret | Only owner + secure client |
| Registry | Scoped to `me.id`; app token domain forced to token id |

---

## 1f. Pass 6 — reverse-engineering the API + injection / tampering playbook

This section maps how an attacker **reverses** Sharkey’s HTTP/WS surface (without source), then applies **classic** techniques: inject, tamper IDs/flags, escalate via wrong fields.  
Open-ops public federation remains **expected**, not a defect.

### 1f.1 What is publicly reverse-engineerable (by design)

| Surface | Auth | What you learn |
|---------|------|----------------|
| `GET /api.json` | None | Full OpenAPI 3.1: paths, params, response shapes, credential yes/no, permission `kind`, **links to source files** |
| `POST /api/endpoints` | None | Complete list of endpoint names |
| `POST /api/endpoint` `{endpoint}` | None | Parameter **names + types** for any endpoint |
| `GET /api-doc` | None | Human API explorer |
| Built frontend JS | None | Call sites, `misskeyApi()`, channel names, feature flags |
| ActivityPub / nodeinfo | None | Actor/note graph (public objects) |

**Implication:** Hiding endpoint names is **not** a control. Security must be **server-side authz + validation**, not obscurity. This is normal for Misskey-class APIs.

**Optional hardening (if you want less free recon):**  
Rate-limit or auth-gate `/api.json` / `endpoints` / `endpoint` on hardened private instances (breaks third-party clients that rely on them).

---

### 1f.2 How clients authenticate (reverse of auth channel)

| Transport | Where token appears | Reverse/leak risk |
|-----------|---------------------|-------------------|
| `Authorization: Bearer <token>` | Header (preferred in current frontend) | Lower (not in URL) |
| JSON body field `i` | POST body | Browser extensions / XSS can read |
| **Query `?i=`** | GET `allowGet` endpoints (`body = request.query`) and **WebSocket upgrade URL** | **High:** proxy logs, Referer, browser history, shoulder-surfing |

Code (`ApiCallService`):

```ts
const token = request.headers.authorization?.startsWith('Bearer ')
  ? request.headers.authorization.slice(7)
  : body?.['i'];  // GET → query string
```

WS (`StreamingApiServerService`): same Bearer **or** `q.get('i')`.

#### SK-2026-059 — Session token in query string (`i` / WS `?i=`)

| | |
|--|--|
| **Severity** | **L–M** (token theft via logs / Referer / shared URLs) |
| **CWE** | CWE-598 |
| **Status** | **Partially fixed in tree** — modern WS client uses `Sec-WebSocket-Protocol: misskey.i.<token>`; server accepts protocol before legacy `?i=` |
| **Components** | `misskey-js/streaming.ts`; `StreamingApiServerService`; residual: GET `allowGet` + `body.i` / legacy `?i=` still accepted |

**Attack / reverse technique**  
1. Intercept or log `wss://host/streaming?i=NATIVE_TOKEN` (legacy clients)  
2. Replay as `Authorization: Bearer` or POST `{ "i": "..." }`  

**Fix summary**  
Browser client no longer puts token in WS URL; uses subprotocol. Server prefers Bearer → protocol → query `i`.  

**Residual**  
Legacy `?i=` still works for old clients; GET endpoints may still take `i` in query when `allowGet`.

---

### 1f.3 Injection techniques vs this codebase

| Technique | Typical reverse step | Status on Sharkey-dev-continue |
|-----------|----------------------|--------------------------------|
| SQL injection | Fuzz string fields into filters | Mostly bound params; poll index integer-checked |
| Meili filter injection | Fuzz `notes/search` host/order | **SK-054 fixed in tree** (escape + allowlist) |
| Command injection | Find shell wrappers | Not found on user input |
| XSS / HTML inject | Admin HTML, MFM | sanitize-html no style; MFM color/time validated |
| SSTI | Template engines with user text | Not primary; pug is server templates |
| Prototype pollution | JSON merge of untrusted objects | AP headers strip `__proto__` |
| Path / zip inject | Import archives | Ownership fixed; zip-slip residual SK-055 |
| Mass assignment | Extra JSON keys (`isAdmin`, `userId`) | AJV **does not** set `additionalProperties: false` globally — **extra keys accepted but ignored** unless handler spreads full object (handlers generally pick fields) |

**AJV note (tamper-relevant):**  
`endpoint-base` uses `new Ajv({ useDefaults: true })` without `removeAdditional`.  
Sending `"isAdmin": true` on `notes/create` does **not** grant admin — create only reads known fields.  
Risk appears only if a future endpoint does `repository.update(ps)` / `Object.assign(entity, ps)`.

---

### 1f.4 Request tampering checklist (IDOR / privilege)

| Tamper | Example | Server behavior |
|--------|---------|-----------------|
| Swap resource id | Another user’s `fileId` / `noteId` / `flashId` | Imports: owner check (051); flash private: owner (052); drive show: owner/mod |
| Elevate visibility | `visibility: "public"` on private content | Enum only; create path may **downgrade** public→home under silence policies — not attacker elevate |
| Forge actor | `userId` of another user on write | Not taken from client for “who am I”; uses authenticated `me` |
| App permission | App claims `write:admin:*` | Token still needs user accept; rank demotion for shared access |
| Channel / room id | Subscribe foreign streams | Chat room gated (001); timelines public by design |
| WS channel name | `admin`, `queueStats`, `serverStats` | admin needs credential+kind; queueStats moderator-only (058); serverStats meta-gated (057) |

---

### 1f.5 Reverse crypto / tokens (what “breaking” means)

| Artifact | How obtained by reverse | Strength |
|----------|-------------------------|----------|
| Native user token (16 chars) | Login response, localStorage `$i.token`, WS URL | CSPRNG; short length residual (SK-017) |
| App access token | OAuth/miauth | `sha256(token+secret)` stored; secret only to app owner |
| Escrow chat key | Admin/meta/config | Server-side; not client-derivable without secret (SK-010 design) |
| Password | Login brute | argon2 |
| AP HTTP signatures | Outbound federation | Not a user API token |

There is **no** client-side “hidden admin API key” in frontend env for core API (Bearer = user/app token only).

---

### 1f.6 Practical reverse-eng attack chain (authorized testing)

```
1. GET /api.json  →  map all ops + requireCredential + kind
2. POST /api/endpoints + /api/endpoint  →  param names
3. Capture browser Bearer / localStorage token (or WS ?i=)
4. Replay with curl/mitm; fuzz:
     - id fields (IDOR)
     - free strings (inject)  → Meili only if enabled
     - extra JSON keys (mass assign smoke)
5. Open WS serverStats (if machine stats enabled) / queueStats (needs mod) 
6. Drive/import paths with stolen fileIds  →  should fail after 051
```

---

### SK-2026-060 — Unauthenticated API catalog enables full capability mapping

| | |
|--|--|
| **Severity** | **I** (information disclosure / recon; intentional for public APIs) |
| **CWE** | CWE-200 |
| **Status** | **Accepted for open instances**; optional lock-down for private |
| **Components** | `/api.json`, `endpoints`, `endpoint`, openapi source links |

Not a direct exploit; accelerates every other attack. Private/corp instances may want to disable or auth-wall.

---

## 2. Attack surface map (abbreviated)

```
Internet
  ├─ /api/*  (Misskey API + rate limits + kinds)
  ├─ /oauth/* (authorize redirect, token; client_credentials rejected)
  ├─ /api/v1/* Mastodon API
  ├─ /proxy/* media proxy ──► HttpRequestService ──► private-IP guards (always on)
  ├─ /files/* drive keys (UUID)
  ├─ /url preview
  ├─ ActivityPub inbox/outbox (signed)
  ├─ WebSocket streaming (chatRoom, main, timelines)
  └─ optional x-algorithm-gateway (DB)
```

**Highest residual ROI after remediation (for attackers / next hardening)**  
1. Session/token theft (SK-017/020); catalog recon **SK-060** (expected open)  
2. **SK-059 residual** — legacy `?i=` / GET query still accepted  
3. Authenticated SSRF-ish surfaces (`/proxy`, webhooks)  
4. Escrow key compromise (SK-010) — design  
5. Import zip-slip residual (SK-055)  
6. Mis-deploy: `NODE_ENV=test`, gateway without API key

---

## 3. Priority remediation plan

### Status legend

- **DONE** — code in this tree  
- **PARTIAL** — mitigated, residual remains  
- **OPEN** — backlog  
- **OPS** — operator / deploy only  

### P0 — before public exposure

| # | Item | Status |
|---|------|--------|
| 1 | Chat stream gating (`f95ed57`) | **DONE** |
| 2 | Always-on private IP deny | **DONE** |
| 3 | OAuth `client_credentials` stub | **DONE** (rejected) |
| 4 | Channel colors hex only (+ frontend sanitize) | **DONE** |

### P1 — short term

| # | Item | Status |
|---|------|--------|
| 5 | CSPRNG chat invite codes | **DONE** |
| 6 | Room invite block checks | **DONE** |
| 7 | Parameterize poll / array SQL | **DONE** (poll, chat, reactions, hashtags) |
| 8 | Harden `fetch-rss` / webhooks | **DONE** / **PARTIAL** (`/proxy` still open by design) |
| 9 | Strip `style` from sanitize-html | **DONE** |
| 10 | `sw/unregister` auth | **DONE** |
| 11 | `sponsors.forceUpdate` public DoS | **DONE** |
| 12 | `federation/update-remote-user` auth | **DONE** |

### P2 — medium term (residual backlog)

| # | Item | Status |
|---|------|--------|
| 13 | MFM position clamp + animation caps | **PARTIAL** (clamp done; simple-MFM-for-chat optional **OPEN**) |
| 14 | Escrow UX honesty + pack-time viewer checks | **OPEN** |
| 15 | Lengthen native tokens; CSPRNG IDs | **OPEN** |
| 16 | OAuth authorize full app/redirect allowlist | **PARTIAL** (scheme only) |
| 17 | Join-by-code failure rate limits | **OPEN** (optional hardening) |
| 18 | **SK-043/044** invite ignore + re-invite logic | **DONE** |
| 19 | **SK-045** unreact membership checks | **DONE** |
| 20 | **SK-046/047** clip/favorite visibility on write | **DONE** |
| 21 | **SK-048** chat reaction race / dedupe | **DONE** |
| 22 | **SK-049** x-algo fallback / isEnabled endpoint gate | **DONE** (working tree; ensure committed) |
| 23 | **SK-051** import endpoints: require `file.userId === me.id` | **DONE** |
| 24 | **SK-052** private flash: enforce visibility on show/like | **DONE** |
| 25 | **SK-053** admin emoji only own/unowned drive files | **DONE** |
| 26 | **SK-054** Meili filter/sort injection | **DONE** |
| 27 | **SK-057** WS serverStats meta gate | **DONE** |
| 28 | **SK-058** WS queueStats moderator-only | **DONE** |
| 29 | **SK-059** WS token via Sec-WebSocket-Protocol (not URL) | **PARTIAL** (modern client; legacy `?i=` kept) |
| 30 | **SK-060** public API catalog | **Accepted design** (optional lock-down) |

### P3 — hygiene

| # | Item | Status |
|---|------|--------|
| 18 | Align escrow config comments | **DONE** |
| 19 | WS reconnect rate limits | **OPEN** (SK-032) |
| 20 | page-push bounds | **PARTIAL** |
| 21 | Gateway `API_KEY` in production | **PARTIAL** / **OPS** |
| 22 | Telegram token not in loggable URLs | **OPEN** (SK-037) |
| 23 | Translator privacy documentation | **OPEN** (SK-038) |

### P0/P1 code remediation: **COMPLETE for this tree**

Further work is **P2/P3 + ops + optional dynamic testing**, not “all findings unfixed.”

---

## 4. Verification checklist (for operators)

### Code / build (expect yes on this tree)

- [x] Chat room stream membership gate (`f95ed57`+)  
- [x] Private-IP SSRF checks always on (not only production)  
- [x] OAuth `client_credentials` rejected  
- [x] Channel `color` API hex-only  
- [x] Frontend `safeCssHexColor` on note channel bars / tickers / roles  
- [x] Chat invite CSPRNG + room invite block checks  
- [x] `sw/unregister` requires login  
- [x] `sponsors.forceUpdate` ignored publicly  
- [x] `federation/update-remote-user` requires credential  
- [x] Internal storage path traversal guard  
- [x] `fetch-rss` requires credential  
- [x] Webhook create/update https-only  
- [x] sanitize-html without global `style`  
- [x] MFM position clamped  
- [x] export-custom-emojis moderator-only  

### Ops / smoke (must still be done per environment)

- [ ] `NODE_ENV=production` on public nodes  
- [ ] `chatEscrowSecret` / `CHAT_ESCROW_SECRET` set; not a weak shared install password  
- [ ] `reset-db` not reachable on internet-facing instances  
- [ ] x-algorithm gateway not public without `API_KEY`  
- [ ] Smoke: request to private IP via `/proxy` fails closed  
- [ ] Smoke: `fetch-rss` without auth fails; with auth, private IP fails closed  
- [ ] Production image includes commits `f95ed57`, `15b00d8`, `7ba243c`, `4eb55e4` (or successors)  

---

## 5. Methodology notes

- Grep/AST review of backend `src/`, frontend MFM/sanitize/chat, services.  
- Confirmed mfm-js rejects semicolon breakouts in fn args.  
- Spot-checked post-fix code paths (SSRF agent, invite CSPRNG, channel color schema, sw unregister, sanitize-html, MFM clamp).  
- Optimization review (§8): git history (~40 commits), live reads of chat stream/crypto/prefetch/WS/X-algo, working-tree diffs for uncommitted WIP.  
- Did **not** run dynamic exploits, fuzzers, load tests, or attack live instances.  
- Findings may include defense-in-depth issues not yet weaponized.  
- **Remediation complete (P0/P1 code) ≠ full security program complete.**  
- **Optimization direction correct ≠ production release complete** (see §8.10).

---

## 6. Revision history

| Rev | Date | Notes |
|-----|------|--------|
| 0.1 | 2026-07-14 | Initial deep audit: chat, CSS/MFM, SSRF, OAuth, SQL patterns, auth |
| 0.2 | 2026-07-14 | + push unregister, Telegram token URLs, translator privacy, export emoji, more |
| 0.3 | 2026-07-14 | Chat stream gate + escrow setupPassword cut |
| 0.4 | 2026-07-14 | Batch fix: SSRF always-on, OAuth stub, channel color, invite CSPRNG, room invite blocks, sw unregister, sponsors forceUpdate, federation update-remote-user auth, storage path, docs |
| 0.5 | 2026-07-14 | P1: fetch-rss auth, webhook URL https, poll/chat SQL params, sanitize-html no style, frontend safe colors |
| 0.6 | 2026-07-14 | Reaction/Hashtag SQL params, MFM clamps, export-emoji staff-only, page-push bounds, gateway API_KEY in prod, role colors |
| 0.7 | 2026-07-14 | **Status close-out:** §0 overall status, remediation matrix (fixed vs residual), updated P0–P3 plan, ops checklist; conclusion P0/P1 code complete, residuals remain |
| 0.8 | 2026-07-14 | **Pass 2 logic screening:** SK-043..050 (ignored invite join, re-invite, unreact auth, public clip private notes, favorite visibility, reaction race, x-algo black-hole) |
| 0.9 | 2026-07-14 | **Pass 2 remediations:** SK-043..049 fixed in code (invite ignore/join, re-invite, unreact auth, clip/favorite visibility, reaction race, x-algo); matrix + P2 plan updated |
| 0.9b | 2026-07-14 | **Pass 3 real vulns (skip open-ops):** SK-051 import file IDOR (**H**); SK-052 private flash leak (**M**); SK-053 admin emoji file detach (L); residual matrix + ROI updated |
| 1.0 | 2026-07-14 | **Pass 4 injection/crypto:** SK-054 Meili filter/sort injection; SK-055 zip-slip residual; SK-056 app permissions phishing; SQL/cmd/eval/XSS scan notes |
| 1.1 | 2026-07-14 | **Pass 5:** SK-057 WS serverStats ignores enableServerMachineStats; SK-058 WS queueStats unauth (TODO); IDOR re-check clean on avatar/gallery/import |
| 1.2 | 2026-07-14 | **Pass 6 reverse API:** §1f playbook; SK-059 query token `i`; SK-060 public OpenAPI catalog; inject/tamper matrix vs codebase |
| 0.9c | 2026-07-14 | **§8 Project optimization evaluation** (multi-pass code review): scores, chat perf/WS/escrow/algo, engineering process, residual backlog, production gate |
| 1.0 | 2026-07-14 | **Pass 3 remediations + chat scroll:** SK-051/052/053 fixed; fling scroll anti-twitch; AMD matrix updated |
| 1.1 | 2026-07-14 | **Pass 4 remediations:** SK-054 Meili escape/order/host; 055 residual (slacc); 056 accepted design |
| 1.2 | 2026-07-14 | **Pass 5 remediations:** SK-057 serverStats meta gate; SK-058 queueStats moderator-only |
| 1.3 | 2026-07-14 | **Pass 6:** reverse API playbook; SK-059 WS protocol auth (partial); SK-060 catalog accepted |

---

## 7. Appendix — key file index

| Area | Paths |
|------|--------|
| Chat stream | `server/api/stream/channels/chat-room.ts` |
| Chat service | `core/ChatService.ts` |
| Chat crypto | `core/ChatCryptoService.ts` |
| Chat pack | `core/entities/ChatEntityService.ts` |
| Chat frontend | `frontend/src/pages/chat/` (`room.vue`, `use-chat-history.ts`, `chat-history-loader.ts`, `chat-ws.ts`, `ChatMessageLazy.vue`, …) |
| Stream client | `frontend/src/stream.ts`, `misskey-js/src/streaming.ts` |
| HTTP/SSRF | `core/HttpRequestService.ts`, `core/DownloadService.ts` |
| Media proxy | `server/FileServerService.ts` |
| MFM | `frontend/src/components/global/MkMfm.ts` |
| Sanitize / colors | `frontend/src/utility/sanitize-html.ts`, `frontend/src/utility/color.ts` |
| OAuth | `server/oauth/OAuth2ProviderService.ts` |
| API authz | `server/api/ApiCallService.ts`, `AuthenticateService.ts` |
| Roles/rank | `core/RoleService.ts` |
| Poll SQL | `server/api/endpoints/notes/polls/vote.ts`, `core/PollService.ts` |
| X-algorithm | `core/XAlgorithmService.ts`, `services/x-algorithm-gateway/server.mjs` |

---

## 8. Project optimization evaluation (reviewer report)

> **Role:** Independent project reviewer (static code + git history).  
> **Tree:** `/root/Sharkey-work/Sharkey-dev-continue`  
> **Passes:** 2026-07-14 (security AMD + multi-round optimization review against live sources).  
> **Not done:** load tests, dynamic exploit, full e2e suite.

This section records the **optimization / engineering judgment** for the same tree that hosts the AMD findings. It is intentionally broader than security: performance, architecture, product honesty, and release discipline.

### 8.1 Overall scores (1–10)

| Dimension | Score | One-line |
|-----------|-------|----------|
| **Performance direction** | **8.0** | Chat history prefetch, lazy mount, media unload, WS-over-REST hit real SPA bottlenecks |
| **Security hardening (code)** | **8.7** | P0/P1 + pass2/3 IDOR fixes (051–053); residuals mainly design/ops |
| **Chat correctness / UX** | **8.0** | Scroll stability, catch-up, 1:1 `fromUser` pack (WIP) address real races |
| **Maintainability** | **7.0** | Composables extracted; `room.vue` still ~1720+ lines |
| **Product / privacy honesty** | **6.0–7.0** | Escrow ≠ E2EE; field still named `isE2ee`; forced-E2EE was reverted |
| **Test / release discipline** | **4.0–5.0** | Almost no automated tests; working tree often holds critical fixes uncommitted |
| **X-algorithm usability** | **7.5 → 8.0** (after commit) | Endpoint gate + default fallback correct; must land (SK-049) |
| **Composite** | **~8.1** | **Conditional pass** for internal beta; public production needs gates in §8.8 |

**Verdict wording:**  
**有条件通过（Conditional Pass）— 性能与安全方向均成立，工程完成度约 80–85%。**  
Internal beta: **OK**. Public production: **only after §8.8 gates**.

### 8.2 What was optimized (work streams)

Recent work (~40 commits on this branch of effort) clusters into four streams:

```
Perf/UX ── chat history prefetch, lazy mount, media release, scroll, WS reconnect catch-up
Security ── chat stream auth, escrow key material, SSRF/OAuth/storage/invite/… (AMD P0/P1)
Features ── room moderation, escrow, X-algo ranking v2, admin notes/search
Refactor ── room.vue → composables / pure modules (history, channel, messages, timeline)
```

**Positive process note:** Feature/perf first, then security AMD backfill, then structure extraction, then correctness fixes (e.g. 1:1 avatars). Execution velocity is high.

**Negative process note:** Strategy thrash (force always-on E2EE → full revert; escrow meta bootstrap → revert) and **uncommitted security/usability fixes** previously risked deploy drift. Prefer smaller “releasable slices.”

### 8.3 Performance evaluation (code-backed)

#### 8.3.1 History prefetch + viewport lazy mount — **Excellent / keep**

| Mechanism | Paths | Judgment |
|-----------|--------|----------|
| Background `untilId` pipeline, not scroll-coupled | `chat-history-loader.ts`, `use-chat-history.ts` | Correct for long rooms |
| Cooperative yield (`requestIdleCallback` / rAF) | same | Reduces main-thread jank |
| Caps: `maxPages` 30, `maxMessages` = `HISTORY_MEMORY_CAP` (900) | `use-chat-history.ts` | Safety present |
| Pause when hidden / deactivated | `shouldPause` | Battery/data aware |
| Lazy row mount + height cache | `ChatMessageLazy.vue`, `chat-msg-heights.ts` | Correct for media-heavy history |

**Caveats:**

- Name “concurrent” is slightly misleading: cursor pages are **sequential** (as they must be); pool is mainly for map hooks.
- Three memory tiers are intentional — document, do not “unify” blindly:

| Constant | Typical value | Role |
|----------|---------------|------|
| `MAX_MESSAGES` | 400 | Trim oldest at live edge |
| `BACKGROUND_MESSAGE_CAP` | 80 | Soft trim on keep-alive |
| `HISTORY_MEMORY_CAP` | 900 | Allow taller window while reading history |

#### 8.3.2 Media / DOM resource release — **Good / keep**

| Mechanism | Paths | Judgment |
|-----------|--------|----------|
| Off-screen / hidden `unloadVideo` (clear src/poster) | `ChatAttachment.vue` | Mobile decoder relief |
| Skip URL preview when no links | `XMessage.vue` | Saves network + DOM |
| Soft-trim messages on deactivate | `room.vue` + caps | Keep-alive hygiene |
| `releaseChatResources` on leave | `room.vue` | Correct teardown |

#### 8.3.3 WebSocket expansion + reconnect — **Excellent with noise**

| Mechanism | Paths | Judgment |
|-----------|--------|----------|
| Timeline / roomShow / members over channel request-response | `chat-ws.ts`, `chat-timeline.ts`, `chat-room.ts` | Reduces REST stampede |
| Full packed notes on edit/reply streams | backend note services + frontend capture | Avoids `notes/show` storms |
| Main-channel notification catch-up | stream main channel | Tab-wake correct |
| `wakeStream` + `sinceId` catch-up + 800ms / in-flight guards | `stream.ts`, `room.vue` | Mobile half-open sockets |
| Keep channel while backgrounded; pause heavy prefetch only | `room.vue` visibility | Better than dispose-on-hide (earlier thrash) |

**Caveats:**

- Global wake (visibility/online/pageshow/focus) **plus** room catch-up (immediate + 600ms) is multi-layered; cooldowns help but can still be chatty on flaky networks. Prefer one orchestration: wake once → `_connected_` → single catch-up.
- `chat-ws.request` uses fixed **30ms** delay after connect — pragmatic, brittle; prefer init-complete signal later.
- Expanding WS **must** ship with membership gates (`f95ed57`) — currently correct in tree.

#### 8.3.4 X-algorithm — **Good; commit WIP**

| Mechanism | Judgment |
|-----------|----------|
| Short TTL in-process cache | Absorbs double-refresh |
| Default fallback to Sharkey TL | Availability-first (WIP default true) |
| `isEnabled` requires endpoint (WIP) | Prevents SK-049 black-hole |
| Gateway ranking features | Useful local proxy; prod needs `API_KEY` |

### 8.4 Security optimization evaluation (summary; details in §1)

| Item | Status | Reviewer note |
|------|--------|----------------|
| Chat room live stream gate | **DONE** `f95ed57` | Non-members may open channel shell for join-gate; no live events without timeline permission |
| History over WS | **DONE** | Same permission check; `ACCESS_DENIED` must not silent-REST-retry as success for auth errors (client mostly correct) |
| SSRF always-on | **DONE** | Verified in `HttpRequestService` agents |
| OAuth dummy tokens | **DONE** | Rejected |
| Invite CSPRNG + room invite blocks | **DONE** | Verified |
| Colors / sanitize / MFM clamps | **DONE** / partial residual | Frontend `safeCssHexColor` landed |
| Escrow not from setupPassword | **DONE** | Dedicated secret only |
| Escrow product honesty | **OPEN** SK-010 | Operator-readable at-rest; not peer E2EE |
| Pass-2 logic bugs 043–048 | **OPEN** | See §1b |
| SK-049 X-algo black-hole | **WIP uncommitted** | Must commit |

### 8.5 Escrow / crypto / E2EE — architecture judgment

**Implemented model (correct as designed):**

- Wire/at-rest: AES-256-GCM `v3s.<keyId>.…` (legacy `v3s.<iv>.…`)
- Server seals outbound text when escrow enabled (`prepareOutboundText`)
- Pack path reveals plaintext to authorized clients over TLS (`revealForPack` → `revealBody`)
- Frontend treats server `text` as primary; **only legacy `v1.`** client-E2EE decrypts in browser (`chat-e2ee.ts` / `XMessage.vue`)
- Notes/posts never use this path (chat-only) — good isolation

**Issues:**

1. **Naming:** DB/API field `isE2ee` overloaded for escrow + legacy client E2EE → user/admin confusion. Prefer UX “托管加密 / Escrow”; long-term split `encryptedAtRest` vs client E2EE (pack already exposes `encryptedAtRest`).
2. **Decrypt gated on `isEnabled`:** If admin turns **preference off** but ciphertext remains and keys still exist, `revealForPack` may skip decrypt (`isEscrowCiphertext && isEnabled`) → blank history. **Decrypt should depend on key materials, not “encrypt new messages” preference.**
3. **`|| true` in legacy derive path:** Always tries legacy HMAC — OK for compatibility, wasteful/confusing; condition should be explicit (no keyId on wire / tryLegacy flag).
4. **Strategy thrash cost:** Force always-on 1:1 E2EE then full revert increased bisect cost; freeze product semantics before more crypto features.
5. **DM content validation:** Room path throws on empty content; DM path comment-only — align both.

### 8.6 Chat authorization matrix (reviewer-verified)

| Action | Rule (intended / observed) |
|--------|----------------------------|
| Subscribe `chatRoomStream` | Member **or** site moderator (`hasPermissionToViewRoomTimeline`) |
| WS `history` (room) | Same |
| WS `read` receipt | **Member only** (staff readonly must not mark read) |
| WS `roomShow` | Allowed for non-members (join-gate); no message bodies |
| WS `members` | Member or room/site moderator |
| WS `msg` / react / delete | Write availability + membership / canDelete checks |
| `chatUser` stream key | `chatUserStream:${me}-${otherId}` — listener only hears own DM pair (not arbitrary third-party) |

This layering is **sound**. Residual bugs are elsewhere (ignore-invite join SK-043, unreact checks SK-045, etc.).

### 8.7 Engineering / maintainability

| Observation | Judgment |
|-------------|----------|
| Extracted modules: `use-chat-channel`, `use-chat-messages`, `use-chat-history`, `chat-timeline`, `chat-ws`, `chat-scroll`, … | Good direction |
| `room.vue` still ~1720 lines | Next extract only lifecycle (catch-up / visibility), no behavior change |
| Security commits well-scoped with SK IDs | High quality |
| Near-zero unit tests for prefetcher / channel ACL / catch-up / reveal | **Largest engineering risk** |
| Working tree often holds production-relevant fixes | Commit before more features |

**Minimum test pack recommended:**

1. `ChatHistoryPrefetcher` — exhaust / stop / pause / maxPages  
2. `chat-room` channel — non-member no stream; member receives; read only for members  
3. `catchUpChatMessages` — dedupe + in-flight  
4. `revealForPack` — preference off + keys present still decrypts historical v3s  

### 8.8 Residual optimization backlog (reviewer priority)

| ID | Item | Severity | Action |
|----|------|----------|--------|
| **W1** | Commit X-algo endpoint gate + default fallback (SK-049) | **High (availability)** | Commit now |
| **W2** | Commit 1:1 lite `fromUser` / reaction.user pack + normalize + types | **Medium (UX)** | Separate commit from W1 |
| **W3** | Escrow reveal independent of preference switch | **Medium** | Code fix in `ChatCryptoService.revealForPack` |
| **W4** | Align DM empty-content validation with room | **Low** | `ChatService.createMessageToUser` |
| **W5** | Clean `\|\| true` legacy derive; comments | **Low** | Crypto hygiene |
| **W6** | Automated tests (see §8.7) | **High (engineering)** | Add before more chat features |
| **W7** | Collapse multi wake/catch-up triggers | **Low** | Single orchestrator |
| **W8** | Further slim `room.vue` | **Medium (maintainability)** | Composables only |
| **W9** | Escrow ≠ E2EE copy in admin/UI | **Medium (product)** | Copy + docs |
| **W10** | Pass-2 logic SK-043…048 | **M/L** | See §1b |

### 8.9 What not to do next

- Do **not** re-introduce forced always-on client E2EE without a frozen product spec.  
- Do **not** dispose chat WS on every `document.hidden` (catch-up path already rejected that).  
- Do **not** rewrite the prefetch/lazy-mount architecture for micro-gains.  
- Do **not** ship more large features while W1/W2 remain uncommitted.  
- Do **not** blindly set `HISTORY_MEMORY_CAP = MAX_MESSAGES` (breaks deep history / jump-to-message).

### 8.10 Production / release gate (reviewer)

**Allow internal beta when:**

- [x] Commits include `f95ed57`, `15b00d8`, `7ba243c`, `4eb55e4` (or successors)  
- [ ] W1 + W2 committed and built into the image  
- [ ] Smoke: non-member cannot receive room live/history; member send/receive; tab background → foreground catch-up  
- [ ] Smoke: private IP via `/proxy` fails closed even if `NODE_ENV` mis-set in staging  
- [ ] Ops: `NODE_ENV=production`, dedicated `chatEscrowSecret`, gateway not public without key  

**Allow public production when additionally:**

- [ ] W3 escrow reveal fix (or documented “disabling escrow blanks history until re-enabled”)  
- [ ] Admin/user copy never claims peer E2EE for escrow  
- [ ] SK-043 (ignored invite join) fixed or accepted with documented behavior  
- [ ] At least the §8.7 minimum tests or a written manual regression script owned by release  

### 8.11 Worth-it matrix

| Investment | Worth it? | Note |
|------------|-----------|------|
| History prefetch + lazy mount | **Yes** | Correct long-history architecture |
| Media unload / soft trim | **Yes** | Mobile necessity |
| WS history + catch-up | **Yes** | Ship only with auth gates (done) |
| X-algo cache + fallback | **Yes** | Commit WIP |
| Stream membership + escrow key cut | **Must** | Not optional polish |
| Forced E2EE then revert | **Not worth the thrash** | Lesson: product semantics first |
| Progressive `room.vue` split | **Yes, unfinished** | Continue without behavior change |

### 8.12 Final reviewer ruling

| Audience | Ruling |
|----------|--------|
| **Project lead** | Continue, but **feature freeze** until W1/W2 committed and smoke done |
| **Performance track** | **Pass — keep**; tune catch-up/params only |
| **Security track** | **Pass for P0/P1 code**; residual design/logic/ops remain (this AMD) |
| **Next iteration** | Tests + escrow reveal decoupling + invite ignore logic; no new crypto product flip |

**Composite: Conditional Pass (~8.1/10).**  
Performance and security **directions are correct**. Completeness is gated by uncommitted usability/crypto polish, product honesty, and verification — not by a wrong architecture.

---

*End of AMD document (includes §8 optimization evaluation). Continue appending findings as `SK-2026-0xx`; update §8 scores when major streams land.*
