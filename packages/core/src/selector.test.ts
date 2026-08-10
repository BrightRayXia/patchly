import { describe, expect, it } from 'vitest';
import { cssPath } from './selector';

function makeDoc(): Document {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = `
    <section id="hero"><h1>标题</h1></section>
    <div class="card"><p>一</p></div>
    <div class="card"><p>二</p></div>
  `;
  return doc;
}

describe('cssPath', () => {
  it('有 id 的元素直接使用 id', () => {
    const doc = makeDoc();
    expect(cssPath(doc.querySelector('section')!)).toBe('#hero');
  });

  it('同标签兄弟节点使用 nth-of-type 消歧', () => {
    const doc = makeDoc();
    const p2 = doc.querySelectorAll('.card p')[1];
    expect(cssPath(p2)).toBe('body > div:nth-of-type(2) > p');
  });

  it('产物可以被 querySelector 重新定位', () => {
    const doc = makeDoc();
    const p2 = doc.querySelectorAll('.card p')[1];
    const path = cssPath(p2);
    expect(doc.querySelector(path)).toBe(p2);
  });
});
