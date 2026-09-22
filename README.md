# echoV2

桌面上的通用显示器。muse、agent，以及以后的 Data，都往这里投内容；echoV2 决定什么时候、在哪、以什么样子显示。

歌词只是其中一个内容包，不是核心的形状。

- 契约草案：[docs/CONTRACT.md](docs/CONTRACT.md)
- 目录地图和依赖规则：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 旧版参考：`../echo`（只读参考，不做全量迁移）

## 状态

M4 完成：四个主题（风铃、流体、新世纪、夜潮）；muse 在放歌时显示同步歌词，频谱驱动风铃的风和夜潮的浪；agent 的卡片在前奏、间奏或暂停时插播；新世纪由 LLM 导演排版。

可以开多个窗口，每个窗口有名字、主题和「显示什么」。agent 可以点名窗口，也可以让几张卡在不同窗口同时上台（对话、接力倒数）；卡片可以循环轮播。

**面板**：按 **⌥ + 右⌘** 呼出（托盘里也有入口），和 muse 同一套设计。
- 直接打字搜命令：`top 流体`、`隐藏 left`、`双风铃`，⏎ 执行。
- ↑↓ 选窗口，⏎ 进入这个窗口的设置：←→ 换主题、换内容、改名字，⏎ 开关显示、穿透、铺满。
- esc 逐级返回，最后收起面板。

托盘只留打开面板和逐个窗口显示或隐藏。

LLM 的 key 放在 `~/Library/Application Support/echo-v2/secrets.json`（`openaiApiKey`），没有也能用，新世纪会退回启发式排版。

```bash
pnpm install
pnpm dev      # 右上角挂出风铃；托盘里打开面板（dev 版不启用 ⌥ + 右⌘，见下）
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

## 打包和安装

```bash
pnpm package    # → dist/Echo-<version>-arm64.dmg，拖进 Applications 即可
pnpm icon       # 改了 scripts/make-icon.swift 里的几何参数后，重新生成图标
```

- 常驻菜单栏，没有 Dock 图标（`LSUIElement`）。
- ⌥ + 右⌘ 靠 app 里的一个小程序（`native/hotkey`）监听修饰键，需要在「系统设置 → 隐私与安全性 → 输入监控」里勾选 Echo。只有打包版会申请这个权限；dev 版要试的话用 `ECHO_HOTKEY=1 pnpm dev`，会以「Electron」的名义申请。ad-hoc 签名每次打包都会变，重新打包后可能需要重新勾一次。同一时间只跑一个：装好的 app 开着时，`pnpm dev` 会直接退出，因为两者共用 agent 端口和状态目录。
- 状态目录固定为 `~/Library/Application Support/echo-v2/`，不跟着 productName 走。
- 打包产物不带 node_modules：main 和 mcp 都把依赖打进单文件，所以 `package.json` 里只有 devDependencies。
- app 自带一份 MCP 脚本，不依赖仓库：`node /Applications/Echo.app/Contents/Resources/mcp.js`。
- 只做了 ad-hoc 签名，没有公证。在别的机器上首次打开需要右键 → 打开，或者跑一次 `xattr -cr /Applications/Echo.app`。

图标和 muse、Caller 是一套：同样的渐变底、70px 圆头描边、`#6eb5ff` 的点。蓝点是声源，右边两道弧是它的回声，外圈更淡。
