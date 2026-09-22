# echoV2

桌面上的通用显示器。muse、agent，以及以后的 Data，都往这里投内容；echoV2 决定什么时候、在哪、以什么样子显示。

歌词只是其中一个内容包，不是核心的形状。

- 契约草案：[docs/CONTRACT.md](docs/CONTRACT.md)
- 目录地图和依赖规则：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 旧版参考：`../echo`（只读参考，不做全量迁移）

## 状态

M1 完成：agent 投卡片 → 内容库 → 调度 → 舞台状态 → 屏幕上的主题。现在有两个主题：风铃、流体（托盘里切换）。下一步是 M2：导演服务、新世纪、夜潮。

```bash
pnpm install
pnpm dev      # 右上角挂出风铃；托盘 ♪ 里可以切到流体
pnpm check    # 类型检查 + lint + 测试（含架构测试）
```

投一张卡试试：

```bash
curl -X POST http://127.0.0.1:10757/contents \
  -H "x-echo-token: $(cat ~/Library/Application\ Support/echo-v2/agent-token)" \
  -H 'content-type: application/json' \
  -d '{"kind":"word","lines":[{"text":"巡り合う","reading":"めぐりあう"},"偶然相遇；邂逅"]}'
```

接到 Claude Code（先 `pnpm build:mcp`）：

```bash
claude mcp add echo -s user -- node ~/Code/sideProject/echoV2/out/mcp/mcp.js
```
