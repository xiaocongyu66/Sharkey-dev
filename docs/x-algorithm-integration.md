# X Algorithm Integration

Sharkey keeps its original timelines unless `xAlgorithmConfig.enabled` is enabled in the admin Algorithm page.

The upstream `xai-org/x-algorithm` Home Mixer is a gRPC service. Sharkey calls an HTTP JSON gateway configured as `Home Mixer endpoint` or `Scored Posts endpoint`. The gateway must preserve the upstream Home Mixer/Phoenix/Thunder/Grox pipeline and return Sharkey note ids in ranked order.

## Request

Sharkey sends `POST` JSON:

```json
{
  "product": "sharkey",
  "source": "home",
  "userId": "9xyz...",
  "limit": 100,
  "sinceId": null,
  "untilId": null,
  "filters": {
    "withFiles": false,
    "withRenotes": true,
    "withReplies": false,
    "withBots": true
  },
  "pipeline": {
    "strictOriginalExperience": true,
    "includeInNetwork": true,
    "includeOutOfNetwork": true,
    "enableGroxContentUnderstanding": true,
    "enableAdsBlending": false,
    "phoenixEndpoint": null,
    "thunderEndpoint": null,
    "groxEndpoint": null,
    "modelArtifactsPath": null
  }
}
```

`source` is `home` for Home timeline and `hybrid` for Social/Hybrid timeline.

If `apiKey` is configured, Sharkey sends it as `Authorization: Bearer <apiKey>`.

## Response

The gateway may return any one of these shapes:

```json
["noteId1", "noteId2"]
```

```json
{ "noteIds": ["noteId1", "noteId2"] }
```

```json
{ "posts": [{ "noteId": "noteId1" }, { "noteId": "noteId2" }] }
```

`postId`, `tweetId`, and `id` are also accepted aliases. Sharkey then re-loads those notes locally and applies its normal visibility, muted user, blocked host, suspended user, and muted thread filters before packing the API response.

## Fallback

When `Fallback to Sharkey timeline` is off, failures from the gateway fail the timeline request. When it is on, Sharkey falls back to the original Sharkey timeline implementation.

## Admin Test

The admin Algorithm page includes `Test Home` and `Test Hybrid` buttons. They call `admin/x-algorithm/test`, which sends the same gateway request shape with a small limit and reports whether ranked note ids were returned.
