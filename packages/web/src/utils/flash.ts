/**
 * AI 修改反馈动画：给目标元素打上短暂的闪烁高亮。
 * 元素来自 iframe 文档，直接操作其 classList 即可。
 */
export function flashElements(elements: Array<Element | null | undefined>): void {
  for (const el of elements) {
    if (!el) continue;
    el.classList.remove('se-flash');
    // 强制重排，确保连续修改也能重新触发动画
    void el.getBoundingClientRect();
    el.classList.add('se-flash');
    setTimeout(() => el.classList.remove('se-flash'), 1150);
  }
}
