/**
 * 变更检测：对比「当前文档」与「打开时的原文」，找出所有净变化。
 *
 * 思路：
 * 1. 分别对原文与当前文档做前序 DFS，得到元素列表（每个元素带签名与路径）；
 * 2. 用 LCS（最长公共子序列，以「tag + id + class」为签名）配对两边的元素；
 * 3. 配对成功的元素逐一比较文字 / 行内样式 / 属性 → 「修改」；
 * 4. 未配对的：只出现在原文 → 「已删除」；只出现在当前 → 「新增」。
 *
 * 因为是「当前 vs 原文」的净差异，新增后又删除的元素两边都不存在，
 * 自然不会被记录 —— 这正是「对应原文就行」的语义。
 */
import { cssPath } from './selector';

export type ChangeKind = 'text' | 'style' | 'attr' | 'added' | 'removed';

export interface Change {
  kind: ChangeKind;
  tag: string;
  /** 展示用路径，如 `body > section:nth-of-type(2) > h1` */
  path: string;
  /** 人类可读描述，如 `文字：旧 → 新` */
  detail: string;
  old?: string;
  new?: string;
  /** 当前文档中的元素（removed 类型的元素已不存在，无此字段） */
  el?: Element;
}

export interface DiffResult {
  changes: Change[];
  /** 当前文档元素 → 它身上的变更（用于画布上打状态标识） */
  byElement: Map<Element, Change[]>;
}

interface Item {
  el: Element;
  sig: string;
  path: string;
}

/** LCS 面积上限：超过则退化为按位置配对（超大文档保护） */
const LCS_AREA_LIMIT = 4_000_000;

export function diffDocuments(original: Document, current: Document): DiffResult {
  const oItems = collect(original.body);
  const cItems = collect(current.body);
  const pairs = lcsMatch(oItems, cItems);

  const changes: Change[] = [];
  const byElement = new Map<Element, Change[]>();
  const oUsed = new Set<number>();
  const cUsed = new Set<number>();

  const push = (c: Change): void => {
    changes.push(c);
    if (c.el) {
      const arr = byElement.get(c.el) ?? [];
      arr.push(c);
      byElement.set(c.el, arr);
    }
  };

  for (const [oi, ci] of pairs) {
    oUsed.add(oi);
    cUsed.add(ci);
    comparePair(oItems[oi], cItems[ci], push);
  }
  for (let i = 0; i < oItems.length; i++) {
    if (!oUsed.has(i)) {
      push({ kind: 'removed', tag: oItems[i].el.tagName.toLowerCase(), path: oItems[i].path, detail: '已删除该元素' });
    }
  }
  for (let j = 0; j < cItems.length; j++) {
    if (!cUsed.has(j)) {
      const el = cItems[j].el;
      push({ kind: 'added', tag: el.tagName.toLowerCase(), path: cItems[j].path, detail: '新增该元素', el });
    }
  }

  return { changes, byElement };
}

/* ---------------- 收集 ---------------- */

function collect(root: Element | null): Item[] {
  const items: Item[] = [];
  if (!root) return items;

  const walk = (node: Element, steps: { tag: string; index: number; dup: boolean }[]): void => {
    const parent = node.parentElement;
    const sameTagSiblings = parent ? Array.from(parent.children).filter((c) => c.tagName === node.tagName) : [];
    const index = sameTagSiblings.indexOf(node);
    const dup = sameTagSiblings.length > 1;
    const nextSteps = [...steps, { tag: node.tagName.toLowerCase(), index, dup }];

    items.push({ el: node, sig: signature(node), path: pathString(nextSteps) });
    for (const child of Array.from(node.children)) walk(child, nextSteps);
  };

  walk(root, []);
  return items;
}

function signature(el: Element): string {
  const id = el.id ? '#' + el.id : '';
  const cls = Array.from(el.classList)
    .sort()
    .map((c) => '.' + c)
    .join('');
  return el.tagName.toLowerCase() + id + cls;
}

function pathString(steps: { tag: string; index: number; dup: boolean }[]): string {
  return steps.map((s) => s.tag + (s.dup ? `:nth-of-type(${s.index + 1})` : '')).join(' > ');
}

/* ---------------- LCS 配对 ---------------- */

function lcsMatch(a: Item[], b: Item[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const pairs: Array<[number, number]> = [];

  if (n * m > LCS_AREA_LIMIT) {
    for (let i = 0; i < Math.min(n, m); i++) {
      if (a[i].sig === b[i].sig) pairs.push([i, i]);
    }
    return pairs;
  }

  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] =
        a[i].sig === b[j].sig ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].sig === b[j].sig) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/* ---------------- 元素比较 ---------------- */

function comparePair(o: Item, c: Item, push: (c: Change) => void): void {
  const oEl = o.el;
  const cEl = c.el;
  const tag = cEl.tagName.toLowerCase();

  const oText = ownText(oEl);
  const cText = ownText(cEl);
  if (oText !== cText) {
    push({ kind: 'text', tag, path: c.path, detail: `文字：${fmt(oText)} → ${fmt(cText)}`, old: oText, new: cText, el: cEl });
  }

  const styleChanges = styleDiff(oEl, cEl);
  if (styleChanges.length) {
    push({ kind: 'style', tag, path: c.path, detail: '样式：' + styleChanges.join('；'), el: cEl });
  }

  const attrChanges = attrDiff(oEl, cEl);
  if (attrChanges.length) {
    push({ kind: 'attr', tag, path: c.path, detail: '属性：' + attrChanges.join('；'), el: cEl });
  }
}

/** 元素直接子文本节点（不含后代元素），折叠空白后比较，避免缩进差异误报 */
function ownText(el: Element): string {
  let s = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) s += n.textContent ?? '';
  }
  return s.replace(/\s+/g, ' ').trim();
}

function styleMap(el: Element): Map<string, string> {
  const m = new Map<string, string>();
  (el.getAttribute('style') || '')
    .split(';')
    .forEach((decl) => {
      const idx = decl.indexOf(':');
      if (idx > 0) m.set(decl.slice(0, idx).trim().toLowerCase(), decl.slice(idx + 1).trim());
    });
  return m;
}

function styleDiff(o: Element, c: Element): string[] {
  const a = styleMap(o);
  const b = styleMap(c);
  const keys = new Set([...a.keys(), ...b.keys()]);
  const out: string[] = [];
  for (const k of keys) {
    const x = a.get(k) ?? '';
    const y = b.get(k) ?? '';
    if (x !== y) out.push(`${k}: ${fmt(x)} → ${fmt(y)}`);
  }
  return out;
}

function attrDiff(o: Element, c: Element): string[] {
  const a = attrMap(o);
  const b = attrMap(c);
  const keys = new Set([...a.keys(), ...b.keys()]);
  const out: string[] = [];
  for (const k of keys) {
    const x = a.get(k) ?? '';
    const y = b.get(k) ?? '';
    if (x !== y) out.push(`${k}: ${fmt(x)} → ${fmt(y)}`);
  }
  return out;
}

function attrMap(el: Element): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of el.attributes) {
    if (a.name !== 'style') m.set(a.name, a.value);
  }
  return m;
}

function fmt(s: string, max = 36): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t || '∅';
}

export { cssPath };
