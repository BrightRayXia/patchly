/**
 * Patchly MCP Server（Phase 3 规划，当前为占位脚手架）。
 *
 * 目标：让 Claude Code / Cursor / Codex 等 AI 编程代理，通过 MCP 工具调用
 * 直接驱动 Patchly 的可视化编辑器，完成「AI 改版 + 人工确认」的闭环：
 *
 *   用户：把这个页面的标题改成橙色，加粗，右下角加个返回按钮
 *   Agent：open_editor(html) → select_element("#hero h1") → apply_patch([...]) → 用户看到画布实时变化
 *
 * 计划暴露的工具（全部基于 @patchly/core 的 Patch 模型，与 Web 端完全一致）：
 *
 *   - open_document   { html: string }                      打开/替换编辑器中的文档
 *   - get_html        { } → { html, cssPath 清单 }          获取当前文档（供 AI 理解结构）
 *   - select_element  { selector } → { computedStyles }     在画布上高亮选中元素
 *   - apply_patch     { patches: Patch[] } → { applied }    应用 Patch（可撤销）
 *   - undo / redo
 *   - get_patch_preview { patches } → { diff }              应用前的变更预览
 *
 * 实现要点：
 *   1. 复用 @patchly/editor 的 PatchlyEditor，headless 跑在本地无头浏览器（Playwright）中；
 *   2. 通过 WebSocket 与浏览器内的编辑器实例通信（画布变化实时推给 Agent 与用户）；
 *   3. 所有工具产出与 Web 端同源的 Patch 记录，天然可审计、可撤销。
 *
 * 依赖（进入 Phase 3 时安装）：@modelcontextprotocol/sdk、playwright
 */
export const MCP_PLAN = {
  status: 'WIP',
  tools: ['open_document', 'get_html', 'select_element', 'apply_patch', 'undo', 'redo', 'get_patch_preview'],
} as const;
