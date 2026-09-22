# echoV2

桌面上的通用显示器。muse、agent，以及以后的 Data，都往这里投内容；echoV2 决定什么时候、在哪、以什么样子显示。

歌词只是其中一个内容包，不是核心的形状。

- 契约草案：[docs/CONTRACT.md](docs/CONTRACT.md)
- 目录地图和依赖规则：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 旧版参考：`../echo`（只读参考，不做全量迁移）

## 状态

M1 进行中：架子已搭好（配置、三个入口、zod 契约、架构测试），窗口能拉起并收到舞台状态。下一步是内容库、调度器和 agent HTTP 接口。

```bash
pnpm install
pnpm dev      # 右上角出现一个透明窗口，显示"echo · 待机"
pnpm check    # 类型检查 + lint + 测试（含架构测试）
```
