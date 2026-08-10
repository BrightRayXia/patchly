import {
  type Patch,
  PatchHistory,
  applyBatch,
  diffDocuments,
  hasScript,
  inlineImagesInDoc,
  resolveTarget,
  serializeDoc,
  splitDoctype,
} from '@patchly/core';
import type { DiffResult } from '@patchly/core';

/** 视口坐标矩形（相对外层页面窗口） */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
}

export interface OverlayState {
  element: Element;
  rect: Rect;
}

export interface BlankInfo {
  show: boolean;
  hasScript: boolean;
  textLen: number;
}

export interface PatchlyEditorOptions {
  iframe: HTMLIFrameElement;
}

/** 事件载荷类型 */
export interface EditorEventMap {
  ready: { doc: Document };
  dirty: { dirty: boolean };
  history: { canUndo: boolean; canRedo: boolean };
  picked: OverlayState;
  unpicked: void;
  editing: OverlayState;
  editingEnd: void;
  hover: OverlayState | null;
  selection: Rect | null;
  reposition: OverlayState | null;
  blank: BlankInfo;
  tip: { text: string };
  patched: { count: number };
}

type Listener<T> = (payload: T) => void;

const SKIP_TAGS = new Set(['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE']);
const NON_TEXT_TAGS = new Set([
  'IMG', 'VIDEO', 'HR', 'SVG', 'CANVAS', 'IFRAME', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'BR',
]);

/**
 * PatchlyEditor 编辑器引擎。
 *
 * 职责：iframe 画布生命周期、文档内交互（hover/点击/双击/选区/粘贴）、
 * 文字编辑会话、块级操作、撤销/重做、序列化。
 *
 * 与框架无关：UI 层（Vue/React/原生）只负责渲染与监听事件，
 * 引擎通过事件向外暴露「元素 → 视口矩形」等几何信息，由 UI 定位浮层。
 */
export class PatchlyEditor {
  readonly iframe: HTMLIFrameElement;

  private rawOriginal = '';
  private docHTML = '';
  private doctype = '<!DOCTYPE html>';
  private fileName = '';
  private justLoaded = false;

  private history: PatchHistory | null = null;
  private vdoc: Document | null = null;
  private editMode = true;
  private scriptMode = false;
  /** 编辑模式下是否允许脚本运行（多页 / 翻页 / 轮播类文件需要，见 README） */
  private allowScripts = false;
  private dirty = false;

  private picked: Element | null = null;
  private editingEl: Element | null = null;
  private editBeforeHTML = '';

  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<keyof EditorEventMap, Set<(payload: unknown) => void>>();

  constructor(opts: PatchlyEditorOptions) {
    this.iframe = opts.iframe;
    this.iframe.addEventListener('load', () => this.onFrameLoad());
  }

  /* ---------------- 事件 ---------------- */

  on<K extends keyof EditorEventMap>(event: K, cb: Listener<EditorEventMap[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb as (payload: unknown) => void);
    return () => this.listeners.get(event)?.delete(cb as (payload: unknown) => void);
  }

  private emit<K extends keyof EditorEventMap>(event: K, payload: EditorEventMap[K]): void {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }

  /* ---------------- 载入 / 渲染 ---------------- */

  loadHtml(html: string, fileName: string): void {
    this.rawOriginal = html;
    this.doctype = splitDoctype(html).doctype;
    this.docHTML = html;
    this.fileName = fileName;
    this.justLoaded = true;
    this.setDirty(false);
    this.render();
  }

  render(): void {
    this.deselect();
    this.vdoc = null;
    this.history = null;
    this.iframe.setAttribute('sandbox', this.scriptsEnabled() ? 'allow-scripts allow-same-origin' : 'allow-same-origin');
    this.iframe.style.display = 'block';
    this.iframe.srcdoc = this.docHTML;
  }

  private onFrameLoad(): void {
    try {
      this.vdoc = this.iframe.contentDocument;
    } catch {
      this.vdoc = null;
    }
    if (!this.vdoc) return;
    try {
      this.vdoc.execCommand('styleWithCSS', false, 'true');
    } catch {
      /* 忽略 */
    }
    this.history = new PatchHistory(this.vdoc);
    // 仅在新文件首次加载时，以「序列化后的文档」为脏检查基准：
    // 撤销回初始状态时 dirty 才能精确归零（避免与原始文本的格式差异误报）
    if (this.justLoaded) {
      this.justLoaded = false;
      this.rawOriginal = this.serialize();
      this.setDirty(false);
    }
    this.injectEditorCss();
    this.bindViewer();
    this.emit('ready', { doc: this.vdoc });
    this.emit('blank', this.blankInfo());
  }

  /* ---------------- 模式 ---------------- */

  setEditMode(on: boolean): void {
    this.editMode = on;
    this.deselect();
  }

  setScriptMode(on: boolean): void {
    this.scriptMode = on;
    this.deselect();
    this.render();
  }

  /** 编辑模式下允许运行脚本（用于多页 / JS 渲染的内容），保持可编辑 */
  setAllowScripts(on: boolean): void {
    if (this.allowScripts === on) return;
    this.allowScripts = on;
    this.deselect();
    this.render();
  }

  get isAllowScripts(): boolean {
    return this.allowScripts;
  }

  /** 是否执行脚本：预览模式 或 编辑模式下的「允许脚本」 */
  private scriptsEnabled(): boolean {
    return this.scriptMode || this.allowScripts;
  }

  get isEditMode(): boolean {
    return this.editMode;
  }

  get isScriptMode(): boolean {
    return this.scriptMode;
  }

  private editableOn(): boolean {
    return this.editMode && !!this.vdoc;
  }

  /* ---------------- 状态 ---------------- */

  get docHTMLValue(): string {
    return this.docHTML;
  }

  get fileNameValue(): string {
    return this.fileName;
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  get canUndo(): boolean {
    return this.history?.canUndo ?? false;
  }

  get canRedo(): boolean {
    return this.history?.canRedo ?? false;
  }

  get hasDoc(): boolean {
    return this.docHTML.length > 0;
  }

  blankInfo(): BlankInfo {
    if (this.scriptsEnabled() || !this.vdoc || !this.vdoc.body) return { show: false, hasScript: false, textLen: 0 };
    const textLen = (this.vdoc.body.innerText || '').trim().length;
    const hs = hasScript(this.docHTML);
    return { show: hs && textLen < 40, hasScript: hs, textLen };
  }

  private setDirty(d: boolean): void {
    if (this.dirty === d) return;
    this.dirty = d;
    this.emit('dirty', { dirty: d });
  }

  /* ---------------- 序列化 / 导出 ---------------- */

  serialize(): string {
    if (!this.vdoc) return this.docHTML;
    // 临时摘除编辑器注入的样式（data-patchly），避免污染导出文件
    const injected = this.vdoc.querySelector('style[data-patchly]');
    injected?.remove();
    const html = serializeDoc(this.vdoc, this.doctype);
    if (injected && !injected.isConnected) {
      (this.vdoc.head || this.vdoc.documentElement).appendChild(injected);
    }
    return html;
  }

  private commit(): void {
    if (!this.vdoc) return;
    this.docHTML = this.serialize();
    this.setDirty(this.docHTML !== this.rawOriginal);
  }

  private commitSoon(): void {
    if (this.commitTimer) clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => this.commit(), 300);
  }

  async prepareExport(): Promise<{ html: string; inlined: number }> {
    this.endEdit();
    let inlined = 0;
    if (!this.scriptMode && this.vdoc) inlined = await inlineImagesInDoc(this.vdoc);
    return { html: this.serialize(), inlined };
  }

  /* ---------------- 几何 ---------------- */

  /** 元素在 iframe 内 → 相对外层窗口的视口矩形（超出画布部分裁剪） */
  elementViewportRect(el: Element): Rect {
    const f = this.iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const top = Math.max(f.top, f.top + r.top);
    const left = f.left + r.left;
    const bottom = Math.min(f.bottom, f.top + r.bottom);
    const visible = bottom > f.top && f.top + r.top < f.bottom;
    return { left, top, width: r.width, height: Math.max(0, bottom - top), visible };
  }

  /** 当前文字选区 → 视口矩形（未选中或不可见返回 null） */
  selectionRect(): Rect | null {
    if (!this.vdoc) return null;
    const sel = this.vdoc.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r.width && !r.height) return null;
    const f = this.iframe.getBoundingClientRect();
    return {
      left: f.left + r.left,
      top: f.top + r.top,
      width: r.width,
      height: r.height,
      visible: true,
    };
  }

  /** 当前激活目标（选中块或编辑中的元素）的覆盖层状态 */
  overlayState(): OverlayState | null {
    const el = this.picked || this.editingEl;
    if (el && el.isConnected) return { element: el, rect: this.elementViewportRect(el) };
    return null;
  }

  /* ---------------- 交互 ---------------- */

  private bindViewer(): void {
    const vdoc = this.vdoc;
    if (!vdoc) return;
    const win = this.iframe.contentWindow;
    if (!win) return;

    vdoc.addEventListener('mouseover', (e) => {
      if (!this.editableOn()) return;
      const el = this.resolve(e.target as Node);
      if (el && el !== this.picked && el !== this.editingEl) {
        this.emit('hover', { element: el, rect: this.elementViewportRect(el) });
      } else {
        this.emit('hover', null);
      }
    }, true);

    vdoc.addEventListener('mouseout', () => {
      this.emit('hover', null);
    }, true);

    vdoc.addEventListener('click', (e) => {
      if (!this.editableOn()) return;
      // 脚本模式下（多页 / 翻页 / 跳转）：普通点击仍是编辑 / 选中，
      // 只有 Alt+点击 才放行给页面自身处理（操作页面，避免冲突）
      if (this.scriptsEnabled() && (e as MouseEvent).altKey) return;
      e.preventDefault();
      e.stopPropagation();
      const el = this.resolve(e.target as Node);
      if (!el) {
        this.deselect();
        return;
      }
      if (this.isSvgText(el)) {
        this.pickBlock(el); // SVG 文字：单击先选中，双击弹窗改
        return;
      }
      if (this.isTextEl(el)) this.beginEdit(el);
      else this.pickBlock(el);
    }, true);

    vdoc.addEventListener('dblclick', (e) => {
      if (!this.editableOn()) return;
      if (this.scriptsEnabled() && (e as MouseEvent).altKey) return;
      e.preventDefault();
      e.stopPropagation();
      const el = this.resolve(e.target as Node);
      if (el && this.isSvgText(el)) this.editSvgText(el);
    }, true);

    vdoc.addEventListener('paste', (e) => {
      if (!this.editingEl) return;
      e.preventDefault();
      const t = (e.clipboardData as ClipboardEvent['clipboardData'])?.getData('text/plain') ?? '';
      if (t) vdoc.execCommand('insertText', false, t);
    }, true);

    vdoc.addEventListener('input', () => {
      if (this.editingEl) this.commitSoon();
    }, true);

    vdoc.addEventListener('selectionchange', () => {
      this.emit('selection', this.selectionRect());
    });

    vdoc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.deselect();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }
      if ((mod && e.key === 'y') || (mod && e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        this.redo();
      }
    }, true);

    win.addEventListener('scroll', () => this.reposition(), true);
    win.addEventListener('resize', () => this.reposition());
  }

  private resolve(t: Node | null): Element | null {
    if (!t) return null;
    const el = t.nodeType === 1 ? (t as Element) : t.parentElement;
    if (!el || SKIP_TAGS.has(el.tagName)) return null;
    return el;
  }

  private isTextEl(el: Element): boolean {
    if (NON_TEXT_TAGS.has(el.tagName)) return false;
    if (el.namespaceURI === 'http://www.w3.org/2000/svg') return false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent && n.textContent.trim()) return true;
    }
    return false;
  }

  private isSvgText(el: Element): boolean {
    return el.namespaceURI === 'http://www.w3.org/2000/svg' && ['text', 'tspan'].includes(el.tagName.toLowerCase());
  }

  /**
   * 把编辑器自身的样式注入 iframe 文档（如 AI 修改闪烁动画）。
   * iframe 是独立文档，外层页面的 CSS 对其中元素不生效，必须注入。
   */
  private injectEditorCss(): void {
    if (!this.vdoc || this.vdoc.querySelector('style[data-patchly]')) return;
    const style = this.vdoc.createElement('style');
    style.dataset.patchly = 'editor';
    style.textContent = `
.se-flash{animation:patchly-flash 1.1s ease-out !important}
@keyframes patchly-flash{
  0%{outline:3px solid rgba(13,148,136,.85);background-color:rgba(13,148,136,.22)}
  100%{outline:3px solid rgba(13,148,136,0);background-color:transparent}
}`;
    (this.vdoc.head || this.vdoc.documentElement).appendChild(style);
  }

  /* ---------------- 文字编辑 ---------------- */

  beginEdit(el: Element): void {
    if (this.editingEl === el) return;
    this.endEdit();
    this.unpick();
    this.editingEl = el;
    this.editBeforeHTML = el.innerHTML;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    (el as HTMLElement).focus();
    this.emit('editing', { element: el, rect: this.elementViewportRect(el) });
  }

  endEdit(): void {
    const el = this.editingEl;
    if (!el) return;
    if (this.commitTimer) clearTimeout(this.commitTimer);
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
    const after = el.innerHTML;
    if (after !== this.editBeforeHTML && this.history) {
      this.history.record(
        [{ type: 'set-html', target: el, html: after }],
        [{ type: 'set-html', target: el, html: this.editBeforeHTML }],
      );
      this.emitHistory();
    }
    this.editingEl = null;
    this.emit('editingEnd', undefined);
    this.commit();
  }

  /** 富文本命令（B/I/U/颜色等）。在文字编辑会话内执行，随会话一并进入撤销历史。 */
  richTextCmd(cmd: string, value?: string): void {
    if (!this.vdoc || !this.editingEl) return;
    this.vdoc.execCommand(cmd, false, value);
    this.commitSoon();
  }

  /** 选区字号微调：wrap 一层 span 改 font-size（替代已废弃的 fontSize 命令） */
  stepSelFontSize(dir: 1 | -1): void {
    if (!this.vdoc || !this.editingEl) return;
    const sel = this.vdoc.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const anchor = sel.anchorNode && sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    if (!(anchor instanceof Element)) return;
    const cur = parseFloat(this.iframe.contentWindow!.getComputedStyle(anchor).fontSize) || 14;
    const next = Math.max(9, Math.min(72, cur + dir));
    this.vdoc.execCommand('fontSize', false, '7');
    this.vdoc.querySelectorAll('font[size="7"]').forEach((f) => {
      const s = this.vdoc!.createElement('span');
      s.style.fontSize = next + 'px';
      while (f.firstChild) s.appendChild(f.firstChild);
      f.replaceWith(s);
    });
    this.commitSoon();
  }

  editSvgText(el: Element): void {
    const old = el.textContent ?? '';
    const v = window.prompt('修改 SVG 图中文字：', old);
    if (v === null || v === old) return;
    this.patch([{ type: 'set-text', target: el, text: v }]);
    this.emit('tip', { text: 'SVG 文字已修改' });
  }

  /* ---------------- 块选中 / 操作 ---------------- */

  pickBlock(el: Element): void {
    this.endEdit();
    this.picked = el;
    this.emit('picked', { element: el, rect: this.elementViewportRect(el) });
  }

  unpick(): void {
    this.picked = null;
    this.emit('unpicked', undefined);
  }

  deselect(): void {
    this.endEdit();
    this.unpick();
    this.emit('reposition', null);
    this.emit('selection', null);
  }

  /** 应用一批 Patch（块操作、AI 生成的 Patch 都走这里），自动进入撤销历史。返回实际作用的元素，供调用方做反馈动画。 */
  patch(patches: Patch[], note?: string): Element[] {
    if (!this.history || !this.vdoc || patches.length === 0) return [];
    const applied: Element[] = [];
    for (const p of patches) {
      if (!('target' in p)) continue; // 内部 restore 类型不含 target
      const el = resolveTarget(this.vdoc, p.target);
      if (el) applied.push(el);
    }
    if (note) patches = patches.map((p) => ({ ...p, note }));
    this.history.applyAndRecord(patches);
    this.emit('patched', { count: patches.length });
    this.emitHistory();
    this.commit();
    this.reposition();
    return applied;
  }

  /** 当前文档相对原文的净变更（新增后又删除的不记录）。返回 null 表示暂无文档。 */
  getChanges(): DiffResult | null {
    if (!this.vdoc) return null;
    const original = new DOMParser().parseFromString(this.rawOriginal, 'text/html');
    return diffDocuments(original, this.vdoc);
  }

  undo(): void {
    if (!this.history || !this.history.undo()) return;
    this.emitHistory();
    this.commit();
    this.reposition();
  }

  /**
   * 应用 Patch 但不入历史。
   * 供连续拖拽场景（如颜色面板拖动）使用：会话第一次变更走 patch() 记录撤销点，
   * 后续高频变更走 applyLive() 合并进同一步撤销。
   */
  applyLive(patches: Patch[]): void {
    if (!this.history || !this.vdoc) return;
    applyBatch(this.vdoc, patches);
    this.commit();
    this.reposition();
  }

  redo(): void {
    if (!this.history || !this.history.redo()) return;
    this.emitHistory();
    this.commit();
    this.reposition();
  }

  reset(): void {
    this.docHTML = this.rawOriginal;
    this.setDirty(false);
    this.render();
  }

  private emitHistory(): void {
    this.emit('history', { canUndo: this.canUndo, canRedo: this.canRedo });
  }

  /* ---------------- 浮层重算 ---------------- */

  reposition(): void {
    this.emit('hover', null);
    this.emit('reposition', this.overlayState());
    this.emit('selection', this.selectionRect());
  }
}
