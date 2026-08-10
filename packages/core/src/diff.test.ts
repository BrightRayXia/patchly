import { describe, expect, it } from 'vitest';
import { diffDocuments } from './diff';
import { applyPatch } from './patch/apply';

function makeOriginal(): Document {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = `
    <section id="hero"><h1>标题</h1><p class="sub">副标题</p></section>
    <div class="card"><h3>快速</h3><p>内容一</p></div>
    <div class="card"><h3>可视化</h3><p>内容二</p></div>
    <ul><li>甲</li><li>乙</li></ul>
  `;
  return doc;
}

describe('diffDocuments', () => {
  it('相同文档 → 无变更', () => {
    const cur = makeOriginal();
    const res = diffDocuments(makeOriginal(), cur);
    expect(res.changes).toHaveLength(0);
  });

  it('文字修改 → 记录 text 变更并关联当前元素', () => {
    const cur = makeOriginal();
    const h1 = cur.querySelector('h1')!;
    applyPatch(cur, { type: 'set-text', target: h1, text: '新标题' });
    const res = diffDocuments(makeOriginal(), cur);
    expect(res.changes).toHaveLength(1);
    expect(res.changes[0].kind).toBe('text');
    expect(res.changes[0].old).toBe('标题');
    expect(res.changes[0].new).toBe('新标题');
    expect(res.byElement.get(h1)).toHaveLength(1);
  });

  it('样式修改 → 记录 style 变更（含旧值）', () => {
    const cur = makeOriginal();
    const sub = cur.querySelector('.sub') as HTMLElement;
    sub.style.color = '#EA580C';
    sub.style.fontSize = '20px';
    const res = diffDocuments(makeOriginal(), cur);
    expect(res.changes.some((c) => c.kind === 'style')).toBe(true);
    const style = res.changes.find((c) => c.kind === 'style')!;
    expect(style.detail).toContain('color');
    expect(style.detail).toContain('→');
  });

  it('新增元素 → added（带元素引用）；删除元素 → removed', () => {
    const cur = makeOriginal();
    const li = cur.querySelector('ul li')!;
    const div = cur.createElement('div');
    div.className = 'card';
    div.textContent = '新卡片';
    cur.querySelector('ul')!.after(div);
    applyPatch(cur, { type: 'remove', target: li });

    const res = diffDocuments(makeOriginal(), cur);
    const added = res.changes.filter((c) => c.kind === 'added');
    const removed = res.changes.filter((c) => c.kind === 'removed');
    expect(added).toHaveLength(1);
    expect(added[0].el).toBe(div);
    expect(removed).toHaveLength(1);
    expect(res.byElement.get(div)).toHaveLength(1);
  });

  it('新增后又删除 → 净变化为零，不记录', () => {
    const cur = makeOriginal();
    const div = cur.createElement('div');
    div.textContent = '临时';
    cur.body.appendChild(div);
    div.remove();
    const res = diffDocuments(makeOriginal(), cur);
    expect(res.changes).toHaveLength(0);
  });

  it('文字改了又改回去 → 不记录', () => {
    const cur = makeOriginal();
    const h1 = cur.querySelector('h1')!;
    h1.textContent = '临时';
    h1.textContent = '标题';
    const res = diffDocuments(makeOriginal(), cur);
    expect(res.changes).toHaveLength(0);
  });

  it('上移元素 → 不误报为增删', () => {
    const cur = makeOriginal();
    const lis = cur.querySelectorAll('li');
    lis[1].before(lis[0]); // 乙 移动到 甲 前面
    const res = diffDocuments(makeOriginal(), cur);
    expect(res.changes.filter((c) => c.kind === 'added' || c.kind === 'removed')).toHaveLength(0);
  });

  it('复制元素 → 原配对保留，副本记为新增', () => {
    const cur = makeOriginal();
    const card = cur.querySelector('.card')!;
    card.after(card.cloneNode(true));
    const res = diffDocuments(makeOriginal(), cur);
    const added = res.changes.filter((c) => c.kind === 'added');
    expect(added.length).toBeGreaterThanOrEqual(1);
  });
});
