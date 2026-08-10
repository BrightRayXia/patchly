import type { ElementTarget } from './types';

/**
 * 解析 Patch 的 target。
 * - Element 引用：跨 realm 判断（iframe 文档的元素 instanceof 外层 Element 会失败），
 *   用 nodeType === 1 判断，并确认仍连接在文档上。
 * - 字符串：按 CSS 选择器在当前文档内查找。
 */
export function resolveTarget(doc: Document, target: ElementTarget): Element | null {
  if (typeof target === 'string') {
    try {
      return doc.querySelector(target);
    } catch {
      return null;
    }
  }
  if (target && target.nodeType === 1 && target.isConnected) return target;
  return null;
}
