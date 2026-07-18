# 开放与封闭边界（运营约定）

> 产品原则：**帖子面向公开与联邦，可被机器人/爬虫合理抓取；聊天面向成员，托管加密 + 鉴权 + WebSocket 实时，不对爬虫开放。**

## 1. 开放侧 — 帖子 / 公共时间线 / 联邦

| 能力 | 说明 |
|------|------|
| 公开帖 | `notes/show` 等可在可见性允许下 **无凭证** 读取 |
| 联邦 | ActivityPub 出站/入站，跨站互动 |
| 爬虫 | 默认 `robots.txt` **允许** `/notes/`、`/@`、`/api/notes` 等公开路径 |
| 应用 Token | 第三方应用用 **用户/应用 access token** 调开放 API（发帖、读 TL 等），按 scope 授权 |

**不做：** 不要用「全站反爬」锁死公开帖；风控用限流、验证码、角色权限，而不是关掉公开读取。

## 2. 封闭侧 — 聊天

| 能力 | 说明 |
|------|------|
| 鉴权 | 所有 `chat/*` REST 与 `chat-user` / `chat-room` **WebSocket 频道** 均 `requireCredential` |
| 成员 | 房间时间线 / 历史需成员或合规管理权限 |
| 托管加密 | `ChatCryptoService`：**仅聊天** AES-GCM 落库（`v3s.*`），**绝不加密笔记/帖子** |
| 实时 | 进出消息走 **WebSocket** 频道推送，不依赖爬虫轮询 |
| 爬虫 | `robots.txt` **Disallow** `/chat`、`/api/chat` |

**三方托管模型（不是严格 E2EE）：** 参与者经 TLS 由服务器揭示；运营方可在管理端轮换密钥做合规解密。密钥在管理后台「Chat escrow」，可选 `CHAT_ESCROW_SECRET` / 配置回退。

## 3. 开放应用 vs 私密聊天

```
第三方 App / 机器人
  │  Bearer / i token（应用 scope）
  ▼
公开/授权 API ──► 帖子、时间线、用户资料 …  （开放）
  │
  ✗ 默认拿不到聊天明文
  │
成员登录 + chat scope + WS
  ▼
ChatService ── seal(escrow) ──► DB 密文
           ◄── reveal ────────   仅成员/运营路径
           ──► GlobalEvent / chat-room|chat-user channel （实时）
```

## 4. 运维检查清单

1. 管理端开启 **Chat escrow** 并轮换密钥；生产务必配置独立 secret，勿用弱默认值  
2. 需要自定义抓取策略时，在管理端覆盖 `robotsTxt`（实例级）  
3. 第三方应用只发最小 scope；**不要**给无关机器人 `read:chat` / `write:chat`  
4. 依赖升级（Dependabot）时：优先保 **API Token 鉴权路径** 与 **聊天 WS/escrow** 行为不变  

## 5. 相关代码

- 鉴权 Token：`packages/backend/src/server/api/AuthenticateService.ts`  
- 聊天加密：`packages/backend/src/core/ChatCryptoService.ts`（注释写明 never notes）  
- 聊天业务：`packages/backend/src/core/ChatService.ts`  
- WS：`packages/backend/src/server/api/stream/channels/chat-room.ts`、`chat-user.ts`  
- 爬虫策略：`packages/backend/assets/robots.txt` + 管理端 `robotsTxt`
