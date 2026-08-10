<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { cssPath, type DiffResult } from '@patchly/core';
import { PatchlyEditor, type BlankInfo, type OverlayState, type Rect } from '@patchly/editor';
import Icon from './components/Icon.vue';
import TopBar from './components/TopBar.vue';
import OverlayBox from './components/OverlayBox.vue';
import BlockBar from './components/BlockBar.vue';
import TextBar from './components/TextBar.vue';
import PalettePanel from './components/PalettePanel.vue';
import AiPopover from './components/AiPopover.vue';
import SidePanel, { type SideTab } from './components/SidePanel.vue';
import ToastBox from './components/Toast.vue';

const iframeRef = ref<HTMLIFrameElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
let editor: PatchlyEditor | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const fileName = ref('');
const hasDoc = ref(false);
const dirty = ref(false);
const canUndo = ref(false);
const canRedo = ref(false);
const editMode = ref(true);
const scriptMode = ref(false);
const allowScripts = ref(false);
const hover = ref<OverlayState | null>(null);
const picked = ref<OverlayState | null>(null);
const editing = ref<OverlayState | null>(null);
const selection = ref<Rect | null>(null);
const blank = ref<BlankInfo | null>(null);
const bannerDismissed = ref(false);
const paletteTarget = ref<Element | null>(null);
const aiTarget = ref<Element | null>(null);
const toastMsg = ref('');
const showTip = ref(false);

/* 变更视图 */
const changeView = ref(false);
const changes = ref<DiffResult | null>(null);
const posTick = ref(0);
/* 侧栏（受控） */
const panelOpen = ref(false);
const panelTab = ref<SideTab>('ai');

const selectedEl = computed(() => picked.value?.element ?? editing.value?.element ?? null);
const selectedPath = computed(() => (selectedEl.value ? cssPath(selectedEl.value) : ''));
const selectedTag = computed(() => (selectedEl.value ? selectedEl.value.tagName.toLowerCase() : ''));
const showBanner = computed(() => !!blank.value?.show && !bannerDismissed.value && !scriptMode.value && !allowScripts.value);
const inspectorStyle = computed(() => {
  const r = picked.value?.rect;
  return r ? { left: `${r.left + 2}px`, top: `${r.top + 2}px` } : null;
});
const changeCount = computed(() => changes.value?.changes.length ?? 0);

/** 画布上给有变更的元素打状态角标 */
const changeBadges = computed(() => {
  void posTick.value;
  if (!changeView.value || !changes.value || !editor) return [];
  const list: { rect: Rect; label: string; kind: 'modified' | 'added' }[] = [];
  for (const [el, chs] of changes.value.byElement) {
    const rect = editor.elementViewportRect(el);
    if (!rect.visible) continue;
    const kind = chs.some((c) => c.kind === 'added') ? 'added' : 'modified';
    const label = kind === 'added' ? '新增' : chs.length > 1 ? `已修改 ${chs.length}` : '已修改';
    list.push({ rect, label, kind });
  }
  return list;
});

function showToast(msg: string): void {
  toastMsg.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMsg.value = ''), 2200);
}

function refreshChanges(): void {
  if (!editor) return;
  changes.value = editor.getChanges();
}

onMounted(() => {
  editor = new PatchlyEditor({ iframe: iframeRef.value! });
  // 开发调试钩子：浏览器控制台可直接操作编辑器实例
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__patchlyEditor = editor;
  }
  editor.on('dirty', ({ dirty: d }) => (dirty.value = d));
  editor.on('history', ({ canUndo: u, canRedo: r }) => {
    canUndo.value = u;
    canRedo.value = r;
  });
  editor.on('hover', (s) => (hover.value = s));
  editor.on('picked', (s) => {
    picked.value = s;
    paletteTarget.value = null;
    aiTarget.value = null;
  });
  editor.on('unpicked', () => (picked.value = null));
  editor.on('editing', (s) => (editing.value = s));
  editor.on('editingEnd', () => (editing.value = null));
  editor.on('selection', (r) => (selection.value = r));
  editor.on('reposition', (s) => {
    if (s) {
      if (editing.value) editing.value = s;
      else picked.value = s;
    }
    posTick.value++;
  });
  editor.on('blank', (b) => (blank.value = b));
  editor.on('tip', ({ text }) => showToast(text));
  // 内容变动后刷新变更记录（视图打开时才计算）
  editor.on('patched', () => {
    if (changeView.value) refreshChanges();
  });
  editor.on('editingEnd', () => {
    if (changeView.value) refreshChanges();
  });
  editor.on('history', () => {
    if (changeView.value) refreshChanges();
  });
});

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer);
});

/* ---------------- 文件 ---------------- */

function openFile(): void {
  fileInputRef.value?.click();
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (f) loadFile(f);
  input.value = '';
}

function onDrop(e: DragEvent): void {
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
}

function loadFile(f: File): void {
  if (!/\.(html?|htm)$/i.test(f.name) && f.type !== 'text/html') {
    showToast('请选择 HTML 文件');
    return;
  }
  const r = new FileReader();
  r.onload = () => {
    fileName.value = f.name;
    hasDoc.value = true;
    bannerDismissed.value = false;
    editMode.value = true;
    scriptMode.value = false;
    allowScripts.value = false;
    changeView.value = false;
    changes.value = null;
    aiTarget.value = null;
    editor!.loadHtml(String(r.result), f.name);
    showTip.value = true;
    setTimeout(() => (showTip.value = false), 5000);
    showToast('已载入：' + f.name);
  };
  r.readAsText(f);
}

/* ---------------- 模式 / 顶栏动作 ---------------- */

function toggleScript(v: boolean): void {
  if (v && !window.confirm('预览模式会执行文件里的 JavaScript，只建议对自己生成或可信的文件开启。继续？')) return;
  scriptMode.value = v;
  editMode.value = !v;
  editor?.setScriptMode(v);
}

function toggleAllowScripts(v: boolean): void {
  if (v && !window.confirm('开启脚本后，文件里的 JavaScript 会在编辑模式下运行（用于多页 / 翻页 / 轮播类内容），只建议对可信文件开启。继续？')) return;
  allowScripts.value = v;
  editor?.setAllowScripts(v);
  if (v) bannerDismissed.value = true;
}

function toggleChangeView(): void {
  changeView.value = !changeView.value;
  if (changeView.value) {
    refreshChanges();
    panelOpen.value = true;
    panelTab.value = 'changes';
    showToast(`找到 ${changeCount.value} 处变更`);
  }
}

function undo(): void {
  editor?.undo();
}

function redo(): void {
  editor?.redo();
}

function reset(): void {
  if (window.confirm('放弃所有修改，回到刚打开时的样子？')) {
    editor?.reset();
    if (changeView.value) refreshChanges();
  }
}

async function exportHtml(): Promise<void> {
  if (!editor) return;
  const { html, inlined } = await editor.prepareExport();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName.value.replace(/\.(html?|htm)$/i, '') + '-改.html';
  a.click();
  URL.revokeObjectURL(a.href);
  if (inlined > 0) showToast(`已内嵌 ${inlined} 张图片`);
  showToast('已导出：' + a.download);
}

/* ---------------- 块操作 ---------------- */

function blockAction(act: string): void {
  const el = picked.value?.element ?? editing.value?.element;
  if (!el || !editor) return;
  switch (act) {
    case 'ai':
      aiTarget.value = el;
      paletteTarget.value = null;
      break;
    case 'color':
      paletteTarget.value = el;
      aiTarget.value = null;
      break;
    case 'dup':
      editor.patch([{ type: 'duplicate', target: el }]);
      showToast('已复制一份到下方');
      break;
    case 'del':
      editor.patch([{ type: 'remove', target: el }]);
      showToast('已删除');
      break;
    case 'up':
      editor.patch([{ type: 'move', target: el, direction: 'up' }]);
      break;
    case 'down':
      editor.patch([{ type: 'move', target: el, direction: 'down' }]);
      break;
  }
}

/* ---------------- 全局快捷键 / 离开提醒 / 侧栏收合 ---------------- */

function onKeydown(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    void exportHtml();
  }
  if (e.key === 'Escape' && panelOpen.value) {
    panelOpen.value = false;
  }
}

/** 点击侧栏与切换按钮之外的地方 → 收起侧栏 */
function onDocMousedown(e: MouseEvent): void {
  if (!panelOpen.value) return;
  const t = e.target as HTMLElement | null;
  if (!t) return;
  if (t.closest('#sidePanel') || t.closest('.side-toggle')) return;
  panelOpen.value = false;
}

function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (dirty.value) {
    e.preventDefault();
    e.returnValue = '';
  }
}

window.addEventListener('keydown', onKeydown);
window.addEventListener('mousedown', onDocMousedown);
window.addEventListener('beforeunload', onBeforeUnload);
</script>

<template>
  <div id="shell">
    <TopBar
      :file-name="fileName"
      :dirty="dirty"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :edit-mode="editMode"
      :script-mode="scriptMode"
      :allow-scripts="allowScripts"
      :has-doc="hasDoc"
      :change-view="changeView"
      :change-count="changeCount"
      @open="openFile"
      @undo="undo"
      @redo="redo"
      @reset="reset"
      @export="exportHtml"
      @toggle-script="toggleScript"
      @toggle-allow-scripts="toggleAllowScripts"
      @changes="toggleChangeView"
    />
    <input ref="fileInputRef" type="file" accept=".html,.htm" hidden aria-label="选择 HTML 文件" @change="onFileChange" />

    <main id="stage" :class="{ aurora: !hasDoc }" @dragover.prevent @drop.prevent="onDrop">
      <div v-if="!hasDoc" class="aurora-bg" aria-hidden="true">
        <span class="blob b1"></span>
        <span class="blob b2"></span>
        <span class="blob b3"></span>
      </div>
      <div id="placeholder" v-if="!hasDoc">
        <div class="icon"><Icon name="zap" :size="32" /></div>
        <h2>让 AI 写，我来改</h2>
        <div>把 HTML 文件拖进来，或点下面的按钮</div>
        <button class="btn btn-primary btn-open" @click="openFile">
          <span class="liquid-orb"></span>
          打开 HTML 文件
        </button>
      </div>

      <iframe ref="iframeRef" id="view" sandbox="allow-same-origin"></iframe>

      <div id="tip" v-show="showTip">
        单击文字直接改 · 拖选文字调样式 · 双击 SVG 图文字可改 · 点选中元素可复制 / 删除 / 换色 / AI 改
      </div>

      <div id="banner" v-if="showBanner">
        <Icon name="info" :size="14" />
        <span>内容似乎没有完整显示（可能是多页 / 依赖 JS 渲染），试试在编辑模式下开启脚本</span>
        <button @click="toggleAllowScripts(true)">开启脚本</button>
        <span class="x" @click="bannerDismissed = true"><Icon name="x" :size="12" /></span>
      </div>

      <div id="statusBar">
        <span>
          <template v-if="fileName">{{ fileName }}<template v-if="dirty"> · 已修改</template></template>
          <template v-else>就绪</template>
        </span>
        <span>
          <template v-if="editMode && allowScripts && !scriptMode">
            点击=编辑 · <kbd>Alt</kbd>+点击=操作页面
          </template>
          <kbd>Esc</kbd> 取消选中
          <kbd>Ctrl/⌘Z</kbd> 撤销
          <kbd>Ctrl/⌘S</kbd> 导出
        </span>
      </div>
    </main>

    <!-- 变更状态角标 -->
    <div
      v-for="(b, i) in changeBadges"
      :key="i"
      class="change-badge"
      :class="b.kind"
      :style="{ left: b.rect.left + b.rect.width + 6 + 'px', top: b.rect.top + 2 + 'px' }"
    >
      {{ b.label }}
    </div>

    <!-- 浮层 -->
    <OverlayBox v-if="hover" :rect="hover.rect" kind="hover" />
    <OverlayBox v-if="picked" :rect="picked.rect" kind="pick" />

    <div v-if="picked && inspectorStyle && editMode && !scriptMode" id="inspector" :style="inspectorStyle">
      <span class="dot"></span>
      <code>{{ selectedTag }}</code>
      <span>{{ selectedPath }}</span>
    </div>

    <BlockBar v-if="picked && editMode && !scriptMode" :rect="picked.rect" @action="blockAction" />
    <TextBar v-if="editor && editing && selection && editMode" :editor="editor" :rect="selection" />
    <PalettePanel
      v-if="editor && paletteTarget"
      :editor="editor"
      :target="paletteTarget"
      :rect="picked?.rect ?? null"
      @close="paletteTarget = null"
    />
    <AiPopover
      v-if="editor && aiTarget && picked"
      :editor="editor"
      :target="aiTarget"
      :rect="picked.rect"
      @close="aiTarget = null"
    />

    <SidePanel
      :open="panelOpen"
      :tab="panelTab"
      :editor="editor"
      :selected="selectedEl"
      :selected-path="selectedPath"
      :has-doc="hasDoc"
      :changes="changes?.changes ?? null"
      @update:open="panelOpen = $event"
      @update:tab="panelTab = $event"
      @notify="showToast"
    />
    <ToastBox :message="toastMsg" />
  </div>
</template>
