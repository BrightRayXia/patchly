/**
 * Patch（补丁）类型定义。
 *
 * 设计理念：Patchly 的每一次可视化编辑都是一条结构化 Patch。
 * - 人类操作（点按钮、拖拽）→ 生成 Patch
 * - AI 工具调用（MCP / LLM function calling）→ 生成同格式 Patch
 *
 * 同一抽象让「人工微调」与「AI 编辑」走同一条通道，
 * 撤销/重做、审计、版本化全部建立在 Patch 之上。
 *
 * target 有两种形态：
 * - 编辑器内部（live 模式）：直接持有 iframe 文档里的 Element 引用
 * - AI / 序列化模式：CSS 选择器字符串（见 packages/core/src/selector.ts 的 cssPath）
 */

export interface PatchBase {
  /** 可选：操作说明，用于审计日志 / 撤销菜单展示 */
  note?: string;
}

/** 把元素的文本内容替换为纯文本 */
export interface SetTextPatch extends PatchBase {
  type: 'set-text';
  target: ElementTarget;
  text: string;
}

/** 设置元素的行内样式（camelCase 或 kebab-case 均可） */
export interface SetStylePatch extends PatchBase {
  type: 'set-style';
  target: ElementTarget;
  style: Record<string, string>;
}

/** 设置 / 删除元素的属性（value 为 null 表示删除） */
export interface SetAttrPatch extends PatchBase {
  type: 'set-attr';
  target: ElementTarget;
  attr: string;
  value: string | null;
}

/** 替换元素内部 HTML（用于文字编辑会话、AI 重写某段内容） */
export interface SetHtmlPatch extends PatchBase {
  type: 'set-html';
  target: ElementTarget;
  html: string;
}

/** 替换图片地址 */
export interface SetImagePatch extends PatchBase {
  type: 'set-image';
  target: ElementTarget;
  src: string;
}

/** 复制一份元素到前面或后面 */
export interface DuplicatePatch extends PatchBase {
  type: 'duplicate';
  target: ElementTarget;
  placement?: 'before' | 'after';
}

/** 删除元素 */
export interface RemovePatch extends PatchBase {
  type: 'remove';
  target: ElementTarget;
}

/** 元素上移 / 下移一位 */
export interface MovePatch extends PatchBase {
  type: 'move';
  target: ElementTarget;
  direction: 'up' | 'down';
}

/**
 * 内部专用：恢复被删除的元素（RemovePatch 的逆操作）。
 * 持有 live 引用，不可序列化，仅供撤销/重做引擎使用。
 */
export interface RestorePatch extends PatchBase {
  type: 'restore';
  parent: Node;
  nextSibling: Node | null;
  html: string;
}

export type ElementTarget = Element | string;

export type Patch =
  | SetTextPatch
  | SetStylePatch
  | SetAttrPatch
  | SetHtmlPatch
  | SetImagePatch
  | DuplicatePatch
  | RemovePatch
  | MovePatch
  | RestorePatch;

/** AI 可生成的公开 Patch 类型（restore 是内部类型，不允许 AI 生成） */
export const PUBLIC_PATCH_TYPES = [
  'set-text',
  'set-style',
  'set-attr',
  'set-html',
  'set-image',
  'duplicate',
  'remove',
  'move',
] as const;

export type PublicPatchType = (typeof PUBLIC_PATCH_TYPES)[number];

export function isPublicPatchType(type: string): type is PublicPatchType {
  return (PUBLIC_PATCH_TYPES as readonly string[]).includes(type);
}
