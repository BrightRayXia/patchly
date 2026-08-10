# Patchly

> AI 生成的 HTML 的可视化微调工具 —— 「让 AI 写，我来改」，简单修改不花 token。

经常让 AI 用 HTML 输出内容（落地页、演示稿、说明文档）？AI 生成的东西改起来很麻烦：一句话说不清要改哪里，来回调 prompt 既慢又费 token。

**Patchly 的理念：把「改」这件事从 AI 手里拿回来。**

- 拖入 HTML 文件 → 单击文字直接改、选中元素换色/复制/删除/移动，**简单修改不花 token**
- 复杂修改（改布局、整体换风格）→ 选中元素 + 说一句人话，AI 助手生成结构化修改（需自配 API）
- 每一次编辑都是一条 **Patch（补丁）**：人类手动改和 AI 工具调用走的是**同一条通道**，天然可撤销、可审计、可版本化

## 功能

- 📂 打开 / 拖入 HTML 文件，即刻进入可视化编辑
- ✍️ 单击文字直接编辑；拖选文字调格式（加粗/斜体/下划线/删除线/颜色/高亮/字号）
- 🎨 块级操作：改色面板（文字/背景/边框/色板）、复制、上移/下移、删除
- 🔄 Patch 级撤销/重做（非整文档快照，大文件也不卡）；一键还原初始状态
- 🖼️ 导出时自动把本地图片内嵌为 data URL，换电脑不掉图；**脚本页面导出「原文 + 重放修改」**，不会把脚本动态插入的内容（如翻页器注入的按钮）固化进文件
- 📄 **多页支持**：编辑模式下可开启「允许脚本」，JS 驱动的翻页 / 轮播 / 多页内容也能逐页编辑。
  脚本开启后交互口诀：**点击 = 编辑 / 选中，Alt+点击 = 操作页面**（翻页、跳转交给页面处理）
- 🤖 **AI 修改**：选中元素 → 块工具条「AI 改」→ 对话框钉在元素旁，说一句人话即可；应用修改时目标元素闪烁高亮（兼容 OpenAI / DeepSeek / Moonshot）
- 📋 **变更视图**：一键对比原文，所有修改过的元素打状态角标（已修改 / 新增 / 删除），侧栏列出每条变更的「原文 → 新值」；新增后又删除的净变化为零，不记录
- 🧱 动态预览模式：不编辑、专注跑 JS 检查页面效果

## 快速开始

```bash
pnpm install
pnpm dev          # 启动开发服务器 http://localhost:5173
pnpm test         # 运行 core 单元测试（Patch 引擎 / 撤销历史）
pnpm build        # 构建 core + editor 库
pnpm build:web    # 构建 Web 应用产物
pnpm typecheck    # 全仓类型检查
```

打开页面后，拖入 `examples/demo.html` 即可体验。

## 在线部署

Patchly 是纯静态前端（Vite 构建产物在 `packages/web/dist`），可部署到任何静态托管。

**GitHub Pages（推荐，与开源仓库一体）**

1. 把仓库推到 GitHub（仓库名建议 `patchly`）
2. 已内置 GitHub Actions 工作流 `.github/workflows/deploy.yml`：推送到 `main` 时自动构建并发布到 Pages
3. 到仓库 Settings → Pages → Source 选 **GitHub Actions**，完成后访问 `https://<你的用户名>.github.io/patchly/`

**Cloudflare Pages（备选，国内访问更稳 / 无限免费构建）**

1. 登录 Cloudflare Dashboard → Workers & Pages → Create → Connect to Git 仓库
2. 构建配置：
   - 构建命令：`pnpm --filter @patchly/web build`
   - 输出目录：`packages/web/dist`
   - 根目录：`/`
3. 保存即自动部署，可绑定自定义域名

> 说明：`vite.config.ts` 已设 `base: './'`，产物用相对路径，两种托管都能直接跑。
> AI 修改功能需要用户在「设置」里自配 API Key（存浏览器 localStorage）；
> 部分 API（如 OpenAI）不允许浏览器跨域，仓库已内置 **Cloudflare Worker CORS 代理**（`proxy/`），
> 按 `proxy/README.md` 部署后，把地址填进「设置 → CORS 代理地址」即可。

## 架构一览

Monorepo（pnpm workspace），核心引擎与 UI 解耦：

```
packages/
├─ core/     # 纯 TS、零依赖：Patch 编辑模型、撤销/重做历史、CSS 路径、HTML 工具（含单测）
├─ editor/   # 框架无关的编辑器引擎：iframe 画布、交互事件、文字/块操作、序列化
├─ web/      # Vue 3 + Vite 应用：顶栏、画布、浮层工具条、AI 助手面板
└─ mcp/      # MCP Server（规划中）：让 Claude Code / Cursor 等代理驱动编辑器
```

设计文档见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 路线图

- [x] v0.1：Patch 编辑模型 + 可视化编辑 + AI 助手
- [x] v0.2：多页 / 允许脚本编辑、AI 弹窗 + 闪烁动画、变更视图（对比原文）
- [ ] 右侧属性面板（间距 / 字号 / 对齐 / 布局）
- [ ] 浏览器插件薄壳：从任意网页抓取 HTML 送进编辑器
- [ ] MCP Server：AI 编程代理 ↔ 编辑器（`apply_patch` 等工具）
- [ ] Patch 审计 / 导出修改记录

## 为简历 / 开源准备

如果你想把它作为 AI 实践项目写进简历，这个仓库已经具备几个「面试有话聊」的点：

1. **Patch 编辑模型**：编辑 = 结构化补丁，人类与 AI 通过同一协议协作编辑（参考 htmlstudio 的思路，做了更完整的撤销/重做设计）
2. **撤销/重做**：基于逆操作实时捕获，避免整文档快照的性能与引用失效问题（有单测覆盖）
3. **分层架构**：core / editor / web / mcp 解耦，核心可被插件与 MCP 复用
4. **测试**：Patch 引擎与历史栈共 19 个单测

## 许可证

[MIT](./LICENSE)
