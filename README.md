# maw-fbpage-plugin

Run a Facebook Page from the terminal through the Graph API: posts, viewer comments, replies as the Page, scheduled posts and video stats.

## Install

```
maw plugin install nat-build-with-oracle/maw-fbpage-plugin
maw fbpage --help
```

Update: `maw plugin update fbpage`

## Quick start

Put the Page access token in pass once, as `facebook/<page>-page-token`:

```
pass insert facebook/yaisai-page-token
```

Then:

```
maw fbpage --as yaisai info
maw fbpage --as yaisai comments --unreplied
maw fbpage --as yaisai reply 122095000197569430_4721050578131663 "ขอบใจจ้าหลาน" --dry
maw fbpage --as yaisai scheduled
maw fbpage --as yaisai stats 1234567890
```

| command | what |
|---|---|
| `info` | name, id, followers, likes, link |
| `posts [--limit N]` | recent posts: Bangkok time, comment and reaction counts, first line |
| `comments [--unreplied] [--limit N\|--all]` | every comment on the last N posts (default 25) or all posts, replies nested under it, `PAGE` marks the Page's own, `OPEN` = viewer comment with no Page reply |
| `reply <comment_id> "<text>" [--dry] [--force]` | reply as the Page; refuses when the Page already replied unless `--force` |
| `scheduled` | scheduled posts, soonest first, with a count |
| `stats <video_id>` | lifetime `video_insights` metrics |

## Configuration

| variable / flag | meaning |
|---|---|
| `PAGE` or `--as <page>` | Page key; the token is read from `pass show facebook/<page>-page-token`. Required: there is no default Page |
| `--pass <path>` | read the token from another pass entry |

The token needs `pages_read_engagement` for reading and `pages_manage_engagement` to reply.

## Safety

- The token is read from pass on every call and is never printed, logged or stored.
- Output shows parsed fields only, never raw response bodies or paging URLs (both carry the token).
- `reply` checks first whether the Page already answered that comment, so a re-run does not double-post. `--dry` prints the reply without sending.
- The Professional Dashboard "Status" page (weekly tasks, achievements) has no Graph API; read it in a browser.

## Notes

- Graph API version `v27.0`.
- Times are shown in Asia/Bangkok.
- A Page token's `/me` is the Page itself, so no Page id is needed.

## Development

```
git clone https://github.com/nat-build-with-oracle/maw-fbpage-plugin
cd maw-fbpage-plugin
bun test
bun src/index.ts --as yaisai info
```
