# echoV2

桌面上的通用显示器。muse、agent，以及以后的 Data，都往这里投内容；echoV2 决定什么时候、在哪、以什么样子显示。

歌词只是其中一个内容包，不是核心的形状。

- 契约草案：[docs/CONTRACT.md](docs/CONTRACT.md)
- 目录地图和依赖规则：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 旧版参考：`../echo`（只读参考，不做全量迁移）

## 状态

M4 完成：四个主题（风铃、流体、新世纪、夜潮）；muse 在放歌时显示同步歌词，频谱驱动风铃的风和夜潮的浪；agent 的卡片在前奏、间奏或暂停时插播；新世纪由 LLM 导演排版。

第五个主题「晨报」是新做的：把同一时间的好几条内容排成一整版报纸（头条、分栏、放歌时的文芸栏），见 `screen/themes/gazette/README.md`。

第六个主题「Duo」是一台立在桌上的折叠屏手机：合上时是锁屏（通知、正在播放、StandBy），打开时是分屏（播放器和聊天），点一下开合。见 `screen/themes/duo/README.md`。

第七个主题「もち」是一只住在屏幕底边的麻薯桌宠：卡片它用对话气泡说出来，放歌时跟着节拍摇、哼着这句，没事就溜达，深夜就摊成饼睡觉。见 `screen/themes/mochi/README.md`。

第八个主题「流萤」是满屏的萤火虫：来了卡片，它们从四处飞来拼成那句话（不够就从屏幕边上再叫来一些），说完再散开；放歌时一拍一拍地加入合唱，最后整群一起闪；白天闲久了就落进屏幕底边的草丛里。见 `screen/themes/firefly/README.md`。

可以开多个窗口，每个窗口有名字、主题和「显示什么」。agent 可以点名窗口，也可以让几张卡在不同窗口同时上台（对话、接力倒数）；卡片可以循环轮播。

**面板**：按 **⌥ + 右⌘** 呼出（托盘里也有入口），和 muse 同一套设计。
- 光标停在哪个窗口上，那个窗口就在屏幕上描一圈蓝边、挂出名字，方便对上号。
- ↑↓ 选窗口，⏎ 进入这个窗口的设置：←→ 换主题、换内容、改名字，⏎ 开关显示、穿透、全屏。
- 直接打字模糊搜索：`top 流体`、`隐藏 left`，⏎ 执行。
- 输入 `/` 进入命令，一步步补全（⇥ 或 ⏎ 补全，参数齐了 ⏎ 执行）；在某个窗口的设置里可以省掉窗口名：

  | 命令 | 作用 |
  |---|---|
  | `/new [主题]` | 新增窗口 |
  | `/open <窗口>` | 打开窗口设置 |
  | `/theme <窗口> <主题>` | 换主题 |
  | `/route <窗口> <内容>` | 换显示的内容（全部 / 只放歌词 / 只放 agent 投递） |
  | `/loud <窗口> <醒目\|正常\|安静>` | 醒目上限：比它响的内容在这个窗口按它显示（安静 = 勿扰） |
  | `/skip <窗口>` | 跳过正在显示的卡片（歌词跟着播放器走，跳不了） |
  | `/clear <窗口>` | 撤下正在显示的卡片；`/clear 全部` 连排队中的一起撤 |
  | `/name <窗口> <名字>` | 改名字 |
  | `/show <窗口>`、`/hide <窗口>` | 显示、隐藏 |
  | `/click <窗口> [开\|关]` | 鼠标穿透 |
  | `/full <窗口> [开\|关]` | 全屏：像 Chrome 一样单独占一个桌面空间（三指滑动切换），其他窗口留在原处；选中窗口按 ⌃⌘F 也一样 |
  | `/reset <窗口>` | 重置位置和大小 |
  | `/close <窗口>` | 关闭窗口 |
  | `/pause`、`/resume` | 暂停、继续轮播：暂停时台上的卡片不走，暂停的时长不算进它的时间 |

  窗口的位置可以写 `全部`（或 `all`）：`/hide 全部`、`/loud 全部 安静`、`/skip 全部`。改名和关闭只能一个一个来。
- esc 逐级返回，最后收起面板。

托盘只留打开面板和逐个窗口显示或隐藏。

LLM 的 key 放在 `~/Library/Application Support/echo-v2/secrets.json`（`openaiApiKey`），没有也能用，新世纪会退回启发式排版。

```bash
pnpm install
pnpm dev      # 右上角挂出风铃；托盘里打开面板（dev 版不启用 ⌥ + 右⌘，见下）
pnpm check    # 类型检查 + lint + 测试（含架构测试）
pnpm harness  # 主题和面板的调试页，localhost:5199，Echo 开着也能用
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
- ⌥ + 右⌘ 靠 app 里的一个小程序（`native/hotkey`）监听修饰键，需要在「系统设置 → 隐私与安全性 → 输入监控」里勾选 Echo。只有打包版会申请这个权限；dev 版要试的话用 `ECHO_HOTKEY=1 pnpm dev`，会以「Electron」的名义申请。同一时间只跑一个：装好的 app 开着时，`pnpm dev` 会直接退出，因为两者共用 agent 端口和状态目录。
- 状态目录固定为 `~/Library/Application Support/echo-v2/`，不跟着 productName 走。
- 打包产物不带 node_modules：main 和 mcp 都把依赖打进单文件，所以 `package.json` 里只有 devDependencies。
- app 自带一份 MCP 脚本，不依赖仓库：`node /Applications/Echo.app/Contents/Resources/mcp.js`。
- **签名**：先跑一次 `scripts/make-signing-cert.sh`，它在独立的钥匙串 `~/Library/Keychains/echo-signing.keychain-db` 里生成自签名证书「Echo Local Signing」，不动登录钥匙串和系统信任设置。之后 `pnpm package` 会自动用它重签（`scripts/sign.cjs`），app 的签名身份固定为「com.finn.echo + 这张证书」，所以快捷键的输入监控授权在重新打包后依然有效。没有这张证书时退回 ad-hoc 签名，每次打包都要重新授权。
- 没有公证。在别的机器上首次打开需要右键 → 打开，或者跑一次 `xattr -cr /Applications/Echo.app`。

图标和 muse、Caller 是一套：同样的渐变底、70px 圆头描边、`#6eb5ff` 的点。蓝点是声源，右边两道弧是它的回声，外圈更淡。
