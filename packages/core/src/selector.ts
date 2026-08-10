/**
 * 为元素生成稳定、唯一的 CSS 选择器路径（如 `body > section:nth-of-type(2) > p`）。
 *
 * 用途：把「编辑器内的 live 元素」翻译成可序列化的 target，
 * 供 AI 生成 Patch 时引用、以及审计日志持久化。
 */
export function cssPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;

  while (cur) {
    const node: Element = cur;
    const tag = node.tagName.toLowerCase();

    // 路径到 <body> 为止，不带 <html>（更短且同样可定位）
    if (tag === 'html') break;

    // 有 id 则直接用 id，路径在此终止（id 理论上唯一）
    const id = node.getAttribute('id');
    if (id) {
      parts.unshift('#' + escapeCss(id));
      break;
    }

    let part = tag;
    const parent: Element | null = node.parentElement;
    if (parent) {
      const tagName = node.tagName;
      const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === tagName);
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    cur = parent;
  }

  return parts.join(' > ');
}

function escapeCss(sel: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(sel);
  return sel.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}
