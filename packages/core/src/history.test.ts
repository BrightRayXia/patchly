import { describe, expect, it } from 'vitest';
import { PatchHistory } from './history';

function makeDoc(): Document {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = `<h1>标题</h1><p>第一段</p><ul><li>甲</li><li>乙</li></ul>`;
  return doc;
}

describe('PatchHistory', () => {
  it('applyAndRecord 后可撤销再重做', () => {
    const doc = makeDoc();
    const h = new PatchHistory(doc);
    const h1 = doc.querySelector('h1')!;

    h.applyAndRecord([{ type: 'set-text', target: h1, text: '新标题' }]);
    expect(h1.textContent).toBe('新标题');
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);

    expect(h.undo()).toBe(true);
    expect(h1.textContent).toBe('标题');
    expect(h.canRedo).toBe(true);

    expect(h.redo()).toBe(true);
    expect(h1.textContent).toBe('新标题');
    expect(h.canUndo).toBe(true);
  });

  it('undo 后 redo 栈清空（新变更打断历史）', () => {
    const doc = makeDoc();
    const h = new PatchHistory(doc);
    const h1 = doc.querySelector('h1')!;
    h.applyAndRecord([{ type: 'set-text', target: h1, text: 'A' }]);
    h.undo();
    h.applyAndRecord([{ type: 'set-text', target: h1, text: 'B' }]);
    expect(h1.textContent).toBe('B');
    expect(h.canRedo).toBe(false);
    h.undo();
    expect(h1.textContent).toBe('标题');
  });

  it('撤销-重做-再撤销循环保持正确', () => {
    const doc = makeDoc();
    const h = new PatchHistory(doc);
    const h1 = doc.querySelector('h1')!;
    h.applyAndRecord([{ type: 'set-text', target: h1, text: 'V1' }]);
    h.applyAndRecord([{ type: 'set-text', target: h1, text: 'V2' }]);
    expect(h.undo()).toBe(true);
    expect(h1.textContent).toBe('V1');
    expect(h.undo()).toBe(true);
    expect(h1.textContent).toBe('标题');
    expect(h.redo()).toBe(true);
    expect(h1.textContent).toBe('V1');
    expect(h.redo()).toBe(true);
    expect(h1.textContent).toBe('V2');
  });

  it('删除元素后撤销恢复、重做再删除（引用保持新鲜）', () => {
    const doc = makeDoc();
    const h = new PatchHistory(doc);
    const p = doc.querySelector('p')!;
    h.applyAndRecord([{ type: 'remove', target: p }]);
    expect(doc.querySelector('p')).toBeNull();
    expect(h.undo()).toBe(true);
    const restored = doc.querySelector('p')!;
    expect(restored.textContent).toBe('第一段');
    expect(h.redo()).toBe(true);
    expect(doc.querySelector('p')).toBeNull();
    // 再次撤销仍然可用
    expect(h.undo()).toBe(true);
    expect(doc.querySelector('p')!.textContent).toBe('第一段');
  });

  it('record 支持外部已应用的变更（文字编辑会话）', () => {
    const doc = makeDoc();
    const h = new PatchHistory(doc);
    const h1 = doc.querySelector('h1')!;
    const old = h1.innerHTML;
    h1.innerHTML = '编辑后的内容'; // 模拟 contenteditable 编辑
    h.record(
      [{ type: 'set-html', target: h1, html: '编辑后的内容' }],
      [{ type: 'set-html', target: h1, html: old }],
    );
    expect(h.undo()).toBe(true);
    expect(h1.innerHTML).toBe(old);
    expect(h.redo()).toBe(true);
    expect(h1.innerHTML).toBe('编辑后的内容');
  });

  it('无操作时不产生记录', () => {
    const doc = makeDoc();
    const h = new PatchHistory(doc);
    const h1 = doc.querySelector('h1')!;
    h.applyAndRecord([{ type: 'set-text', target: h1, text: '标题' }]); // 与原文相同
    expect(h.canUndo).toBe(false);
  });
});
