# Sharkey 接口优化与改动决策说明书

| 字段 | 值 |
|------|-----|
| **文档类型** | 设计决策 / 变更理由 / 收益与风险（Why · How · Benefit · Risk） |
| **目标树** | `/root/Sharkey-work/Sharkey-dev-continue` |
| **日期** | 2026-07-16 |
| **读者** | 开发、评审、运维、后续接手者 |
| **关联** | `SECURITY-AUDIT-AMD.md` · `SECURITY-AUDIT-PASS13.md` · `API-PERF-AND-BUGS-PASS14.md` |
| **已落地基线** | `6514330` Pass13 · `2d72032` SK-097/100 · 后续 SK-098 / PERF-03 partial / PERF-12 harden |
| **待落地** | PERF-03 深度 lite pack、生产搜索引擎、PERF-13 mute anti-join、PERF-16 指标 |

---

## 0. 怎么读这份文档

每一项改动（已做或建议做）都按同一模板写清四件事：

| 栏目 | 含义 |
|------|------|
| **为什么要改（Why）** | 现状痛点、根因、不改会怎样 |
| **为什么这么做（How / Decision）** | 方案选择、为何不选备选方案 |
| **能带来什么优化（Benefit）** | 延迟、正确性、安全、运维上的收益（尽量可观察） |
| **可能带来什么问题 / Bug（Risk）** | 回归、语义变化、新边界、如何验收与回滚 |

**原则（全文通用）：**

1. **先正确性，再延迟**——错误的快接口比慢的正确接口更危险（例：投票 isVoted）。  
2. **失败要可感知**——超时返回空数组会伪装成「没内容」。  
3. **边界必须写进不变量**——限长 Redis 读、部分 TL 等会改变分页语义，必须配套 fallback。  
4. **安全与性能同审**——错误码差异可以变成存在性侧信道。

---

## 1. 系统背景：一次时间线请求在干什么

理解优化前，先看主路径（以 `POST /api/notes/timeline` 为例）：

```
客户端
  │
  ▼
ApiCallService（鉴权 + 限流 + 可选 IP 日志）
  │
  ▼
enableFanoutTimeline?
  │
  ├─ NO ──► PostgreSQL 重查询（关注列表 + mute/block/visibility）
  │              │
  │              └─► NoteEntityService.packMany（组装完整 Note JSON）
  │
  └─ YES ─► Redis fanout 列表（homeTimeline:userId）
               │  取 ID 窗口
               ▼
            按 ID 批量查 note + 过滤（可见性/静音…）
               │  不够则 DB fallback
               ▼
            packMany
               │
               ▼
            JSON 响应
```

**延迟通常卡在三层：**

| 层 | 典型成本 | 已改善？ |
|----|----------|----------|
| Redis 读列表 | 旧：全量 `LRANGE 0 -1` | Pass 13 已限长 |
| SQL | 关注 EXISTS / 大 IN / 超时 | Home 部分改善 |
| packMany | 多表批查 + 递归 renote/reply + poll | **仍是大头**；且有正确性 bug |

下文按「已落地」与「建议落地」分组。

---

# 第一部分：已落地改动（Pass 13 / `6514330`）

---

## A1. Fanout 时间线：限制 Redis `LRANGE` 长度 + 每次 push 都 `LTRIM`

| 字段 | 内容 |
|------|------|
| **ID** | PERF-01 |
| **状态** | **已落地** |
| **代码** | `packages/backend/src/core/FanoutTimelineService.ts` |
| **常量** | `FANOUT_READ_MAX = 1000`（只读窗口）；`push` 时用业务 `maxlen` 做 `LTRIM` |

### 为什么要改（Why）

**旧行为：**

- `get` / `getMulti` 使用 `LRANGE list:… 0 -1`，把**整条**时间线 ID 列表拉进 Node。  
- `push` 时只有约 **10%** 概率 `LTRIM`，列表可长期超过配置的 `perUserHomeTimelineCacheMax`。

**根因：**

- Redis List 无界读取 = O(N) 网络 + O(N) 内存 + O(N log N) 排序/过滤。  
- 用户关注越多、实例越热闹，home list 越长；**每次刷新 TL 都付全量成本**。  
- 随机 trim 导致「有时快有时慢、列表偶发膨胀」，难观测。

**不改会怎样：**

- `notes/timeline` / hybrid / local 在 fanout 开启时仍可能秒级延迟。  
- Redis 内存与 worker RSS 随 list 膨胀。  
- 与 DB fallback、packMany 叠加，放大超时与 500。

### 为什么这么做（How / Decision）

**方案：读侧硬顶 + 写侧必 trim。**

1. **读：** 只取最新 `FANOUT_READ_MAX`（1000）条：`LRANGE 0, 999`。  
   - List 是 `LPUSH` 最新在前，窗口覆盖「正常刷 TL + 过滤损耗多取」。  
2. **写：** 每次 `LPUSH` 后 **总是** `LTRIM 0, maxlen-1`，去掉随机 10%。  

**为何不选其它方案（当时）：**

| 备选 | 优点 | 未优先的原因 |
|------|------|----------------|
| 换成 ZSET + score=id | 真范围查询、分页干净 | 迁移成本大、双写窗口长 |
| 只 trim 不限读 | 内存好，读仍可能接近 maxlen 全量 | 大 maxlen 时读仍重 |
| 读 `limit*3` 动态窗口 | 更贴单次请求 | 过滤率低时要多轮往返；1000 固定实现简单、可预测 |

**不变量（必须遵守）：**

- Fanout list **只保证最近 maxlen 条 ID 的近似新鲜 TL**，不是无限历史。  
- 深分页 / `untilId` 超出窗口时，**必须**能走 DB fallback（见风险 A1-R2、Pass14 SK-098）。

### 能带来什么优化（Benefit）

| 维度 | 收益 |
|------|------|
| **延迟** | Redis 往返 payload 上界固定；Node 排序/过滤输入 ≤ 1000 |
| **内存** | List 不再因 trim 抽奖而无限涨 |
| **可预测性** | p95 更稳，少「偶发超大 list」 |
| **级联** | 后续 DB `IN (noteIds)` 批次更可控 |
| **运维** | 可对 `LLEN` 告警：持续顶满说明要加大 maxlen 或查推送异常 |

**可观察指标建议：** `fanout_lrange_len`、`fanout_list_llen`、`timeline_path{fanout|db}`。

### 可能带来什么问题 / Bug（Risk）

| 风险 ID | 现象 | 为何会发生 | 缓解 / 验收 |
|---------|------|------------|-------------|
| **A1-R1** | 过滤很凶时（大量 mute）一页凑不满 `limit` | 窗口内有效 ID 变少 | `allowPartial:true`；多轮取（endpoint 已有 rate 循环）；DB fallback |
| **A1-R2** | 深翻页「缺帖 / 跳号」 | `untilId` 比窗口内最老 ID 还旧，Redis 不再返回更老 ID | 检测 window miss → **强制 DB fallback**（Pass14 SK-098）；测：超长 list + 连续 untilId |
| **A1-R3** | 与 `perUserHomeTimelineCacheMax` 配置心智冲突 | 读 cap 1000、写 maxlen 可能更大或更小 | 文档写清：读 cap 是安全阀；写 maxlen 是保留量；读 cap ≥ 常用 limit×过滤倍率 |
| **A1-R4** | 老客户端假设「fanout 含全部近期 ID」 | 语义本就近似 | 产品说明：完整历史用用户页/搜索，不是 home fanout |

**回滚：** 恢复 `LRANGE 0 -1` 可立刻对比延迟，但内存风险回来——仅短时诊断用。

---

## A2. Home 时间线 DB 超时：返回 503 / `TEMPORARILY_UNAVAILABLE`，不再静默 `[]`

| 字段 | 内容 |
|------|------|
| **ID** | SK-096 / PERF-02 |
| **状态** | **已落地** |
| **代码** | `packages/backend/src/server/api/endpoints/notes/timeline.ts` |

### 为什么要改（Why）

**旧行为（中间态）：**  
`statement timeout` 被 catch 后 `return []`，避免 API 500。

**问题本质：**

- HTTP 200 + 空数组 = **「你关注的人现在没发帖」**。  
- 真实含义是 **「数据库忙不过来」**。  
- 客户端不会重试、不会提示错误，用户以为产品坏了或社交关系空了。  
- 运维从业务日志很难区分「真的冷清」和「超时被吞」。

### 为什么这么做（How / Decision）

**方案：** 识别 PG 超时类错误 → 抛出带稳定 `code` 的 API 错误（如 `TEMPORARILY_UNAVAILABLE`），HTTP **503**（或实现所选的 5xx），**不要** 200+`[]`。

**为何不一直 500 裸抛：**

- 裸 500 无稳定 `code`，前端难做 i18n 与重试。  
- 限流 429 与过载 503 语义不同，便于监控分流。

**为何不返回 `{ notes:[], partial:true, reason }`（200）：**

- 更友好，但要改 OpenAPI / misskey-js / 所有客户端。  
- 503 + 标准 error 信封与现有 `ApiError` 一致，改动面小。

### 能带来什么优化（Benefit）

| 维度 | 收益 |
|------|------|
| **正确性 / UX** | 用户可看到「暂时不可用」而非空白 TL |
| **客户端** | 可对 `TEMPORARILY_UNAVAILABLE` 自动重试 / 退避 |
| **运维** | 503 与 timeout 日志可告警；不再被「空 TL」掩盖 |
| **根因压力** | 暴露问题，倒逼 fanout / 索引 / 连接池治理 |

注意：这是 **正确性与可观测性优化**，本身不减少 SQL 时间；减少的是**错误代价**。

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **A2-R1 前端未处理新 code** | 只当通用错误，体验一般 | 前端映射文案 + 重试；旧客户端至少不再「假空」 |
| **A2-R2 误伤非超时错误** | 正则过宽把别的 cancel 当超时 | 收紧匹配 `statement timeout` / `canceling statement due to statement timeout` |
| **A2-R3 重试风暴** | 全站超时时空洞重试打爆 DB | 客户端指数退避；服务端限流；治 root cause |
| **A2-R4 与 allowPartial 混淆** | 部分成功 vs 全失败 | 文档：超时是全失败；partial 是「有数据但不足 limit」 |

---

## A3. Home DB fallback：关注列表用缓存 ID + `IN (...)`，减少 correlated EXISTS

| 字段 | 内容 |
|------|------|
| **ID** | （timeline 优化，与 beeb144 / 后续对齐） |
| **状态** | **Home 已落地**；Hybrid **未完全对齐**（见 B4） |
| **代码** | `endpoints/notes/timeline.ts` `getFromDb` |

### 为什么要改（Why）

Misskey/Sharkey 经典 home SQL 模式：

```sql
WHERE EXISTS (
  SELECT 1 FROM following
  WHERE followerId = :me AND followeeId = note.userId
)
```

对**每一行候选 note** 做相关子查询，在关注多、note 表大时极难优化，易触发 `statement_timeout`。

### 为什么这么做（How / Decision）

1. `userFollowingsCache.fetch(me.id)` 拿关注 ID 集合。  
2. `followeeIds = keys + me.id`。  
3. `note.userId IN (:...followeeIds)` + `channelId IN (...)`（有频道关注时）。  

**前提：** 关注关系缓存与写路径一致（跟随/取关失效正确）。

**为何仍保留 mute/block 等 EXISTS：**  
集合可能很大，且多列（reply/renote 作者）要一起判；一次改完风险高。Home 先吃「关注维」最大头。

### 能带来什么优化（Benefit）

| 维度 | 收益 |
|------|------|
| **延迟** | 计划从 nested loop + 子查询 → 更易 hash/merge + 索引 `(userId, id)` |
| **稳定性** | 减少 timeout → 减少 503（A2）触发率 |
| **与 fanout 协同** | fanout 不足时 fallback 不再「比 fanout 还慢到不可用」 |

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **A3-R1 超大 IN 列表** | 关注 1 万+ 时绑定参数过多、计划不稳 | 上限策略 / 强制 fanout-only / 分批 UNION |
| **A3-R2 缓存陈旧** | 刚关注的人帖子不出现，或取关后仍出现 | 跟随写路径必须 invalidate `userFollowingsCache` |
| **A3-R3 与 EXISTS 语义细微差** | 极端并发下短窗口不一致 | 可接受的 eventual；测跟随后立即刷 TL |
| **A3-R4 频道分支遗漏** | 只优了 user 维 | 代码已并 channelIds；回归频道 TL |

---

## A4. 反应 / 点赞：不可见笔记错误码统一为 `NO_SUCH_NOTE`

| 字段 | 内容 |
|------|------|
| **ID** | SK-091 |
| **状态** | **已落地** |
| **代码** | `ReactionService` 抛 `68e9d2d1-…`；`reactions/create`、`like` 映射为 `NO_SUCH_NOTE` |

### 为什么要改（Why）

服务层已正确拒绝「不可见笔记」上的反应，但 endpoint 只映射了「已反应 / 拉黑 / renote」等 ID。

**未映射时：**

- 可能变成未处理 500 或不同错误信封。  
- **存在性侧信道：** 「不存在」与「存在但私密」响应不同 → 可探测私密帖 ID。

这是安全/隐私问题，不是性能问题，但和「接口行为一致性」一起改成本最低。

### 为什么这么做（How / Decision）

在 catch 中：

```ts
if (err.id === '68e9d2d1-48bf-42c2-b90a-b20e09fd3d48')
  throw new ApiError(meta.errors.noSuchNote);
```

与 Pass 9–12 其它 seed 笔记 ACL 策略一致：**不可见 ≡ 不存在**（对调用方）。

**为何不在 endpoint 再查一次 visibility：**  
服务层已查；重复查浪费。映射错误即可。

### 能带来什么优化（Benefit）

| 维度 | 收益 |
|------|------|
| **安全** | 收敛 oracle |
| **客户端** | 稳定 code，可统一 toast |
| **一致性** | 与 `favorites/create`、polls 等可见性门控同一语言 |

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **A4-R1 调试变难** | 分不清真缺失与 ACL | 服务端 debug 日志可打 reason；对外仍统一 |
| **A4-R2 其它入口未映射** | 仅 create/like 改了 | 全库搜 `68e9d2d1`；删除反应等路径复查 |
| **A4-R3 联邦/远程** | 远程笔记可见性边界 | 沿用 `NoteVisibilityService` 既有语义 |

---

## A5. Mastodon 桥：trends / suggestions 改为进程内调用，去掉 self-`fetch`

| 字段 | 内容 |
|------|------|
| **ID** | SK-092 / PERF-04 |
| **状态** | **已落地** |
| **代码** | `server/api/mastodon/endpoints/search.ts` 等 |

### 为什么要改（Why）

旧实现：Mastodon API 处理时 `fetch(config.url + '/api/notes/featured')` 再打自己。

**问题：**

1. **延迟：** 多一次完整 HTTP（序列化、路由、鉴权、线程切换）。  
2. **脆弱：** 依赖 `url` 配置、回环、TLS、代理；配置错就全挂。  
3. **安全史：** 曾与 Host 头 SSRF 问题相关（SK-064）；即使固定 origin，self-HTTP 仍是多余攻击面与故障面。

### 为什么这么做（How / Decision）

直接注入/调用与 `/api/notes/featured`、`/api/users` 相同的服务或查询逻辑，在同一进程完成转换（Masto converters）。

**为何不保留 fetch 仅修 Host：**  
安全可修，但延迟与脆弱性仍在；进程内是更优解。

### 能带来什么优化（Benefit）

| 维度 | 收益 |
|------|------|
| **延迟** | 去掉 1 RTT + 双倍 JSON |
| **可靠** | 不依赖公网 URL 指回自己 |
| **安全** | 缩小出站/环回 fetch 面 |
| **观测** | 一次请求一次 trace，不再「内套 HTTP」难跟 |

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **A5-R1 行为不完全一致** | 旧路径走完整 endpoint meta（限流、钩子） | 对比响应字段；共享同一 pack 函数 |
| **A5-R2 权限差异** | 内部调用若跳过某种检查 | 显式传入 `me`；单测 Masto vs 原生 |
| **A5-R3 循环依赖** | Nest 模块互相引用 | 依赖 Core 服务而非 Endpoint 类 |

---

## A6. `userUpdated` 广播：瘦身 payload + 房间推送异步化

| 字段 | 内容 |
|------|------|
| **ID** | SK-094 / PERF-05 |
| **状态** | **已落地（部分）** |
| **代码** | `endpoints/i/update.ts`；前端 `live-user-cache.ts` |

### 为什么要改（Why）

资料展示字段变更时：

- `publishBroadcastStream('userUpdated')` → **所有在线连接**  
- 再对最多约 300 个聊天室顺序 `publishChatRoomStream`  

**问题：**

- 改一次头像，全站 WS 与 Redis pub/sub 尖峰。  
- `i/update` 请求被大量 await 拉长。  
- 隐私：全站收到他人 UserLite（名、头像、简介等）。

### 为什么这么做（How / Decision）

1. **瘦身：** 广播仅保留 UI 补丁需要的字段（头像 URL、name 等），避免多余大字段。  
2. **异步：** 房间 fan-out 不阻塞 HTTP 响应（fire-and-forget / queue）。  
3. **保留广播动机：** 时间线/聊天头像不发 REST 也能热更新（产品目标）。

**更彻底的方案（未完全做）：** 只推给关注者/共房间——实现复杂，作后续。

### 能带来什么优化（Benefit）

| 维度 | 收益 |
|------|------|
| **`i/update` 延迟** | 主路径缩短 |
| **WS/Redis 负载** | 单事件体积下降；尖峰略缓 |
| **UX** | 仍保留多端头像热更新 |

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **A6-R1 房间补丁丢失** | 异步任务失败无人知 | 日志 + 客户端过期仍可 REST |
| **A6-R2 字段过瘦** | 某 UI 依赖 description 补丁 | 对照 `live-user-cache` 使用字段 |
| **A6-R3 仍全局可见** | 隐私未根治 | 产品接受或做定向推送 |
| **A6-R4 乱序** | 快速连改两次补丁旧覆盖新 | payload 带 `updatedAt`，客户端比时间戳 |

---

## A7. X-algorithm 网关：限制请求体大小

| 字段 | 内容 |
|------|------|
| **ID** | SK-095 |
| **状态** | **已落地** |
| **代码** | `services/x-algorithm-gateway/server.mjs` |

### 为什么要改（Why）

`parseBody` 无限累积 `data` chunk → 内存型 DoS。  
主站时间线虽已 `isEnabled()===false`，网关仍可能被 admin test 或误暴露端口使用。

### 为什么这么做（How / Decision）

累计字节超上限（如 64KiB）即断开并 413/400。  
配合：默认听 `127.0.0.1`、生产 `API_KEY`。

### 能带来什么优化（Benefit）

| 维度 | 收益 |
|------|------|
| **安全** | 防大包打满内存 |
| **稳定** | 网关进程不易被单请求拖死 |

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **A7-R1 合法大 body 被拒** | 未来扩展字段过多 | 上限可配置；监控 413 |
| **A7-R2 只限网关不限主站** | 主站有 Fastify bodyLimit | 已知分层 |

---

## A8. Telegram 贴纸导入：经 `HttpRequestService`、减少 token 进日志面

| 字段 | 内容 |
|------|------|
| **ID** | SK-093 |
| **状态** | **已落地（方向）** |
| **代码** | `ChatStickerService` |

### 为什么要改（Why）

裸 `fetch` + URL 中带 bot token → 代理/access 日志泄露；超时/SSRF 策略不统一。

### 为什么这么做（How / Decision）

走统一 HTTP 栈（超时、错误处理）；避免在可日志化 URL 中暴露 token（能 header 则 header；不能则脱敏日志）。

### 能带来什么优化（Benefit）

安全与可维护性为主；串行 80 贴纸仍慢，属后续队列化。

### 可能带来什么问题 / Bug（Risk）

Telegram API 差异导致个别贴纸失败——保持 per-sticker try/catch，pack 仍可用。

---

# 第二部分：建议落地改动（Pass 14，需写清收益与副作用）

---

## B1. 修复 poll `isVoted`：只查当前用户投票 + 用 `meId` 取 hint

| 字段 | 内容 |
|------|------|
| **ID** | SK-097 / PERF-09 |
| **状态** | **OPEN — 最高优先级** |
| **代码** | `core/entities/NoteEntityService.ts` `pack` / `packMany` / `populatePoll` |

### 为什么要改（Why）

**现状（bug）：**

```ts
// packMany：userId ∈ 所有出现在 note 上的用户（作者、reply、renote…）
pollVotesRepository.findBy({ noteId: IsOne(noteIds), userId: IsOne(userIds) })

// pack：取的是「笔记作者」的票
myVotes: pollVotes?.get(note.id)?.get(note.userId)
```

**错误语义：**

- 时间线展示的「我选了哪一项」可能变成「**作者**选了哪一项」。  
- 作者常投自己的票 → 大量帖子显示**你已投票**但其实没有。  
- hint 对不上时，`populatePoll` 对每个 poll **再查一次库** → 典型 N+1，**拖慢所有带投票的 TL/通知打包**。

**为何算 P0：**  
同时破坏 **正确性** 与 **性能**；用户可感知，且难用「刷新」理解。

### 为什么这么做（How / Decision）

**正确模型：** `isVoted` 只描述 **viewer（me）** 与该 poll 的关系。

**推荐实现：**

```ts
// 1) 批量只拉 me 的票
me
  ? pollVotesRepository.findBy({ noteId: IsOne(noteIds), userId: me.id })
  : []

// 2) Map: noteId → MiPollVote[]
// 3) pack:
myVotes: meId ? pollVotesByNote.get(note.id) : undefined
```

**为何不要「继续查所有 userIds 再 get(meId)」：**

- 结果虽可能对，但 **I/O 与结果集大很多**，无收益。  
- 多用户票进内存还有无必要的数据暴露面（同进程内）。

**可选微优化：**  
`poll.choices.map((c,i) => votes: poll.votes[i])` 替代 `indexOf`（O(n²)→O(n)）。

### 能带来什么优化（Benefit）

| 维度 | 收益 |
|------|------|
| **正确性** | 投票 UI 与真实状态一致 |
| **延迟** | 去掉 poll 场景 N+1；批查行数从「O(笔记用户×票)」降到「O(我的票)」 |
| **负载** | packMany 少一次大 IN、少多次单条 SELECT |
| **信任** | 避免「显示已投但提交又让投」类混乱 |

**预期体感：** 含投票帖的时间线/通知列表打包更稳；SQL 日志里 per-note `poll_vote` 应消失。

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **B1-R1 依赖作者票的隐藏逻辑** | 若某处误用 myVotes 当「作者态度」 | 全库搜 `myVotes` / `isVoted`；作者态度应另字段 |
| **B1-R2 hint 结构变更** | 嵌套 Map 改成 noteId→votes[] | 改 `populatePoll` 类型与所有调用 |
| **B1-R3 未登录 pack** | me 为空不应查票 | 保持 `me ? … : empty` |
| **B1-R4 多选 poll** | multiple 要标记多个 choice | 继续用 votes 数组循环，测 multiple |
| **B1-R5 缓存的 Note JSON** | 若有人缓存了错误 isVoted | 无服务端长期缓存则无事；CDN 勿缓存用户 TL |

**验收用例（必须写进测试）：**

1. 作者已投、访客未投 → 访客全 `isVoted:false`。  
2. 访客投 choice 1 → 仅 choice 1 为 true。  
3. `packMany` 10 条含 poll → poll_vote 查询 **≤ 1 次**。  
4. multiple 投两选项 → 两个 true。

**回滚：** 风险高（错误逻辑），应向前修，不建议回滚到作者票语义。

---

## B2. `packMany` 时间线轻量模式（detail / 递归 / 延迟 poll）

| 字段 | 内容 |
|------|------|
| **ID** | PERF-03 |
| **状态** | **OPEN** |
| **代码** | `NoteEntityService.packMany`；各 timeline endpoint |

### 为什么要改（Why）

在 fanout 读已经限长后，**profiling 上最重的一段往往是 packMany**：

- 展开 reply / renote / renote.reply …  
- 批查 users、files、polls、votes、favorites、my renotes、reactions buffer、emoji  
- 每条再 `pack` 成大 JSON  

TL 首屏并不需要「笔记详情页」级别的完整图。

### 为什么这么做（How / Decision）

引入或落实 **timeline 专用选项**，例如：

| 选项 | TL 建议 | 详情页 |
|------|---------|--------|
| `detail` | false / 降级 | true |
| renote 递归 | 1 层 | 更深 |
| poll | 可延迟或仅 hasPoll 摘要 | 完整 + isVoted |
| files | 保留（TL 要展示） | 全 |

**为何不「再堆缓存」优先：**  
缓存错误的 pack（见 B1）会放大事故；先减工作量、再缓存。

**为何不无限缩字段：**  
破坏客户端假设会导致空白卡、崩溃；需与 misskey-js / 前端组件对齐。

### 能带来什么优化（Benefit）

| 维度 | 收益 |
|------|------|
| **CPU** | 少递归、少 emoji/关系填充 |
| **SQL** | 少 note/user 二次加载 |
| **带宽** | JSON 更小，移动端更快 |
| **吞吐** | 同机器可撑更高 RPS |

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **B2-R1 前端缺字段** | 组件读 `note.reply.user` 等 undefined | 对照 MkNote/SkNote 实际字段；契约测试 |
| **B2-R2 第三方客户端** | 假设 detail 默认 true | 仅 TL endpoint 降级；`notes/show` 保持完整 |
| **B2-R3 行为分叉难测** | 两套 pack | 快照测试两套 schema |
| **B2-R4 二次请求风暴** | 客户端为补字段狂调 show | 精简要「够用」；热数据仍带 user lite |

---

## B3. 前端 / 默认：`allowPartial: true`

| 字段 | 内容 |
|------|------|
| **ID** | SK-099 / PERF-11 |
| **状态** | **OPEN**（API 默认 false 为兼容；应用层可 true） |
| **代码** | 各 `*timeline*` paramDef；前端 TL loader |

### 为什么要改（Why）

`allowPartial === false` 时，fanout 过滤循环会尽量 **凑满 limit 条** 才返回：

- 多轮 Redis 窗口消费  
- 多轮 DB `IN`  
- 延迟 ≈ 轮数 ×（读+滤+pack）  

注释已写：*true is recommended but for compatibility false by default*。

### 为什么这么做（How / Decision）

1. **API 默认保持 false**（不破坏老客户端语义）。  
2. **Sharkey 官方前端传 true**（推荐）。  
3. 可选：新版本 API / 能力标志再改默认。

**语义差异必须讲清：**

| 模式 | 返回 | 客户端 |
|------|------|--------|
| partial true | 可能 `< limit` 但尽快返回 | 用长度与 untilId 继续翻页 |
| partial false | 尽量 = limit | 更慢，页更「满」 |

### 能带来什么优化（Benefit）

| 维度 | 收益 |
|------|------|
| **首屏延迟** | 明显下降（过滤重时） |
| **DB/Redis** | 减少无效多轮 |
| **与 A1 协同** | 限长窗口下更不易为凑满而打满窗口 |

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **B3-R1 短页被当成到底** | 客户端 `length < limit ⇒ 没有更多` | 翻页应用 untilId，不能仅靠 length |
| **B3-R2 滚动条跳动** | 一页更少 | UI 虚拟列表本就按内容高度 |
| **B3-R3 老客户端不传** | 仍走慢路径 | 仅官方前端受益；文档推荐参数 |

---

## B4. Hybrid DB fallback：与 Home 一样用关注 ID 缓存 + `IN`

| 字段 | 内容 |
|------|------|
| **ID** | SK-100 / PERF-10 |
| **状态** | **OPEN** |
| **代码** | `endpoints/notes/hybrid-timeline.ts` `getFromDb` |

### 为什么要改（Why）

Home 已改为 `IN (followeeIds)`，Hybrid 仍：

```ts
.orFollowingUser(qb, ':meId', 'note.userId')  // EXISTS following
.orFollowingChannel(...)
```

Fanout 关闭或 miss 时，**社交时间线比 home 慢一截**，且更易超时。

### 为什么这么做（How / Decision）

复用 `userFollowingsCache` + `userFollowingChannelsCache`，拼：

- 关注用户的帖 **或**  
- 本地公开帖（hybrid 原语义） **或**  
- 自己  

**必须保持 hybrid 语义：** 不能变成纯 home（丢掉 local public 并集）。

### 能带来什么优化（Benefit）

与 A3 相同类型的计划优化；hybrid 在 fanout 故障时可用性上升。

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **B4-R1 语义漂移** | IN 条件写错变成只有 following | 单测：不关注的本地公开帖仍出现 |
| **B4-R2 大 IN + OR public** | 计划仍难 | EXPLAIN；必要时 partial index |
| **B4-R3 与 home 代码分叉** | 两处逻辑拷贝 | 抽 `buildHomeOrHybridWhere` |

---

## B5. Fanout 窗口未命中时强制 DB fallback（补 A1 副作用）

| 字段 | 内容 |
|------|------|
| **ID** | SK-098 |
| **状态** | **OPEN** |
| **代码** | `FanoutTimelineEndpointService` + `FanoutTimelineService` |

### 为什么要改（Why）

A1 限长读之后：Redis 里可能还有更老 ID，但读不到。  
`untilId` 深翻页会出现 **洞** 或过早结束。

### 为什么这么做（How / Decision）

若：

```
untilId < min(ids_in_window)  // 且窗口满 cap
```

则 **不要** 假装 Redis 已穷尽，直接 `dbFallback(untilId, sinceId, limit)`。

**为何不加大 FANOUT_READ_MAX 到 100 万：**  
回到 PERF-01 原点。

### 能带来什么优化（Benefit）

| 维度 | 收益 |
|------|------|
| **正确性** | 分页连续 |
| **性能** | 热路径仍读短窗口；仅深页付 DB 成本（可接受） |

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **B5-R1 深页全走 DB** | 老用户狂翻历史 | 正常；可缓存；限流 |
| **B5-R2 判断 min 用错排序** | 升序/降序搞反 | 单测 since/until 组合 |
| **B5-R3 与 allowPartial 交互** | 逻辑分支多 | 状态机表或表驱动 |

---

## B6. 生产禁用默认 `ILIKE '%q%'` 搜索 / 强制专用索引引擎

| 字段 | 内容 |
|------|------|
| **ID** | SK-101 / PERF-12 |
| **状态** | **OPEN（运维 + 可选代码门闩）** |
| **代码** | `SearchService`；配置 `fulltextSearch.provider` |

### 为什么要改（Why）

默认 `sqlLike`：

```sql
note.text ILIKE '%keyword%'
```

无法有效用 B-tree；大数据量下 **全表/大范围扫** + 再叠 visibility EXISTS → CPU 打满，拖慢**整个实例所有接口**（抢连接池）。

### 为什么这么做（How / Decision）

| 层次 | 动作 |
|------|------|
| 运维 | 生产使用 `meilisearch` / `sqlPgroonga` / `sqlTsvector` |
| 代码可选 | `NODE_ENV=production && provider=sqlLike` 启动警告或拒绝  
| API | 短查询拒绝、更狠狠限流未登录 search |

**为何不「只加 pg_trgm」当唯一方案：**  
有帮助，但运维与 Meili 等仍更可控；trgm 也要维护。

### 能带来什么优化（Benefit）

| 维度 | 收益 |
|------|------|
| **search 延迟** | 数量级改善 |
| **实例整体** | 减少搜索拖死连接池 |
| **体验** | 相关排序（Meili）更好 |

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **B6-R1 索引延迟** | 新帖稍晚可搜 | 可接受；文档说明 |
| **B6-R2 分词/语言** | 中日文差异 | 选对分析器 |
| **B6-R3 结果与旧 ILIKE 不一致** | 用户「以前能模糊后到」 | 发布说明 |
| **B6-R4 Meili 宕机** | 搜索不可用 | fail 明确错误，勿静默空 |

---

## B7. DB 时间线 mute/block：缓存集合 anti-join 替代部分 EXISTS

| 字段 | 内容 |
|------|------|
| **ID** | PERF-13 |
| **状态** | **OPEN** |
| **代码** | `QueryService.generateMutedUserQueryForNotes` 等 |

### 为什么要改（Why）

一条 DB TL 查询可挂 **多层** `NOT EXISTS (muting…)` / `blocking` / instance mute，优化器压力大。

Fanout 路径已在 Node 用缓存过滤；**DB 路径仍吃 EXISTS 税**。

### 为什么这么做（How / Decision）

若 mute 集合不大（常见）：`NOT IN (mutedIds)` 或 `LEFT JOIN muting m ON … WHERE m IS NULL`。  
集合极大时再回退 EXISTS 或临时表。

### 能带来什么优化（Benefit）

DB fallback / fanout 关闭时延迟下降。

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **B7-R1 空 IN / 超大 IN** | SQL 非法或过慢 | 空集跳过子句；超大走 EXISTS |
| **B7-R2 漏 reply/renote 作者** | 旧逻辑覆盖多列 | 逐条对齐括号语义，回归测试 |
| **B7-R3 缓存不同步** | 刚 mute 仍看见 | mute 写路径 invalidate |

---

## B8. 公开接口短缓存（meta 等）

| 字段 | 内容 |
|------|------|
| **ID** | PERF-14 |
| **状态** | **OPEN** |
| **代码** | `ApiServerService` 全局 `Cache-Control: private, max-age=0` |

### 为什么要改（Why）

所有 API 禁缓存 → 连相对静态的 `meta` 也无法被 CDN/浏览器短缓存，**每次打开站点都打满 meta**。

### 为什么这么做（How / Decision）

- 默认保持私有 API no-store。  
- 白名单：`meta`（detail=false）、公开 emoji 列表等 → `public, max-age=30–60`。  
- 带凭证的请求仍 private。

### 能带来什么优化（Benefit）

降低元数据 RPS；改善「打开站点」体感。

### 可能带来什么问题 / Bug（Risk）

| 风险 | 说明 | 缓解 |
|------|------|------|
| **B8-R1 配置变更延迟生效** | 用户最多 max-age 内看到旧 meta | 短 TTL；管理变更可 bump ETag |
| **B8-R2 误缓存用户数据** | 白名单写错 | 严格白名单；单测 header |
| **B8-R3 多实例配置不一致** | 边缘缓存脏 | 用版本号 / meta updatedAt |

---

## B9. 可观测性：延迟直方图与路径标签

| 字段 | 内容 |
|------|------|
| **ID** | PERF-16 |
| **状态** | **OPEN** |

### 为什么要改（Why）

没有 `notes_timeline_seconds{path=fanout|db}`、`pack_many_seconds` 时，优化只能靠猜，A1/A2/B1 的收益无法量化。

### 为什么这么做（How / Decision）

在 endpoint 出口与 packMany 入口打 histogram；标签避免高基数（不要 userId）。

### 能带来什么优化（Benefit）

优化闭环：改前改后对比 p95；告警。

### 可能带来什么问题 / Bug（Risk）

指标基数爆炸、采集开销——用粗标签；采样。

---

# 第三部分：横向权衡与「改了 A 会伤 B」

## 3.1 性能优化 vs 正确性

```
        更快
         ▲
         │  限长 LRANGE ──────────── 可能分页洞 ──► 要用 DB fallback 补
         │  allowPartial true ───── 短页 ────────► 客户端翻页逻辑
         │  lite pack ───────────── 缺字段 ──────► 契约测试
         │  poll 只查 me ────────── 必须改（修 bug）无冲突
         │
         └────────────────────────────► 更正确
```

## 3.2 安全修复 vs 兼容性

| 改动 | 兼容性冲击 | 态度 |
|------|------------|------|
| 不可见 → NO_SUCH_NOTE | 低（本应如此） | 必须 |
| 超时 503 非 200[] | 中（客户端要处理） | 必须 |
| OAuth/SSRF 类 | 视情况 | 必须 |

## 3.3 建议落地顺序（含依赖）

```
1. B1 SK-097  poll isVoted     ← 无依赖，立刻修正确性+性能
2. B3         allowPartial 前端
3. B5 SK-098  fanout window miss → DB  ← 巩固 A1
4. B4         hybrid IN-list           ← 对齐 A3
5. B2         lite pack                ← 需前端配合
6. B6         搜索引擎                 ← 运维
7. B7–B9      mute 集合 / 缓存头 / 指标
```

## 3.4 一页纸：改动 → 收益 → 主要新风险

| 改动 | 主要收益 | 主要新风险 |
|------|----------|------------|
| 限长 LRANGE + 必 LTRIM | TL Redis 延迟/内存 | 深分页洞 |
| 超时 503 | 不再假空 TL | 重试风暴 |
| Home IN followees | DB fallback 加速 | 超大 IN、缓存陈旧 |
| 反应错误映射 | 反 oracle | 调试信息变少 |
| Mastodon 进程内 | 少 RTT、更稳 | 与旧 HTTP 行为差 |
| userUpdated 瘦身异步 | update 更快 | 补丁丢失/乱序 |
| 网关 body 上限 | 防 DoS | 超大合法请求 |
| **poll isVoted 修复** | **对 + 快** | hint 结构变更 |
| lite pack | pack CPU/带宽 | 前端缺字段 |
| allowPartial true | 首屏快 | 误判到底 |
| hybrid IN | hybrid 可用性 | 语义漂移 |
| 禁 ILIKE 默认 | 全站不被搜索拖死 | 索引延迟、语义差 |

---

# 第四部分：验收与回归清单（写进 CI / 发布）

## 4.1 功能

- [ ] 作者已投、我未投：TL 上 isVoted 全 false（B1）  
- [ ] 我投票后刷新：仅对应 choice true；无 N+1 poll_vote  
- [ ] 私密帖 reaction：与不存在同一 `NO_SUCH_NOTE`（A4）  
- [ ] DB 注入 timeout（测试环境）：home 返回 503 而非 `[]`（A2）  
- [ ] 超长 fanout list + 连续翻页：无永久空洞（B5）  
- [ ] hybrid：不关注的本地公开帖仍在（B4）  

## 4.2 性能（有环境则测）

- [ ] fanout 开启：LRANGE 响应长度 ≤ 1000  
- [ ] home p95 对比改前改后  
- [ ] packMany SQL 次数（含 poll）  

## 4.3 安全

- [ ] 不可见笔记反应无差分错误  
- [ ] 网关超大 body 被拒  
- [ ] Telegram 日志无裸 token  

---

# 第五部分：文档与编号索引

| 文档 | 用途 |
|------|------|
| **本文** `API-OPTIMIZATION-DECISIONS.md` | 为什么改、怎么做、收益、风险 |
| `API-PERF-AND-BUGS-PASS14.md` | Pass14 缺陷清单与补丁草图 |
| `SECURITY-AUDIT-PASS13.md` | Pass13 安全/延迟项与状态 |
| `SECURITY-AUDIT-AMD.md` | 总册与历史 ID |

| ID | 主题 | 决策章节 |
|----|------|----------|
| PERF-01 | Fanout LRANGE | A1 |
| SK-096 | 超时 503 | A2 |
| — | Home IN | A3 |
| SK-091 | 反应 oracle | A4 |
| SK-092 | Mastodon | A5 |
| SK-094 | userUpdated | A6 |
| SK-095 | 网关 body | A7 |
| SK-093 | Telegram | A8 |
| **SK-097** | **poll isVoted** | **B1** |
| PERF-03 | lite pack | B2 |
| SK-099 | allowPartial | B3 |
| SK-100 | hybrid IN | B4 |
| SK-098 | window miss | B5 |
| SK-101 | 搜索 | B6 |
| PERF-13–16 | mute/缓存/指标 | B7–B9 |

---

## 修订历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 0.1 | 2026-07-16 | 初版：Pass13 已落地 + Pass14 建议；统一 Why/How/Benefit/Risk 模板 |

---

*维护约定：每合并一项优化，在对应章节把「状态」改为已落地，并补「实际观测数据」（p95、错误率）。不要只改代码不改本文的风险表。*
