# echoV2 契约草案 v0

> 状态：v0，M1 已按此实现（代码在 `contract/`）。改契约先改这份文档，再改 zod schema。
> 参考：`../echo` 是旧版，只拿来借鉴场景和经验，不做全量迁移。

## 1. 定位

echoV2 是一个桌面显示器。它回答四个问题，每个问题有且只有一个负责方：

| 问题 | 负责方 | 住在哪 |
|---|---|---|
| 说什么 | 内容包 | 主进程 |
| 什么时候、谁优先 | 调度器 | 主进程 |
| 显示在哪 | 窗口和槽位 | 主进程管窗口，主题声明槽位 |
| 长什么样 | 主题 | 屏幕（渲染层） |

**主进程是显示服务器，渲染层只是屏幕。** 内容的获取、翻译、增强和调度都在主进程完成。屏幕只接收"舞台状态"并画出来。手机、第二块显示器都只是另一块屏，订阅同一份舞台状态。

## 2. 判定标准

下面这些规则由 `architecture/dependencies.test.ts` 自动检查（第 1 条要等 M3 有了 music 包才能验证）：

1. 删掉 `music` 内容包，echoV2 照样能启动，并能显示 agent 投进来的卡片。
2. 主题代码里不出现 `song`、`lyric`、`muse`、`netease`。声明了 `kinds: ['song']` 的专属主题除外。
3. 内容包不碰 DOM，也不引用主题；主题也不引用内容包。两边只通过 Presentation 打交道。
4. 屏幕不发外部网络请求（`<img>` 加载图片除外）。
5. 持久状态只有主进程写。屏幕上只有临时的动画状态。
6. 核心代码（调度、舞台宿主）里不出现任何主题名或内容类型名，一律通过注册表分发。

## 3. 核心概念

### 3.1 Content：内容

内容包产出，写入主进程的内容库。同一个 `id` 再写一次就是原地更新：
- 还在排队的内容保留原来的排队位置（`createdAt` 沿用第一次写入的值）。
- 已经在台上的 `self` 内容：只是追加了块或改了数值，时钟接着走；已写出的文字被改写了（比如重发一遍倒计时），就从头播，停留时长也重新算。

```ts
type Content = {
  id: string;                 // 内容包内稳定，比如 'music:now'、'card:ja-0142'
  pack: string;               // 'music' | 'card' | ...
  kind: string;               // 包内类型：'song' | 'word' | 'fact' | 'headline' | 'status' | 'message'
  priority: 'ambient' | 'normal' | 'urgent';
  createdAt: number;          // epoch ms
  expiresAt?: number;         // 到点自动下架（新闻、临时提醒）
  presentation: Presentation; // 内容包负责转换，调度器和主题都只看这个
};
```

### 3.2 Presentation：呈现（中间表示）

所有内容都转换成同一种形状：**上下文 + 时间线 + 一组带角色的块**。

```ts
type Presentation = {
  context: {
    title?: string;           // 这是关于什么的：歌名、"日语 · 第 3 天"、"CI"
    byline?: string;          // 署名 / 出处：歌手、"Reuters · 10:32"
    art?: string;             // 代表图 URL（封面、头像）
    palette?: string[];       // 主色；没有就由屏幕从 art 取色
    speaker?: { name: string; avatar?: string };  // 谁在说：歌手、Claude、某个联系人
  };
  timeline: Timeline;
  blocks: Block[];
  hints?: {
    dwell?: number;           // 建议停留秒数（self 时间线用）
    salience?: 'quiet' | 'normal' | 'attention';
    breaks?: { at: number; until: number }[];  // 可插播的空档（歌的前奏、长间奏），由内容包算好
  };
  ext?: Record<string, unknown>;  // 专属主题的扩展数据，键名带包前缀，比如 'music.songId'
};
```

### 3.3 Timeline：时间线

| kind | 时钟从哪来 | 典型内容 |
|---|---|---|
| `media` | 外部媒体时钟（位置 + 采样时刻 + 速率 + 版本号） | 歌词 |
| `self` | 上台那一刻开始计时 | 单词卡、知识卡、消息 |
| `wall` | 真实时间 | 会议倒计时、限时提醒 |
| `none` | 没有时间，只有状态 | CI 状态、指标 |

```ts
type Timeline =
  | { kind: 'media'; position: number; sampledAt: number; rate: number; version: number }
  | { kind: 'self' }
  | { kind: 'wall'; start?: number; end?: number }
  | { kind: 'none' };
```

- `media` 沿用旧版 NOW_PLAYING 的做法：屏幕按 `sampledAt` 重锚；`version` 一变就硬跳，不平滑。
- 屏幕给每个在台上的内容算一个本地时间 `t`：`media` 是媒体位置，`self` 是上台后的秒数，`wall` 是当前时刻，`none` 没有 `t`。

### 3.4 Block：块

```ts
type Role = 'primary' | 'secondary' | 'annotation' | 'attribution';

type Block =
  | { type: 'text';     role: Role; text: string; at?: number; until?: number;
      emphasis?: string; reading?: string; lang?: string;
      short?: string;                               // 短版本，给容量小的主题（比如风铃的短冊）
      timing?: { at: number; len: number }[] }      // 逐字 / 逐词时间：从 at 起算的秒数 + 字数
  | { type: 'value';    role: Role; value: number | string; unit?: string; label?: string; delta?: number }
  | { type: 'progress'; role: Role; value: number; max: number; label?: string }
  | { type: 'image';    role: Role; src: string; alt?: string };
```

- `at` / `until` 是相对这个内容时间线的秒数。不写 `at` 表示一上台就出现。
- `emphasis` 必须是 `text` 里的原文子串。它可以由内容包直接给，也可以由导演服务补上。
- `reading` 是整块的读音（注音），主题决定画成 ruby 还是副行。
- `timing` 可选。歌词有逐字时间轴就填；没有的话，需要逐字写出的主题由屏幕按打字速度合成。
- `short` 可选。槽位放不下 `text` 时先用它；还放不下就只画 primary 块。
- **文字是通用的兜底**：核心提供 `toText(block)`，只能画文字的主题可以把 value、progress 块降级成一行字。

### 3.5 Slot：槽位

主题声明自己有哪些位置。调度器往每个槽位里放**一个**内容；一个内容怎么在槽位内部分布（上下文放哪、块放哪），由主题自己决定。

```ts
type SlotSpec = {
  accepts: Block['type'][];                  // 能画的块类型；没列出的走 toText 兜底
  timelines: Timeline['kind'][];             // 能处理的时间线
  kinds?: string[];                          // 专属槽位才写，比如卡拉OK 只写 ['song']
  role: 'main' | 'side' | 'ambient';         // 调度器按这个排座次
  maxChars?: number;                         // 一个块最多放几个字，超出就用 short
};
```

### 3.6 StageState：舞台状态

主进程是唯一写入方，通过 IPC 推给桌面屏幕，通过 WebSocket 推给其他屏幕。

```ts
type StageState = {
  rev: number;                               // 每次变化加一，屏幕只认比自己新的
  surfaces: Record<string, {                 // 窗口 id → 窗口
    name?: string;                           // 用户起的窗口名（main、left、right……），agent 按名字表达偏好
    profile: string;                         // 窗口配置：headline | subtitle-strip | card | ambient | overlay | ...
    theme: string;
    accepts?: { packs?: string[]; kinds?: string[] };  // 这个窗口收什么；不写就是全收（§5）
    fallback?: boolean;                      // 兜底窗口：也收「没有任何可见窗口收」的内容
    hidden?: boolean;                        // 被用户隐藏：不分配任何内容
    slots: Record<string, OnAir | null>;
  }>;
};

type OnAir = {
  contentId: string;
  presentation: Presentation;
  since: number;                             // 上台时刻（epoch ms），self 时间线从这里算
  directions?: unknown;                      // 导演按当前主题的 grammar 给出的结果；没有就是还没回来或不需要
};
```

高频信号（音频能量、onset，约 30fps）不进舞台状态，走单独的信号通道：

```ts
type SignalFrame = { t: number; source?: string; energy?: number; onset?: number; centroid?: number; bands?: number[] };
```

onset 检测在产生信号的内容包里做（比如 music 包），屏幕只接收结果。`source` 是信号所属内容的 id：屏幕只把它交给正在放这条内容的主题，所以多窗口时只有放歌词的那个窗口随音乐动。不写 `source` 的信号发给所有屏幕。

## 4. 接口

### 4.1 内容包（主进程）

```ts
type ContentPack = {
  id: string;
  kinds: string[];
  start(ctx: PackContext): void;   // 连接自己的来源：轮询 muse、监听 agent API、读 Data
  stop(): void;
};

type PackContext = {
  upsert(content: Content): void;              // stage 会用 zod 校验一遍
  remove(id: string): void;
  emitSignal(frame: SignalFrame): void;        // 只有音乐这类有能量来源的包会用
};
```

这两个接口定义在 `server/stage/pack-api.ts`，是内容包唯一能碰的 stage 文件。

### 4.2 主题（屏幕）

```ts
type ThemeManifest = {
  id: string;
  label: string;
  window: string;                          // 默认窗口配置
  slots: Record<string, SlotSpec>;
  signals?: ('energy' | 'onset' | 'daylight' | 'palette')[];
};

type Theme = {
  mount(root: HTMLElement, ctx: ScreenContext): void;
  unmount(): void;
  show(slot: string, onAir: OnAir): void;    // 上台：换内容仪式在这里
  update(slot: string, onAir: OnAir): void;  // 同一内容更新：媒体跳转、状态值变化
  clear(slot: string): void;                 // 下台
  frame(clock: FrameClock): void;            // 每帧
  idle?(): void;                             // 所有槽位都空了
};

type FrameClock = {
  now: number;                               // performance.now()
  slots: Record<string, { t?: number }>;     // 每个槽位里内容的本地时间
};
```

`Theme` 接口定义在 `screen/runtime/theme-api.ts`，是主题唯一能碰的 runtime 文件。`theme.ts` 默认导出一个工厂函数，每次挂载都新建一个实例。

一个主题一个目录，放逻辑、样式、局部 token 和它自己的导演规则。

### 4.3 Agent API（主进程，HTTP）

- 地址：`127.0.0.1:10757`，只监听本机。
- 每个请求都要带 `x-echo-token`，否则拒绝，避免网页往 localhost 发请求塞内容。

| 方法 | 路径 | 做什么 |
|---|---|---|
| `POST` | `/contents` | 写入或更新一条内容（由 `card` 包接收并校验）。返回 `{id, updated, state, surface?, note?}`：`updated` 表示这个 id 原本就在，`state` 是 `on-air` 或 `queued`，`surface` 是上台的窗口名，`note` 说明点名的窗口为什么没用上 |
| `DELETE` | `/contents/:id` | 撤回一条 |
| `DELETE` | `/contents?group=` | 撤回同一批（`group` 相同）的全部内容，返回 `{removed}` |
| `GET` | `/contents` | 内容库里还有什么，按上台顺序排（优先级高的在前，同级先来的在前） |
| `GET` | `/stage` | 当前舞台状态：什么在台上、在哪个槽位 |

`POST /contents` 的请求体是 `AgentCardInput`（`contract/agent.ts`），比完整的 Content 更友好：agent 只描述一张卡（几行文字、说话人、停留时长，或者一个状态值），card 包负责把它转换成 Presentation。需要完全控制时，可以直接传 `presentation`。

有时间节奏的内容（倒计时、分步提示）一次发完：每一帧写成一行，用 `at` 标出它在卡片上台后第几秒出现，echo 自己按时间播。不要每一帧调用一次，那样节奏会被调用延迟拉乱。

token 首次启动时生成，存在 `~/Library/Application Support/echo-v2/agent-token`。

MCP 是一层薄薄的 stdio 适配器（`cmd/mcp`），三个工具分别转发到这组 HTTP 接口：

| 工具 | 转发到 | 用途 |
|---|---|---|
| `show` | `POST /contents` | 投一张卡；输入 schema 直接来自 `AgentCardInput` |
| `status` | `GET /stage` + `GET /contents` | 现在在显示什么，队列里还有什么。只返回摘要：每个槽位给 id、kind、优先级、`title`、`headline`（第一行主文字）、上台秒数，不带 blocks |
| `clear` | `DELETE /contents/:id` 或 `?group=` | 按 id 撤回一张，或按 group 撤回一整批 |

### 4.4 导演服务（主进程）

分三层：

- **LLM 接入**：只管供应商协议。
- **导演服务**：负责缓存（按内容哈希）、超时和失败回退，永远不挡显示。
- **规则**：归主题所有，prompt 和解析器都放在 `screen/themes/<id>/grammar.ts`，由组合根注册到导演服务。
  内容上台后，主进程如果发现当前主题有 grammar，就请求导演，结果写进 `OnAir.directions` 推给屏幕。

主题的规则写成 `Grammar`（`contract/theme.ts`），只能是纯数据加纯函数，因为主进程要加载它：

```ts
interface Grammar {
  version: number;                                   // 改了 prompt 或输出格式就加一，旧缓存自动作废
  instructions: string;
  prepare(p: Presentation): { input: string; key: string } | null;  // key 决定缓存
  parse(output: string, p: Presentation): unknown;   // 解析不了返回 null
  adopt?(byText: Record<string, Record<string, unknown>>, p: Presentation): unknown;  // 可选：收编旧导演按行文本存的结果
}
```

- **调度层只拿到一个通用钩子** `direct(theme, presentation)`，由 `cmd/display` 接到导演服务上。每个（槽位、内容、主题、文字）组合只问一次；同一内容的文字变了，旧结果作废并重新问。
- **只有文本块达到 4 个的内容才请求导演**，短卡直接用主题的启发式。
- **缓存**：按 `主题.v版本.内容哈希` 落盘到 `userData/director-cache/`。同一内容的并发请求共用一次调用；失败不写缓存，下次自动重试。
- **旧缓存收编**：新缓存没命中时，先查 `cmd/display` 配置的旧目录（现在是旧版 echo 的 `eva.v1` 和 `keyword.v1`，后者的值并入 `kw`）。这些文件按行文本建键，文件名的哈希已经没法复算，所以按覆盖率来找：某个文件覆盖这份内容 ≥90% 的不重复行，就算同一份内容。找到后交给主题的 `adopt` 转成新格式，按和 LLM 结果一样的方式写进新缓存；找不到才问 LLM。旧目录只读，不会被改动。
- **key**：放在 `~/Library/Application Support/echo-v2/secrets.json`（`openaiApiKey`、可选的 `openaiModel`、`openaiBaseUrl`）。没有 key 时导演保持静默。
- **结果按块的位置对应**：比如新世纪的 `{ cards: [...] }`，第 i 项对应第 i 个块。

已知限制：导演一次大约要 10–15 秒。一张马上上台的短卡，第一次显示时通常只能用启发式；结果进了缓存，下次同样的内容就能直接用上。歌词（M3）会提前全部知道，所以不受影响。

## 5. 调度规则 v0

1. 每个槽位最多放一个内容。
2. 候选内容先按 `priority` 排，再按时间排。
3. 内容的块类型和时间线必须被槽位接受；写了 `kinds` 的槽位只接对应类型。
4. `urgent` 可以打断 `main` 槽位；`normal` 等槽位空出来，或者等当前 `self` 内容的 `dwell` 到期；`ambient` 只在所有槽位都空时上台。
5. `media` 内容（歌词）在台上时，只有一个槽位的主题不接 `normal` 内容，除非当前时间落在 `hints.breaks` 标出的空档里（前奏、间奏）。
6. 频率上限、免打扰时段作为全局设置，由主进程持有。
7. **多窗口路由**：窗口的 `accepts` 决定它收什么，匹配内容的 `pack` 和 `kind`，不写就是全收。`fallback` 窗口还会收「没有任何可见窗口收」的内容，所以隐藏或关掉一个窗口时，它的内容会转到兜底窗口，窗口回来后再分流回去。隐藏的窗口不参与分配。规则只比较字段值，具体的取值（比如「只放歌词」= `packs: ['music']`）由托盘预设写进用户偏好。
8. **先填空槽，再抢占**：先把排队的内容放进所有空槽；还没安置的才按第 4、5 条去抢；被抢下来的内容再补一轮空槽。所以只要别的窗口有空位，就不会把谁挤下台。
9. **ambient 按窗口判断**：一个空槽能不能放 ambient 内容，只看同一个窗口里有没有更重要的内容在台上，以及有没有更重要、并且能进这个槽的内容在排队。单窗口时等同于第 4 条。
10. **循环内容**：`repeat: true` 的内容播完不删除，而是回到队尾（`createdAt` 刷新为当前时刻），同一批按顺序轮流上台。agent 投的循环卡片默认是 ambient，所以只在窗口空闲时轮播，新来的卡片照常优先；被打断的循环卡片不算播完，保留原来的位置。下架靠 `ttlSeconds` 或按 group 撤回。调度器本身不知道循环：它只报告哪些内容播完了，由舞台服务决定消化还是重新排队。
11. **窗口偏好**：内容可以带 `window`（窗口名）。点名的窗口存在、可见、并且它的 `accepts` 收这条内容时，内容只进这个窗口，哪怕别的窗口空着也不去；否则当作没点名，按第 7 条正常路由，内容不会丢。用户的路由永远优先：只收歌词的窗口，agent 点名也进不去。`show` 的返回会说明实际去了哪个窗口，没按偏好走时附上原因。窗口名由用户在托盘里起，main 固定叫 main，其他窗口默认叫 win2、win3……
12. **一起上台**：带同一个 `together` 的内容要么在同一轮一起上台、共用同一个 `since`（各自的 `at` 因此对得上），要么都不上。一组内容可以按优先级抢占（normal 可以挤掉 ambient），ambient 的组只进安静的窗口。凑不齐时整组等待，并把它能用的空窗口留着，不让排在后面的内容占走，免得一直凑不齐；如果根本凑不齐（比如点名的窗口被隐藏，几张卡只剩一个窗口可去），就不占位。组里有一张还在台上时，其余的不单独重新上台，所以循环的组会整组一起回来。没有超时降级：凑不齐就一直等，靠 `ttlSeconds` 或 `clear` 收尾。

## 5.1 音乐内容包的约定（M3）

- **只有一份内容**：id 是 `music:now`，kind 是 `song`。时间线是 `media`，位置、采样时刻、速率、版本号直接来自 muse 的 `/now`。
- **只在时间线断开时重新发布**：换歌、播放 / 暂停切换、拖动进度，这三种情况 muse 会把 `stateVersion` 加一，只有这时才重新发布。其余时候由屏幕自己推算媒体时钟。
- **优先级跟着播放状态走**：
  - 播放中是 `normal`，其他 normal 内容只能在 `hints.breaks` 里插播；
  - 暂停时降为 `ambient`，任何更重要的内容都可以先上台，恢复播放后歌词再回来。
- **空档怎么算**：
  - 前奏：第一句之前，至少 8 秒；
  - 长间奏：两句之间至少 8 秒；
  - 尾奏：最后一句之后。
  - 纯音乐没有歌词，整首都算空档，块只有一个：歌名。
- **每句歌词是一个 text 块**：`at` 是这句的开始时间。网易云有逐字时间轴时，写进块的 `timing`。
- **频谱转成信号**：muse 的 `/spectrum` 在内容包里转成 `energy`（rms）、`onset`（谱通量检测）和 `centroid`，屏幕只接收结果。
- **muse 消失时撤下**：连续 5 次（约 4 秒）拿不到播放状态，就移除这首歌。
- **封面**：只给 `context.art`。屏幕的舞台宿主从封面取色，填进 `context.palette`，所以主题只需要读 palette。

已知限制：
- **可能等很久**：一首歌从头到尾都没有长空档时，等着插播的卡片会一直等，直到下一首歌的前奏，或者你按下暂停。
- **可能盖住开头几句**：卡片上台后会停留到自己的 dwell 结束，所以可能盖住空档后面的前一两句歌词。

## 6. 纸面走查

v1 只迁移这四个主题：**流体、新世纪、风铃、夜潮**，其余主题不迁移。

### 6.1 四个主题各需要什么

| | 流体 | 新世纪 | 风铃 | 夜潮 |
|---|---|---|---|---|
| 旧版实现 | stage 布局（写在 app.js 里）+ plasma 着色器 | eva.js，475 行 | furin.js，489 行 | tide.js，482 行，WebGL |
| 窗口 | ambient，全屏 | ambient，全屏 | hanging，300×470，挂在右上角 | ambient，全屏 |
| 槽位 | 1 个 | 1 个 | 1 个 | 1 个 |
| 怎么用文字 | 一次一段，逐字浮现，旧的一段带着模糊飘走；每换一段给着色器一次 pulse | 一次一段，做成硬切字卡，强调词标红，导演给每段选模板 | 一次一段短文字，竖写在短冊上；换段时吹一口风 | 按时间逐字写出；下一段开始的那一刻，浪头正好打到 |
| 要不要提前知道后面的内容 | 不要 | 要：导演读完整份剧本再分配轻重 | 不要 | 要：浪得提前出发才能准点到 |
| 要不要逐字时间 | 不要 | 不要 | 不要 | 要：没有就合成 |
| 主色 | 用，作为着色器的中间色 | 不用 | 不用 | 用，作为浪的光 |
| 音频信号 | 不用 | 不用（旧版已经删掉 A.T. 力场） | energy → 风，onset → 阵风，频谱重心 → 铃声的色调 | energy → 浪能冲多远，onset → 节拍 |
| 空闲态 | 流体照常流动 | 「待機 / ACTIVITY : NONE」 | 空白短冊，风铃照样摇 | 只剩浪，相当于屏保 |
| 换内容时的仪式 | 无 | 硬切到「待機」，等第一段上来 | 无 | 无 |

结论：四个主题都是**单槽位、以文字为主、空闲态本身就好看**的。它们都不需要原生支持 value、progress、image，这几类块全部走 `toText` 兜底即可。

### 6.2 四种内容转换成 Presentation

| 内容 | context | timeline | blocks |
|---|---|---|---|
| 一首歌 | title=歌名，byline=歌手，art=封面，speaker=歌手 | `media`；`hints.breaks` 标出前奏和长间奏 | 每句一个 `text`/primary，带 `at`；网易云有逐字时间轴就填进 `timing` |
| 单词卡 | title="日语 · 第 3 天"，speaker=Claude | `self`，dwell=16 | 巡り合う（primary，reading=めぐりあう，at=0）→ 偶然相遇；邂逅（secondary，short=邂逅，at=4）→ 旅先で旧友に巡り合う（annotation，at=8） |
| CI 状态 | title="CI"，byline="main 分支" | `none` | `value`/primary：3，unit="个失败" |
| agent 消息 | speaker=Claude | `self`，dwell=10 | `text`/primary：消息正文，太长时附带 `short` |

### 6.3 四个主题怎么画这四种内容

| | 流体 | 新世纪 | 风铃 | 夜潮 |
|---|---|---|---|---|
| 一首歌 | 和旧版一样：每句逐字浮现，旧句带着模糊飘走 | 和旧版一样：每句一张字卡，导演按整首歌分配模板 | 和旧版一样：每句竖写在短冊上，歌声化作风 | 和旧版一样：逐字写出，浪准点打到下一句 |
| 单词卡 | 单词、释义、例句依次浮现，读音画成 ruby | 单词用 giant 模板，释义用 whisper，例句用 stack；导演一次读完三段 | 短冊只写单词和读音，释义用 `short`，例句不上短冊 | 先写出单词；4 秒后一道浪把它带走，写出释义；再下一道浪写出例句 |
| CI 状态 | 经 `toText` 变成"CI · 3 个失败"，作为一段浮现 | 经 `toText` 变成一张字卡，数字当强调词标红 | 经 `toText` 写上短冊 | 经 `toText` 写出来；没有时间线，所以不发浪 |
| agent 消息 | 作为一段浮现 | 一张字卡 | 写上短冊，太长就用 `short` | 写出来，dwell 结束时一道浪把它带走 |

### 6.4 走查发现的问题

标 ✓ 的已经改进了上面的契约。

1. ✓ **逐字时间不是音乐专属的。** 夜潮要逐字写字，单词卡和消息也一样要。所以 text 块新增可选字段 `timing`，没有时由屏幕合成；原来的 `ext['music.syllables']` 删掉。
2. ✓ **主题容量差别很大。** 风铃的短冊只放得下二十来个字，旧版超过 22 字就缩到 12px。所以 text 块新增可选字段 `short`，槽位新增 `maxChars`：超长时先用 `short`，还放不下就只画 primary 块。
3. ✓ **插播空档改用通用字段 `hints.breaks`。** 这样调度器不需要认识音乐。
4. **四个主题都只有一个槽位，所以"一屏多内容"在 v1 用不上。** 和音乐共存有两条路：
   - **同窗口轮流**：放歌时只在前奏、间奏或暂停时插播（规则 5）。
   - **双窗口并存**：歌词留在全屏的流体、新世纪或夜潮里，agent 的内容进右上角的风铃。窗口本来就用 id 标识，契约不用改，只是调度要支持"按窗口分配"。

   我倾向第二条：风铃本来就是桌面上的小摆件，很适合当常驻的第二块屏。**待决定。**
5. **有的主题需要提前知道后续内容。** 新世纪的导演要读整份剧本，夜潮的浪要提前出发。所以写入内容时，blocks 必须是完整的剧本。流式内容（以后的实时讯息）用同一个 id 更新并追加 blocks，主题在 `update` 里处理追加。
6. **v1 只需要实现 text 块。** value、progress、image 在四个主题里都走 `toText`。类型先留在契约里，暂时不写原生渲染。
7. **翻译行的问题在 v1 消失了。** 用到翻译的是卡拉OK，它不在迁移范围内。
8. **只有新世纪用导演。** 流体、风铃、夜潮都不需要 LLM，v1 的导演服务只需要支撑新世纪的模板规则和强调词。
9. **旧版注释和代码不一致。** 旧版 themes.js 的注释说新世纪会消费 onset，但 eva.js 已经删掉了这部分。迁移时以代码为准。

## 7. 不做的事

- 插件市场、动态加载、agent 传任意 HTML 的万能组件。
- 预先造原语。现在的四种块类型来自上面四种真实内容，出现真正的复用再加。
- 强求每个主题支持所有内容。声明"不支持"是正常的，由 `toText` 兜底或调度到别的槽位。
- 多窗口先不做，但窗口用 id 标识，不写死"只有一个"。
- 用户反馈（记得 / 忘了）先不做，但每个内容都有稳定的 `id`，以后可以按 id 回传事件。


## 8. 待定

- ~~要迁移哪些主题~~：已定，流体、新世纪、风铃、夜潮。
- 和音乐怎么共存：同窗口轮流，还是双窗口并存（见 6.4 第 4 条）。
- 频道和轮播的概念放在内容包里，还是放在调度器里。
- 技术栈：原生 ES modules 加 JSDoc 类型和 `tsc --checkJs`，还是直接上 TypeScript。
- 手机屏幕在哪个版本接入。
