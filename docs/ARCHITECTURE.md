# Patchly 架构设计

## 1. 核心思想：编辑 = 生成 Patch

Patchly 的每一次可视化编辑都是一条**结构化补丁（Patch）**：

```ts
// 改文字
{ type: 'set-text',  target: '#hero h1', text: '新标题' }
// 改样式
{ type: 'set-style', target: '#hero h1', style: { color: '#EA580C', fontWeight: 'bold' } }
// 换图 / 改属性 / 复制 / 删除 / 移动
{ type: 'set-image', ... } { type: 'set-attr', ... } { type: 'duplicate', ... }
{ type: 'remove', ... }    { type: 'move', ... }
```

两条编辑通道共用同一模型：

```
人类：点按钮 / 拖拽  ──► 产生 Patch ──► 应用到 iframe 文档
AI ：LLM 工具调用    ──► 产生同格式 Patch ──► 同上
```

带来的收益：

- **撤销/重做**建立在 Patch 逆操作之上，而不是整文档快照（大文件不卡）
- **可审计**：所有修改可记录为 Patch 列表，未来可导出 / 版本化
- **人机协作**：AI 与人工的修改互相兼容、可互相撤销

### target 的两种形态

- **live 模式**：编辑器内部直接持有 iframe 文档里的 `Element` 引用（快，用于人工操作）
- **序列化模式**：CSS 选择器字符串（`packages/core/src/selector.ts` 的 `cssPath()` 生成，用于 AI 返回与持久化）

## 2. 撤销 / 重做：基于逆操作，引用永远新鲜

`PatchHistory`（`packages/core/src/history.ts`）的每条记录含两个方向：

```ts
interface HistoryEntry { forward: Patch[]; backward: Patch[] }
```

- `applyAndRecord(patches)`：应用 Patch，把应用过程中**实时捕获的逆操作**存入 `backward`
- `undo()`：应用 `backward`，同时把这次应用捕获到的新逆操作作为 redo 的 `forward` 存入 redo 栈
- `redo()`：对称操作

因为逆操作在**应用时**捕获（比如删除元素的逆操作会拿到当时的 `parent + nextSibling + outerHTML`），所以无论元素被删除、复制还是移动过，引用都不会过期——撤销-重做-再撤销循环始终正确（有单测覆盖）。

## 3. 模块划分

```
packages/core     纯 TS、零运行时依赖、可单测
  ├─ patch/types.ts     Patch 类型（含内部类型 restore）
  ├─ patch/apply.ts     applyPatch / applyBatch / isValidPatch / camelToKebab
  ├─ patch/resolve.ts   跨 realm 的 target 解析
  ├─ history.ts         撤销/重做历史
  ├─ selector.ts        cssPath()
  └─ html.ts            doctype 拆分 / 序列化清洗 / 脚本检测 / 图片内嵌

packages/editor    框架无关的编辑器引擎（Vue / 插件 / MCP 均可复用）
  └─ src/index.ts      Patchlyor：iframe 生命周期、交互事件、文字编辑会话、
                       块操作、几何计算（元素→视口矩形）、事件发射器

packages/web       Vue 3 + Vite 薄壳
  ├─ App.vue           装配：持有 Patchlyor、订阅事件驱动响应式状态
  ├─ components/       顶栏 / 浮层 / 块操作条 / 文字工具条 / 颜色面板 / AI 助手
  └─ services/         llm.ts（OpenAI 兼容客户端）、settings.ts（localStorage）
```

分层原则：**editor 不知道 Vue，web 不知道 DOM 细节**。
editor 通过事件（`picked / editing / selection / hover / reposition`）向外暴露「元素 → 视口矩形」等几何信息，由 UI 层渲染浮层。

## 4. 变更检测（对比原文）

`packages/core/src/diff.ts` 提供「当前文档 vs 打开时的原文」的 DOM 差异引擎：

1. 分别对原文（DOMParser 解析，不执行脚本）与当前文档做前序 DFS，得到元素列表（tag + id + class 签名 + 路径）；
2. 用 LCS 按签名配对两边元素（超大文档自动退化为按位配对）；
3. 配对元素逐一比较直接文本节点 / 行内样式 / 属性 → 记录「修改」（含原文 → 新值）；
4. 未配对的：只在原文 → 「已删除」；只在当前 → 「新增」。

因为是**净差异**，新增后又删除的元素两边都不存在，天然不被记录 —— 符合「对应原文就行」的语义。

编辑器暴露 `getChanges()`，Web 端「变更」按钮开启后：
- 画布上给变更元素打状态角标（新增=青、修改=橙）；
- 侧栏「变更」标签列出全部变更（路径 + 原文 → 新值）。

## 5. 编辑器事件流

```
用户点击 iframe 内元素
  └─ Patchlyor.bindViewer（capture 监听）
      ├─ 是文字元素 ──► beginEdit：contenteditable=true、聚焦、记录 editBeforeHTML
      │                   （结束编辑时比较前后 innerHTML，差异记为 set-html Patch 入历史）
      ├─ 是 SVG 文字 ──► 双击 prompt 编辑，patch([set-text])
      └─ 否则 ──► pickBlock：emit('picked', { element, rect })
```

富文本命令（B/I/U/颜色/字号）在**文字编辑会话内**执行，随会话统一入历史——一次编辑（打字+格式化）= 一步撤销，体验更好。

## 6. AI 集成协议

`packages/web/src/services/llm.ts`：

```
POST {baseUrl}/chat/completions   （OpenAI 兼容）
  system: 输出结构化 Patch 的规则（只改最小范围、target 用选择器、不允许 restore 等）
  user:   { instruction, targetCssPath, targetHtml, targetStyles }
  ← 返回 { "patches": [...] }
  ← 经 isValidPatch 校验后 editor.patch(patches) 直接应用（可撤销）
```

配置仅存浏览器 localStorage，支持 OpenAI / DeepSeek / Moonshot。

## 7. MCP 规划（Phase 3）

`packages/mcp` 计划暴露：`open_document` / `get_html` / `select_element` / `apply_patch` / `undo` / `redo`。
通过 Playwright 无头浏览器 + WebSocket 与编辑器实例通信，让 Claude Code / Cursor 等代理「看着画布改页面」。

## 8. 已知技术债

- **execCommand**：文字格式化仍用 `document.execCommand`（已废弃但浏览器兼容性最稳）。
  已在代码中标注，后续可选迁往自定义 Range 操作或引入结构化文档模型。
- **编辑会话粒度**：一次文字编辑会话内的所有改动合并为一步撤销（有意为之，符合直觉）。
- **iframe 脚本**：编辑模式下 `sandbox` 不含 `allow-scripts`，依赖 JS 渲染的页面需手动开「动态预览」。
