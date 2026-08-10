import { describe, expect, it } from 'vitest';
import { applyPatch, applyBatch } from './apply';

function makeDoc(): Document {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = `
    <section id="hero">
      <h1>标题</h1>
      <p>第一段 <b>加粗</b> 文字</p>
    </section>
    <ul><li>甲</li><li>乙</li><li>丙</li></ul>
  `;
  return doc;
}

describe('set-text', () => {
  it('替换文本并返回可回滚的逆操作', () => {
    const doc = makeDoc();
    const h1 = doc.querySelector('h1')!;
    const inv = applyPatch(doc, { type: 'set-text', target: h1, text: '新标题' });
    expect(h1.textContent).toBe('新标题');
    expect(inv).toMatchObject({ type: 'set-text', text: '标题' });
    if (inv && inv.type === 'set-text') expect(inv.target).toBe(h1);
    applyPatch(doc, inv!);
    expect(h1.textContent).toBe('标题');
  });

  it('字符串 target 通过选择器解析', () => {
    const doc = makeDoc();
    applyPatch(doc, { type: 'set-text', target: '#hero h1', text: 'x' });
    expect(doc.querySelector('h1')!.textContent).toBe('x');
  });

  it('相同文本视为无操作', () => {
    const doc = makeDoc();
    const h1 = doc.querySelector('h1')!;
    expect(applyPatch(doc, { type: 'set-text', target: h1, text: '标题' })).toBeNull();
  });
});

describe('set-style', () => {
  it('支持 kebab 与 camelCase，并保留旧值用于撤销', () => {
    const doc = makeDoc();
    const h1 = doc.querySelector('h1')!;
    const inv = applyPatch(doc, { type: 'set-style', target: h1, style: { fontSize: '24px', 'color': '#EA580C' } });
    expect(h1.style.fontSize).toBe('24px');
    expect(h1.style.color.toLowerCase()).toBe('#ea580c');
    expect(inv!.type).toBe('set-style');
    const s = inv! as { style: Record<string, string> };
    expect(s.style['font-size']).toBe('');
    applyPatch(doc, inv!);
    expect(h1.style.fontSize).toBe('');
  });
});

describe('set-attr / set-image', () => {
  it('设置与删除属性', () => {
    const doc = makeDoc();
    const li = doc.querySelector('li')!;
    const inv = applyPatch(doc, { type: 'set-attr', target: li, attr: 'data-x', value: '1' });
    expect(li.getAttribute('data-x')).toBe('1');
    applyPatch(doc, inv!);
    expect(li.getAttribute('data-x')).toBeNull();
  });
});

describe('duplicate / remove / move', () => {
  it('复制后逆操作删除克隆体', () => {
    const doc = makeDoc();
    const lis = doc.querySelectorAll('li');
    const inv = applyPatch(doc, { type: 'duplicate', target: lis[1] });
    expect(doc.querySelectorAll('li')).toHaveLength(4);
    expect(doc.querySelectorAll('li')[2].textContent).toBe('乙');
    applyPatch(doc, inv!);
    expect(doc.querySelectorAll('li')).toHaveLength(3);
  });

  it('删除后逆操作恢复原元素（含结构与文本）', () => {
    const doc = makeDoc();
    const p = doc.querySelector('p')!;
    const inv = applyPatch(doc, { type: 'remove', target: p });
    expect(doc.querySelector('p')).toBeNull();
    applyPatch(doc, inv!);
    const restored = doc.querySelector('p')!;
    expect(restored.innerHTML).toBe('第一段 <b>加粗</b> 文字');
  });

  it('上移 / 下移互为逆操作', () => {
    const doc = makeDoc();
    const lis = doc.querySelectorAll('li');
    const inv = applyPatch(doc, { type: 'move', target: lis[2], direction: 'up' });
    expect(Array.from(doc.querySelectorAll('li')).map((l) => l.textContent)).toEqual(['甲', '丙', '乙']);
    applyPatch(doc, inv!);
    expect(Array.from(doc.querySelectorAll('li')).map((l) => l.textContent)).toEqual(['甲', '乙', '丙']);
  });
});

describe('set-html', () => {
  it('替换 innerHTML 并回滚', () => {
    const doc = makeDoc();
    const p = doc.querySelector('p')!;
    const inv = applyPatch(doc, { type: 'set-html', target: p, html: '<i>新内容</i>' });
    expect(p.innerHTML).toBe('<i>新内容</i>');
    applyPatch(doc, inv!);
    expect(p.innerHTML).toBe('第一段 <b>加粗</b> 文字');
  });
});

describe('applyBatch', () => {
  it('批量应用并收集逆操作', () => {
    const doc = makeDoc();
    const h1 = doc.querySelector('h1')!;
    const inverses = applyBatch(doc, [
      { type: 'set-text', target: h1, text: 'A' },
      { type: 'set-style', target: h1, style: { color: 'red' } },
    ]);
    expect(inverses).toHaveLength(2);
    expect(h1.textContent).toBe('A');
    applyBatch(doc, inverses);
    expect(h1.textContent).toBe('标题');
    expect(h1.style.color).toBe('');
  });
});
