import { resolveTarget } from './resolve';
import type { Patch, SetStylePatch } from './types';

/** camelCase 转 kebab-case，供 CSS 属性使用（如 fontSize → font-size） */
export function camelToKebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

/**
 * 在指定文档中应用一条 Patch，并返回它的「逆操作 Patch」。
 * 返回 null 表示该 Patch 为无效操作或没有产生实际变化。
 *
 * 逆操作在应用前捕获旧值，因此撤销可以在不保留整份快照的情况下精确回滚。
 */
export function applyPatch(doc: Document, patch: Patch): Patch | null {
  switch (patch.type) {
    case 'set-text': {
      const el = resolveTarget(doc, patch.target);
      if (!el) return null;
      const old = el.textContent ?? '';
      if (old === patch.text) return null;
      el.textContent = patch.text;
      return { type: 'set-text', target: el, text: old };
    }

    case 'set-style': {
      const el = resolveTarget(doc, patch.target);
      if (!el) return null;
      const target = el as HTMLElement; // Element 未必是 HTMLElement，但样式属性均可读写
      const inverseStyle: Record<string, string> = {};
      for (const [key, value] of Object.entries(patch.style)) {
        const prop = camelToKebab(key);
        const old = target.style.getPropertyValue(prop);
        target.style.setProperty(prop, value);
        inverseStyle[prop] = old;
      }
      const inverse: SetStylePatch = { type: 'set-style', target: el, style: inverseStyle };
      return inverse;
    }

    case 'set-attr': {
      const el = resolveTarget(doc, patch.target);
      if (!el) return null;
      const old = el.getAttribute(patch.attr);
      if (patch.value === null) el.removeAttribute(patch.attr);
      else el.setAttribute(patch.attr, patch.value);
      return { type: 'set-attr', target: el, attr: patch.attr, value: old };
    }

    case 'set-image': {
      const el = resolveTarget(doc, patch.target);
      if (!el) return null;
      const old = el.getAttribute('src');
      if (old === patch.src) return null;
      el.setAttribute('src', patch.src);
      return { type: 'set-attr', target: el, attr: 'src', value: old };
    }

    case 'set-html': {
      const el = resolveTarget(doc, patch.target);
      if (!el) return null;
      const old = el.innerHTML;
      if (old === patch.html) return null;
      el.innerHTML = patch.html;
      return { type: 'set-html', target: el, html: old };
    }

    case 'duplicate': {
      const el = resolveTarget(doc, patch.target);
      if (!el) return null;
      const clone = el.cloneNode(true) as Element;
      if (patch.placement === 'before') el.before(clone);
      else el.after(clone);
      return { type: 'remove', target: clone };
    }

    case 'remove': {
      const el = resolveTarget(doc, patch.target);
      if (!el) return null;
      const parent = el.parentNode;
      if (!parent) return null;
      const nextSibling = el.nextSibling;
      const html = el.outerHTML;
      el.remove();
      return { type: 'restore', parent, nextSibling, html };
    }

    case 'restore': {
      const tpl = doc.createElement('template');
      tpl.innerHTML = patch.html;
      const node = tpl.content.firstElementChild;
      if (!node) return null;
      patch.parent.insertBefore(node, patch.nextSibling);
      return { type: 'remove', target: node };
    }

    case 'move': {
      const el = resolveTarget(doc, patch.target);
      if (!el) return null;
      const sibling = patch.direction === 'up' ? el.previousElementSibling : el.nextElementSibling;
      if (!sibling) return null;
      if (patch.direction === 'up') sibling.before(el);
      else sibling.after(el);
      return { type: 'move', target: el, direction: patch.direction === 'up' ? 'down' : 'up' };
    }

    default:
      return null;
  }
}

/**
 * 批量应用 Patch，返回所有非空逆操作的集合（顺序与输入一致）。
 */
export function applyBatch(doc: Document, patches: Patch[]): Patch[] {
  const inverses: Patch[] = [];
  for (const p of patches) {
    const inv = applyPatch(doc, p);
    if (inv) inverses.push(inv);
  }
  return inverses;
}

/**
 * 校验 AI 返回的 Patch 是否形状合法（防止模型输出破坏性/非法结构）。
 * 只允许公开类型；target 必须是字符串选择器或 Element；样式对象必须是字符串值。
 */
export function isValidPatch(p: unknown): p is Patch {
  if (!p || typeof p !== 'object') return false;
  const rec = p as Record<string, unknown>;
  const type = rec.type;
  if (typeof type !== 'string' || !isPublicType(type)) return false;
  if (rec.target !== undefined && typeof rec.target !== 'string' && !isElementLike(rec.target)) return false;
  switch (type) {
    case 'set-text':
      return typeof rec.text === 'string';
    case 'set-style':
      return isStringRecord(rec.style);
    case 'set-attr':
      return typeof rec.attr === 'string' && (rec.value === null || typeof rec.value === 'string');
    case 'set-html':
      return typeof rec.html === 'string';
    case 'set-image':
      return typeof rec.src === 'string';
    case 'duplicate':
      return rec.placement === undefined || rec.placement === 'before' || rec.placement === 'after';
    case 'remove':
      return true;
    case 'move':
      return rec.direction === 'up' || rec.direction === 'down';
    default:
      return false;
  }
}

function isPublicType(type: string): boolean {
  return ['set-text', 'set-style', 'set-attr', 'set-html', 'set-image', 'duplicate', 'remove', 'move'].includes(type);
}

function isElementLike(v: unknown): boolean {
  return !!v && typeof v === 'object' && (v as { nodeType?: number }).nodeType === 1;
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v).every((x) => typeof x === 'string');
}
