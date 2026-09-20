# dsh-run-button

**给 DSH 回答里的每一个命令行代码框加一个「运行」按钮。** 点一下就在宿主机上执行该命令，stdout/stderr 实时流进**底部工作台**的 **Run output** 标签页——就是终端所在的那个面板。

> 状态：`0.1.0` —— 可工作的插件包，纯手写（无打包器、无 TypeScript 构建）。

---

## 为什么做它

DSH 把回答渲染成 Markdown，而代码框只提供一个操作：**复制**。每次回答里出现想试的命令（一段 `git`、一个 `pnpm` 脚本、一条诊断命令），你都得复制 → 切终端 → 粘贴 → 回车。

这个插件补上缺的那个动词。语言是命令行的代码框会在「复制」旁边多一个 **▶ 运行**：

- 命令在**宿主机**上执行，用它所在会话自己的工作目录与沙箱；
- 输出落在底部工作台的 **Run output** 标签页里，本会话第一次运行时该面板会自动打开并展开——和终端同一个地方，所以不会盖住对话；
- 按钮反映状态：`▶ 运行` → `■ 停止` → `✓ 运行`（退出码 0）/ `✕ 运行`（非 0 或被终止）；
- 输入框上方的运行条列出进行中与最近的运行，点任一条把工作台标签页提到前面；
- 长时间运行的命令可以从按钮或标签页里停止。

### 输出面板来自 dsh-better-sidebar

底部面板标签页是通过 [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) 公开的 `ctx.betterSidebar` 服务注册的（`registerTab` + `openTab({ target: 'bottom' })`），与它内置的终端 / git / 任务标签页用的是同一个扩展点。

该插件是**可选**依赖，不是必需：

| 是否装了 `dsh-better-sidebar` | 行为 |
| --- | --- |
| 已装 | 运行会得到终端旁边一个真实的工作台标签页；本会话首次运行自动打开并展开面板 |
| 未装 | 命令照旧通过宿主通道执行、按钮照旧反映状态——只是没有可渲染输出的面板 |


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
3. 底部工作台会切到 **Run output** 标签页（和终端同一个面板）。每个运行是一张卡片：运行中可 **stop**、**collapse** 折叠输出、**close** 丢弃该条；**Clear finished** 清掉所有已结束的运行。
4. 点 **cwd 小标签**（运行按钮旁）可为该代码框指定工作目录；选择会在本会话内记住。

## 实现

一个 Cordis 插件包，两个半边：

```
dsh-run-button/
├── package.json          dsh.bundle.patch + dsh.client {platform:"web"}
├── cordis.patch.yml      profile 行：- insert: [{id: run-button, name: dsh-run-button}]
├── lib/index.js          HOST  — ESM Cordis 插件
├── lib/client.js         CLIENT — 经典脚本 bundle（window.__ModuleLoader__）
└── scripts/check-client.mjs   浏览器 bundle 的语法闸门
```

**Host 半边**（`lib/index.js`）挂一条专用回环 RPC 通道 `/dsh-run-button`，端点 `info`、`start`、`output`、`input`、`kill`。`start` 解析会话的 cwd 与沙箱策略，然后用内置 `shell` 服务（`ctx.shell.resolve` → `ctx.shell.start`）启动命令并持有后台进程句柄。`output` 读取**增量** delta（`readOutput()` 不会重复吐已读内容），返回 JSON 安全的视图：状态、退出码、信号、cwd、沙箱模式与累积输出。所有副作用都是 `ctx.effect`，其中包含卸载时杀掉活动进程。

**Client 半边**（`lib/client.js`）做三件事：

1. `MutationObserver` 扫描会话区里的 `[data-code-block-banner]`，读出语言与 `<pre>` 文本，把运行按钮与 cwd 小标签**追加为 banner 动作行的尾部子节点** —— React 的 reconciler 从不枚举 DOM 子节点，因此尾部额外节点能在重渲染中存活。由于记录超过 100 条时列表会虚拟化，扫描在 mutation 与滚动时各跑一次。
2. 运行存储通过 `connection.rpc.call` 每 180 ms 轮询 `output` 并通知订阅者；React 视图都从这一份存储渲染，所以按钮、输入框上方的运行条与工作台标签页三者始终一致。
3. **Run output** 标签页通过 `ctx.betterSidebar.registerTab(...)` 注册，运行开始时用 `openTab({ target: 'bottom' })` 把它提到前面。标签页本体就是一个普通 React 组件，接收标准的 `TabComponentProps`。

紧凑的运行条注册在会话 Slot `conversation.input.dock`。


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

发布前可跑 `node scripts/check-client.mjs`，在浏览器之外解析并实例化该 bundle。

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
- 所有运行收敛到一个工作台标签页，而不是每个代码框一个面板。没装 `dsh-better-sidebar` 时完全没有输出面板——按钮仍然执行并反映状态。
- 运行输出在宿主机上保留 10 分钟，且能扛过页面刷新（run id 存在 `sessionStorage`），但超过 TTL 或 DSH 重启后宿主机就忘了。
- `input`（stdin）在宿主端已实现，界面尚未暴露。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
