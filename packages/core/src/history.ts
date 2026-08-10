import { applyBatch } from './patch/apply';
import type { Patch } from './patch/types';

/**
 * 撤销/重做历史，基于 Patch 逆操作，而非整份文档快照。
 *
 * 设计：
 * - 每一条历史记录含两个方向：forward（向前）与 backward（向后）。
 * - commit() 应用 Patch 并保存其逆操作作为 backward。
 * - undo() 应用 backward，同时把「应用 backward 时捕获到的新逆操作」作为
 *   新的 forward 存进 redo 栈 —— 因为是在应用时实时捕获，引用永远新鲜，
 *   不会出现旧引用失效导致的回滚失败。
 * - redo() 对称。
 */
export interface HistoryEntry {
  forward: Patch[];
  backward: Patch[];
}

export class PatchHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  constructor(
    private doc: Document,
    private max = 50,
  ) {}

  /**
   * 应用 patches 并记录（标准路径：块操作、AI 生成的 Patch）。
   * forwardReplay：可选的重放版本（通常是把 Element 目标序列化为 CSS 选择器），
   * 供「干净导出」在全新文档上按顺序重放用户修改使用。
   */
  applyAndRecord(patches: Patch[], forwardReplay?: Patch[]): void {
    const backward = applyBatch(this.doc, patches);
    if (backward.length === 0) return; // 全部无操作，不产生历史
    this.undoStack.push({ forward: forwardReplay ?? patches, backward });
    this.trim();
    this.redoStack = [];
  }

  /** 按时间顺序展开所有已应用修改的 forward，用于在干净文档上重放（见 PatchlyEditor.prepareExport） */
  replayPatches(): Patch[] {
    const out: Patch[] = [];
    for (const entry of this.undoStack) out.push(...entry.forward);
    return out;
  }

  /** 变更已由外部应用（如 contenteditable 文字编辑会话），仅登记两个方向 */
  record(forward: Patch[], backward: Patch[]): void {
    this.undoStack.push({ forward, backward });
    this.trim();
    this.redoStack = [];
  }

  /** 撤销上一步；返回 true 表示执行了回滚 */
  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    const freshForward = applyBatch(this.doc, entry.backward);
    this.redoStack.push({ forward: freshForward, backward: entry.forward });
    return true;
  }

  /** 重做下一步；返回 true 表示执行了重做 */
  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    const freshBackward = applyBatch(this.doc, entry.forward);
    this.undoStack.push({ forward: entry.backward, backward: freshBackward });
    return true;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  private trim(): void {
    while (this.undoStack.length > this.max) this.undoStack.shift();
  }
}
