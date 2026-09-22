# echoV2 目录地图

> 目录结构参照 `~/Code/Prism` 的写法：后端按层级分目录，前端按模块分目录，进程入口集中在 `cmd/`，架构规则由测试执行。
> 契约的具体字段见 [CONTRACT.md](CONTRACT.md)。本文只讲"东西放在哪、谁能依赖谁"。

## 1. 顶层

```text
echoV2/
├── contract/        两侧共享的契约（对应 Prism 的 api/）
├── cmd/             进程入口 = 组合根，只做组装（对应 Prism 的 cmd/）
├── server/          显示服务器：主进程，Node（对应 Prism 的 internal/）
├── screen/          屏幕：渲染层，浏览器（对应 Prism 的 apps/console/src/）
├── architecture/    可执行的依赖规则（对应 Prism 的 architecture/）
├── scripts/         开发脚本
└── docs/            契约、目录地图
```

三个进程，各有一个入口：

| 入口 | 进程 | 组装什么 |
|---|---|---|
| `cmd/display/` | Electron 主进程 | server 的全部，加上主题的 manifest 和 grammar |
| `cmd/screen/` | 渲染层（桌面窗口加载它） | screen 的 runtime，加上主题注册表 |
| `cmd/mcp/` | stdio MCP 适配器（Claude Code 拉起） | 只把工具调用转发到 agent HTTP 接口 |

以后的手机中继也是 `cmd/` 下的一个新入口，现在不建。

## 2. server/：显示服务器

```text
server/
├── foundation/      L1 底座：store（原子写 JSON）、log、config、faults
├── providers/       L0 供应商协议，每个供应商一个目录
│   ├── muse/          /now 轮询、/spectrum WebSocket
│   ├── netease/       歌词接口
│   └── llm/           Responses 接口
├── capabilities/    L2 稳定能力，供应商由组合根注入
│   ├── lyrics/        歌词获取：缓存、兜底、逐字时间轴
│   └── director/      导演服务：按内容哈希缓存、超时、失败回退
├── packs/           L3 内容包：决定"说什么"（装哪些包由 cmd/display 决定）
│   ├── card/          agent 投来的卡片、消息、状态
│   └── music/         muse + 歌词 → 歌
├── stage/           L4 编排：决定"什么时候、放哪"
│   ├── contents.ts    内容库（内容的唯一写入方）
│   ├── scheduler.ts   调度规则
│   └── state.ts       舞台状态：rev，窗口 → 槽位
├── shell/           Electron 壳：窗口、窗口配置、托盘、显示偏好
└── api/             对外入口，只做传输：agent HTTP（10757）、给屏幕的通道
```

### 内容包的统一形状

```text
server/packs/<id>/
├── pack.ts          实现 ContentPack，唯一的对外入口
├── model.ts         来源数据 → Content（翻译成产品语言）
├── present.ts       Content → Presentation（转换成呈现原语）
└── *.test.ts
```

内容包可以在这个形状上加私有文件，比如 music 的 `signals.ts`（频谱 → energy、onset）和 `breaks.ts`（算出前奏和间奏）。外部只能通过 `pack.ts` 使用它。

## 3. screen/：屏幕

```text
screen/
├── runtime/         舞台宿主、四种时间线的时钟、信号总线、传输客户端（IPC，以后加 WebSocket）
├── primitives/      没有主题语义的工具，至少两个主题在用才放进来
│   ├── blocks/        当前该显示哪一块、toText、按容量取短版本（M1）
│   ├── text/          分词、强调词、合成逐字时间（新世纪和夜潮用）
│   ├── color/         从封面取色；由舞台宿主统一填进 context.palette，主题只读 palette
│   └── gl/            全屏着色器的小框架（流体和夜潮共用）
├── tokens/          全局 token：字体栈、chrome 的颜色
└── themes/          主题：决定"长什么样"；目录本身就是清单
    ├── plasma/        流体
    ├── eva/           新世纪
    ├── furin/         风铃
    └── tide/          夜潮
```

### 主题的统一形状

```text
screen/themes/<id>/
├── README.md        设计笔记：参照系、空闲态、仪式、音频映射
├── manifest.ts      纯数据：窗口配置、槽位、要订阅的信号；主进程也读它
├── theme.ts         实现 Theme 接口，唯一的对外入口
├── theme.css        只作用于本主题的根节点；局部 token 也定义在这里
├── grammar.ts       可选：导演规则（prompt + 解析器），纯函数，不碰 DOM
├── parts/           可选：内部零件（着色器、物理、排版引擎），外部不许引用
└── harness.html     可选：脱离 echo 单独调试
```

一个主题的全部东西都在自己的目录里：逻辑、样式、导演规则、调试页。**目录本身就是清单**，没有单独的 registry 文件。删掉这个目录，这个主题就干净地消失了。

两个入口各自按约定发现主题：

```ts
// cmd/display：只加载 manifest，拿窗口和槽位去调度
const manifests = import.meta.glob('../../screen/themes/*/manifest.ts', { eager: true })
// cmd/screen：只懒加载实现
const themes = import.meta.glob('../../screen/themes/*/theme.ts')
```

所以 `theme.ts` 永远不会在 Node 里被加载，node 的类型检查也看不到它。架构测试会核对每个主题目录都有 `manifest.ts` 和 `theme.ts`，且 manifest 能通过契约校验、id 和目录名一致。

`Theme` 接口（mount / show / update / clear / frame）定义在 `screen/runtime/`，因为它用到 DOM 类型；`contract/` 里只放两边都能编译的纯数据。同理，`ContentPack` 接口定义在 `server/stage/`。

### 旧版遗产落到哪

| 主题 | 旧版来源 | 新位置 |
|---|---|---|
| 流体 | `fx.js` 的 plasma 着色器，app.js 的 `renderStage`，style.css 的 §STAGE 和 wave 动画 | `plasma/parts/plasma.frag.glsl`、`plasma/parts/field.ts`、`plasma/parts/cards.ts`、`plasma/theme.css` |
| 新世纪 | `eva.js` 的排版引擎；director.js 里 eva 和 keyword 两份规则 | `eva/parts/layout.ts`；两份规则合进 `eva/grammar.ts`，一次调用同时给出模板和强调词 |
| 风铃 | `furin.js` 的三摆物理和风铃 DOM | `furin/parts/physics.ts`、`furin/parts/chime.ts` |
| 夜潮 | `tide.js` 的着色器、浪的排程、文字栅格化 | `tide/parts/tide.frag.glsl`、`tide/parts/waves.ts`（排程，纯逻辑）、`tide/parts/engine.ts`（栅格化和每帧驱动） |

旧版每个文件开头的长注释（设计意图）迁进各自的 `README.md`。

## 4. 依赖规则

箭头表示"可以 import"。除了 `cmd/`，谁都不能跨出下面的范围。

| 目录 | 可以依赖 | 不许 |
|---|---|---|
| `contract/` | 无 | 依赖任何目录 |
| `server/foundation/` | contract | server 下其他目录 |
| `server/providers/` | foundation | packs、stage、capabilities |
| `server/capabilities/` | foundation、contract | 直接 import providers（由组合根注入） |
| `server/packs/<id>/` | capabilities 的公开接口、foundation、contract；stage 只能通过 `server/stage/pack-api.ts` | 其他包、stage 的其他文件、providers、screen |
| `server/stage/` | foundation、contract | 出现任何包名、主题名（靠注入的注册表） |
| `server/shell/`、`server/api/` | foundation、contract、stage 的公开接口 | 理解内容 |
| `screen/primitives/` | contract | runtime、themes |
| `screen/runtime/` | primitives、contract | 出现任何主题名 |
| `screen/themes/<id>/` | primitives、tokens、contract；runtime 只能通过 `screen/runtime/theme-api.ts` | 其他主题、runtime 的其他文件、server 的任何东西 |
| `cmd/*` | 全部 | 写业务逻辑（只做组装） |

**公开 seam**：跨层只允许通过一个明确的接口文件。内容包和 stage 之间是 `pack-api.ts`，主题和 runtime 之间是 `theme-api.ts`。这相当于 Prism 的 `seam.go`。

另外三条硬规则：

1. 主题代码里不出现 `song`、`lyric`、`muse`、`netease`。
2. screen 不发外部网络请求（`<img>` 加载图片除外）。
3. 持久状态只在 server 写，并且每类状态只有一个写入方：
   - 内容、调度设置 → `stage`
   - 窗口位置、每个窗口用哪个主题、鼠标穿透 → `shell`
   - 导演缓存 → `director`

这些规则全部由 `architecture/dependencies.test.ts` 检查：扫描所有 import（包括动态 import 和 `import.meta.glob`），检查禁用词、屏幕端的网络请求、主题和内容包目录的形状。规则引擎在 `architecture/rules.ts`，`architecture/rules.test.ts` 用故意违规的例子证明它真的能拦住。

另外两道运行时 / 编译期的防线：
- 屏幕页面的 CSP 只允许 `connect-src 'self'`，外部请求在运行时就会被浏览器拒绝。
- preload 只允许 import `electron` 和 `contract/channels`，所以 zod 不会被打进沙箱 preload。

## 5. 新代码放哪

按顺序问，第一个回答"是"的就是它的位置：

1. 它懂某个供应商的协议吗？→ `server/providers/<vendor>/`
2. 它是和具体内容无关的稳定能力吗？比如缓存、超时、LLM 调度 → `server/capabilities/<name>/`
3. 它决定"说什么"吗？→ `server/packs/<id>/`
4. 它决定"什么时候、放哪"吗？→ `server/stage/`
5. 它决定"长什么样"吗？
   - 只服务一个主题 → `screen/themes/<id>/parts/`
   - 已经有两个主题在用 → `screen/primitives/`
6. 它只是窗口、托盘或传输吗？→ `server/shell/` 或 `server/api/`
7. 它要把上面几层连起来吗？→ `cmd/`

## 6. 按里程碑建目录

不提前建空目录，用到哪一层才建哪一层。

| 里程碑 | 新建 | 证明什么 |
|---|---|---|
| M1 ✓ | contract、cmd（三个入口）、foundation、packs/card、stage、shell、api、runtime、primitives/blocks、tokens、themes/furin、themes/plasma、architecture | 核心里没有歌词，也能完整跑通：agent 投卡片 → 调度 → 风铃和流体显示 |
| M2 ✓ | capabilities/director、providers/llm、primitives/text、themes/eva；themes/tide，同时把流体里的 gl 零件提到 primitives/gl | 导演服务和主题自带的规则能配合；两个 WebGL 主题共用底座 |
| M3 ✓ | providers/muse、providers/netease、capabilities/lyrics、packs/music、primitives/color | 歌词只是一个普通内容包；删掉它，前两个里程碑不受影响 |

## 7. 技术栈

| 选型 | 用途 | 为什么 |
|---|---|---|
| TypeScript（strict） | 全部代码 | 契约、跨进程边界、MCP 和 CLI 都能拿到真实类型；agent 生态以 TS 为主 |
| electron-vite | 构建 main、preload、renderer 三个目标 | 一份配置管三个进程；改主题时渲染层热更新；`?raw` 可以把着色器写成独立的 `.glsl` 文件 |
| zod | `contract/` 的唯一写法 | 一份定义同时得到 TS 类型、HTTP 入口的运行时校验、MCP 工具的输入 schema，以及给其他 agent 用的 JSON Schema |
| @modelcontextprotocol/sdk | `cmd/mcp` | 官方 TS SDK，工具的输入 schema 直接用 zod |
| tsup | 构建 `cmd/mcp`（以后还有 `cmd/cli`） | 这些入口不跑在 Electron 里，打成单文件的 Node 脚本就行 |
| Vitest | 单元测试和 `architecture/dependencies.test.ts` | 和 Prism 一致；测试文件放在被测文件旁边 |
| ESLint + typescript-eslint | 代码规范 | 和 Prism 一致 |
| pnpm | 包管理 | 和 Prism 一致 |

### TS 带来的额外约束：两套 tsconfig

```text
tsconfig.json            只做 references
tsconfig.base.json       共享选项和路径别名：@contract、@server/*、@screen/*
tsconfig.node.json       server/、cmd/display、cmd/mcp、contract/：有 Node 类型，没有 DOM
tsconfig.web.json        screen/、cmd/screen、contract/：有 DOM 类型，没有 Node
```

这样"server 不碰 DOM、screen 不碰 Node"就在编译期被卡住了，不用等架构测试。`contract/` 两边都会编译，所以它只能用两边都有的东西。

### 契约的写法

```text
contract/
├── content.ts         Content、Presentation、Timeline、Block 的 zod schema
├── stage.ts           StageState、OnAir、SignalFrame
├── theme.ts           ThemeManifest、SlotSpec
├── channels.ts        主进程和屏幕之间的通道表：频道名 → 载荷类型
└── index.ts
```

- 类型一律从 schema 推出来（`z.infer`），不另外手写。
- `channels.ts` 是跨进程通信的唯一清单。preload 按它暴露接口，屏幕按它订阅，以后的 WebSocket 通道实现同一张表。旧版 `window.api` 在桌面和手机各写一份、靠人工对齐的问题，由类型检查兜住。

### 顶层会多出这些配置文件

```text
package.json  pnpm-lock.yaml  electron.vite.config.ts  tsup.config.ts
tsconfig.json  tsconfig.node.json  tsconfig.web.json  eslint.config.js  vitest.config.ts
```

### 已知代价

- 多了构建步骤。开发时用 `electron-vite dev`，发布前用 `electron-vite build`。
- 主题的 `harness.html` 不能再直接双击打开，要作为 Vite 的多页面入口，用 dev server 打开。
- electron-vite 是第三方工具。它只负责构建，不侵入代码，以后要换成 tsc + esbuild 脚本也只改配置。
