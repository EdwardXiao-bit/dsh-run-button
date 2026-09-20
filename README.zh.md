# dsh-run-button

**给 DSH 回答里的每一个命令行代码框加一个「运行」按钮。** 点一下命令就在宿主机上执行，stdout/stderr 实时流进**右下角的浮动面板**（默认行为）。**不需要任何可选插件**：另有一个 `Panel` 模式可以把每个运行送进底部工作台标签页，而它才是唯一用到 [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) 的模式 —— 见[三种输出位置](#三种输出位置)。

> 状态：`0.1.0` —— 可工作的插件包，纯手写（无打包器、无 TypeScript 构建）。

<p align="center">
  <a href="README.md">English</a> · <b>中文</b>
</p>

---

## 为什么做它

DSH 把回答渲染成 Markdown，而代码框只提供一个操作：**复制**。每次回答里出现想试的命令（一段 `git`、一个 `pnpm` 脚本、一条诊断命令），你都得复制 → 切终端 → 粘贴 → 回车。

这个插件补上缺的那个动词。语言是命令行的代码框会在「复制」旁边多一个 **▶ 运行**。点它之后：

- 命令在**宿主机**上执行，用它所在会话自己的工作目录与沙箱；
- 输出流进**右下角的浮动面板（dock）** —— 每个运行一张卡片，最新的在最上面，始终不覆盖对话区；
- 按钮反映状态：`▶ 运行` → `■ 停止` → `✓ 运行`（退出码 0）/ `✕ 运行`（非 0 或被终止）；
- 输入框上方的运行条列出进行中与最近的运行：点 chip 重新展开该运行的卡片，点它的 `×` 丢弃该运行；
- 长时间运行的命令可以从按钮、浮动卡片或底部标签页里停止。

### 三种输出位置

三种模式，可在运行条上切换（`Dock` / `Panel` / `Off`），选择会被记住：

| 模式 | 输出去哪 | 需要额外装东西吗 |
| --- | --- | --- |
| **Dock**（默认） | 右下角固定堆叠，每个运行一张浮动卡片 | 不需要 |
| **Panel** | 每个运行一个底部工作台标签页 —— 就是终端所在的那个面板 | [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) |
| **Off** | 不渲染输出；按钮仍反映状态 | 不需要 |

`Panel` 是通过 `dsh-better-sidebar` 公开的 `ctx.betterSidebar` 服务提供的（`registerTab` + `openTab({ target: 'bottom' })`），与它内置的终端 / git / 任务标签页用的是同一个扩展点。该插件是**可选**依赖：没装时 `Panel` 会被置灰，`Dock` 仍是默认，所以这个插件不依赖任何额外东西就能完整使用。

卡片**刻意不锚定**在发起它的代码框上。锚定看起来更整齐，直到该代码框滚出虚拟化列表、锚点查不到，同一个运行就会**同时出现在两处**。固定的右下角面板没有这种失效模式。

## 识别哪些代码框

当代码框的 info string 是命令行语言时才会出现按钮：

| 语言标记 | 按钮文字 |
| --- | --- |
| `bash`、`sh`、`zsh`、`shell`、`shellscript` | `▶ Run` |
| `console` | `▶ console` |
| `powershell`、`pwsh`、`ps1` | `▶ PowerShell` |
| `cmd`、`bat`、`batch`、`dos` | `▶ cmd` |

其他代码框（`js`、`python`、`json` 等）保持原样：执行它们需要自行拼装解释器调用，那是另一个功能。

## 安全姿态

这是一个**由用户主动触发**的执行入口，并且刻意不比 Agent 本身更强：

- 一次运行继承调用会话的**沙箱策略**（`ctx.sandboxPolicy.resolve`）与**工作目录**；点运行能到的范围不会超过该会话里 Agent 能到的范围。
- 命令**按代码框里写的样子**执行，不做任何插值，也不从模型输出拼接 shell 字符串。
- RPC 通道仅限本机回环，并且位于 Connection 自带的信任栅栏与浏览器鉴权之后；没有凭据的请求直接 `401`。
- 执行是异步的，界面不会阻塞；插件停止或更新时会杀掉仍在运行的进程，重载后不留孤儿进程。
- 每条流上限 256 KB；被沙箱拦截的命令会把执行器自己的拒绝信息显示在面板里。

## 安装

### 装进本地 profile（开发）

```bash
# 把包 junction 进 profile 的 node_modules 并挂载
dsh dev inject <path-to>/dsh-run-button
```

超级注入器的 `dev_inject_plugin` 接受包目录。要持久安装则写进 profile：

```json
{
  "dependencies": { "dsh-run-button": "link:/absolute/path/to/dsh-run-button" },
  "dsh": { "profile": { "bundles": ["...", "dsh-run-button"] } }
}
```

然后重启 DSH（客户端半边只需刷新页面）。

### 从 npm 安装

```bash
npm install dsh-run-button
```

## 使用

1. 让 Agent 给一条命令，或自己写一个 `bash`/`powershell` 代码框。
2. 点代码框标题栏里的 **▶ 运行**。
3. 输出出现在**右下角的浮动面板**里（默认 Dock 模式）。每个运行一张卡片：运行中可 **stop**、**collapse** 折叠输出、**close** 丢弃该条。
4. 想改输出位置就点运行条右侧的 **Dock / Panel / Off**；切到 `Panel` 时改为每个运行一个底部工作台标签页（那个标签页有 **Stop**、**Copy**、**Close** 和一个 **Clear finished** 式的列表）。
5. 点 **cwd 小标签**（运行按钮旁）可为该代码框指定工作目录；选择会在本会话内记住。

## 实现

一个 Cordis 插件包，两个半边：

```
dsh-run-button/
├── package.json          dsh.bundle.patch + dsh.client {platform:"web"}
├── cordis.patch.yml      profile 行：- insert: [{id: run-button, name: dsh-run-button}]
├── lib/index.js          HOST  — ESM Cordis 插件
├── lib/client.js         CLIENT — 经典脚本 bundle（window.__ModuleLoader__）
├── scripts/check-client.mjs      浏览器 bundle 的解析闸门 + 未声明全局审计
└── scripts/simulate-client.mjs   在真实 DOM 上挂载并走完整链路
```

**Host 半边**（`lib/index.js`）挂一条专用回环 RPC 通道 `/dsh-run-button`，端点 `info`、`start`、`output`、`input`、`kill`。`start` 解析会话的 cwd 与沙箱策略，然后用内置 `shell` 服务（`ctx.shell.resolve` → `ctx.shell.start`）启动命令并持有后台进程句柄。`output` 读取**增量** delta（`readOutput()` 不会重复吐已读内容），返回 JSON 安全的视图：状态、退出码、信号、cwd、沙箱模式与累积输出。所有副作用都是 `ctx.effect`，其中包含卸载时杀掉活动进程。

**Client 半边**（`lib/client.js`）做三件事：

1. `MutationObserver` 扫描会话区里的 `[data-code-block-banner]`，读出语言与 `<pre>` 文本，把运行按钮与 cwd 小标签**追加为 banner 动作行的尾部子节点** —— React 的 reconciler 从不枚举 DOM 子节点，因此尾部额外节点能在重渲染中存活。由于记录超过 100 条时列表会虚拟化，扫描在 mutation 与滚动时各跑一次。
2. 运行存储通过 `connection.rpc.call` 每 180 ms 轮询 `output` 并通知订阅者；React 视图都从这一份存储渲染，所以按钮、运行条与输出面板三者始终一致。
3. 右下角 dock 是一个固定容器，每个运行一张卡片；`Panel` 模式下改为通过 `ctx.betterSidebar.registerTab(...)` 注册 per-run 标签页，并用 `openTab({ target: 'bottom' })` 打开。标签页本体就是一个普通 React 组件，接收标准的 `TabComponentProps`。

运行条注册在会话 Slot `conversation.input.dock`。

### 没有构建步骤

两个半边都是手写纯 JavaScript：

- `lib/index.js` 就是普通 ESM —— Cordis loader 直接 import（不需要 `tsconfig`/`tsdown`）。
- `lib/client.js` 是**经典脚本**（不是 ES module），采用浏览器内核唯一接受的注册格式：

```js
window.__ModuleLoader__.load({
  id: "dsh-run-button",           // 必须等于 package.json 的 name
  factory: (require) => { var module = {exports:{}}; var exports = module.exports; /* … */ return module.exports }
})
```

`require` 只能命中 shell 冻结的基线表（`react`、`react/jsx-runtime`、`react-dom`、`@deepseek-ai/cordis` 等），所以这个插件除 `react` 外不依赖任何东西。

发布前跑这两条闸门：

```bash
node scripts/check-client.mjs      # 解析 + 物化 factory；并审计未声明的环境全局
node scripts/simulate-client.mjs   # 在真实 DOM 上挂载，走完整链路
```

`simulate-client.mjs` 是关键那条。它像 shell 一样求值 bundle（`window.__ModuleLoader__`，再给一个类 Cordis 的 `ctx`），在 [happy-dom](https://github.com/capricorn86/happy-dom) 文档上挂载，渲染真实的代码框标记，然后断言：

- 运行按钮确实被注入进 banner，并被点击；
- `run/start` 与 `output` 确实在 RPC 通道上被调用；
- 切换输出模式后 dock 卡片出现又消失，且**只有一个 dock 容器、每个运行恰好一张卡**；
- 标签类型已注册、**不去重**，两次运行产生**两个不同标签 id 且各自携带自己的 `runId`** —— per-run 配对是最容易悄悄退化的地方；
- 卸载后没有留下任何残留。

它之所以存在：早先的 `check-client.mjs` 只证明 bundle **能解析**，不跑 `apply()`，于是未声明的全局变量（`styles`）顺利通过，把整页变成 "Failed to load plugins"。那两个上线的 bug **都是这个 harness 在编写过程中自己抓出来的** —— 这就是保留它的理由。

## 宿主契约（写 client 半边前必读）

`lib/client.js` 是手写纯 JS，没有类型检查兜底：臆造 API、漏填必填字段都不会在构建期报错，只会变成整页白屏或崩掉的侧栏标签页。以下契约摘自宿主的实际定义。

### 没有环境全局

**动态** Cordis 插件沙箱会给出 `styles` 与 `harness` 这两个 builtin。而一个真正发布的包 bundle **两个都没有** —— 引用其中一个就会在 `apply()` 里抛错，而抛错的 `apply()` 会把整个 composition 拖垮（"Failed to load plugins"），不只是这个插件。因此每个浏览器全局都通过 `window.<name>` 访问，并且 `check-client.mjs` 会在裸引用再次出现时让构建失败。

`apply()` 同时包在 `try/catch` 里：失败时会报告、回滚已挂载部分并返回，所以这个插件永远不可能是页面停止渲染的原因。

### 注入 CSS：内核没有 `styles` 服务

客户端内核**不提供** `styles` 服务，`ctx.get("styles")` 也拿不到东西。全局样式自己插 `<style>`，并在 teardown 里对称移除（`apply()` 可能被反复调用）：

```js
var tag = document.createElement("style");
tag.id = PREFIX + "-styles";
tag.textContent = CSS;          // 本项目的 CSS 是字符串（数组 .join("") 得到），不是数组
document.head.appendChild(tag);
```

### `ctx.betterSidebar.registerTab()`：`component` 是必填

`TabDescriptor`（定义见 `dsh-better-sidebar/src/client/service.ts`）：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | ✅ | 唯一 id，同时是 `SidebarTab.type` |
| `title` | ✅ | `string \| (() => string)` |
| `component` | ✅ | `(props: TabComponentProps) => ReactNode`。**漏传即 `createElement(undefined)` → React #130** |
| `description` | | 新标签页列表里的一行说明 |
| `icon` | | `ReactNode \| ((size: number) => ReactNode)` |
| `order` | | 菜单排序，默认 100 |
| `hidden` | | 不在 `+` 菜单里出现 |
| `available` | | `(ctx, scope, state) => boolean` |
| `single` / `dedupeKey` | | 单实例 / 自定义去重 |
| `createTab` | | 自定义开页（铸 id + 状态补丁） |
| `urlTarget` | | 接管外部链接点击 |
| `settings` / `badge` | | 设置页开关 / 标签页角标 |
| `onOpen` / `onActivate` / `onClose` | | 生命周期回调 |

`component` 收到的 `TabComponentProps`：`ctx`、`store`、`scope`、`tab`、`visible`（是否活动**且**面板展开 —— 不 live 时应暂停轮询）。

函数声明会提升，所以 `component: RunTab` 可以写在 `function RunTab()` 之前。

### 渲染错误的可见形态

`dsh-better-sidebar` 的 `RenderBoundary` 有两个作用域：ROOT（整个侧栏外壳，`index.tsx`）与 PER-TAB（单个标签页，`Sidebar.tsx` 的 `TabContent`）。报错前缀统一是 `dsh-better-sidebar: <message>`。**看到这个前缀先怀疑 run-button 注册的标签页，而不是侧栏本身** —— 外壳和其他标签页通常是好的。

## 配置

无需配置。可调项：

| 旋钮 | 位置 | 默认 |
| --- | --- | --- |
| 轮询间隔 | `lib/client.js` 的 `POLL_MS` | 180 ms |
| 并发运行上限 | `lib/index.js` 的 `MAX_LIVE_RUNS` | 16 |
| 单条流上限 | `lib/index.js` 的 `MAX_STREAM_BYTES` | 256 KB |
| 完成后保留时长 | `lib/index.js` 的 `RUN_TTL_MS` | 10 分钟 |
| 识别语言 | `lib/client.js` 的 `SHELL_LANGUAGES` | 见上表 |

## 已知限制

- 只有命令行代码框可运行（`js`、`python` 等按设计不在范围内）。
- 输出是轮询而非推送；默认间隔下极快的命令可能只出现一两个 chunk。
- 每个运行的卡片都落在同一个固定的右下角 dock 里；没有按代码框锚定，所以输出永远不会出现在会话区内部。
- 运行输出在宿主机上保留 10 分钟，且能扛过页面刷新（run id 存在 `sessionStorage`），但超过 TTL 或 DSH 重启后宿主机就忘了。
- `input`（stdin）在宿主端已实现，界面尚未暴露。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。

## 相关项目

[dsh-smooth-stream](https://github.com/Laplace-bit/dsh-smooth-stream) 同样会接入代码块 banner —— 但它是为了流式动画与滚动控制，不是为了执行代码。两者不重叠：Smooth Stream 改变输出**如何呈现**，Run Button 增加的是会话区本来没有的操作入口。两者可以共存（已在同一个 profile 里一起验证过）。
