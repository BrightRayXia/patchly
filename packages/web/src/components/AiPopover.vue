<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { cssPath } from '@patchly/core';
import type { Rect, PatchlyEditor } from '@patchly/editor';
import Icon from './Icon.vue';
import { requestPatches } from '../services/llm';
import { loadSettings, type LLMSettings } from '../services/settings';
import { flashElements } from '../utils/flash';

const props = defineProps<{ editor: PatchlyEditor; target: Element; rect: Rect }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const W = 300;
const H = 260;
const POS_KEY = 'patchly.aiPopover.pos';

const settings = reactive<LLMSettings>(loadSettings());
const instruction = ref('');
const status = ref('');
const statusKind = ref<'idle' | 'ok' | 'err'>('idle');
const busy = ref(false);

const tag = computed(() => props.target.tagName.toLowerCase());
const path = computed(() => cssPath(props.target));

/* ---------------- 位置：默认智能避让元素，用户可拖动并记住位置 ---------------- */
const pos = reactive({ left: 0, top: 0 });

function clamp(p: { left: number; top: number }): { left: number; top: number } {
  return {
    left: Math.max(8, Math.min(window.innerWidth - W - 8, p.left)),
    top: Math.max(8, Math.min(window.innerHeight - 40, p.top)),
  };
}

function autoPlace(): void {
  let x = props.rect.left + props.rect.width + 12;
  let y = Math.max(8, Math.min(props.rect.top, window.innerHeight - H - 8));
  if (x + W > window.innerWidth - 8) {
    // 右侧放不下 → 尝试左侧
    x = props.rect.left - W - 12;
    if (x < 8) {
      // 左右都放不下 → 元素下方/上方居中，尽量不压住元素
      x = Math.max(8, Math.min(window.innerWidth - W - 8, props.rect.left + props.rect.width / 2 - W / 2));
      y = props.rect.top + props.rect.height + 12;
      if (y + H > window.innerHeight) y = Math.max(8, props.rect.top - H - 12);
    }
  }
  const p = clamp({ left: x, top: y });
  pos.left = p.left;
  pos.top = p.top;
}

function loadSavedPos(): void {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { left: number; top: number };
      const c = clamp(p);
      pos.left = c.left;
      pos.top = c.top;
      return;
    }
  } catch {
    /* 忽略损坏数据 */
  }
  autoPlace();
}

loadSavedPos();

const style = computed(() => ({ left: `${pos.left}px`, top: `${pos.top}px` }));

/* ---------------- 拖动（Pointer Events + setPointerCapture，跨 iframe 也能拖） ---------------- */

const popEl = ref<HTMLElement | null>(null);

function startDrag(e: PointerEvent): void {
  // 不拦截头部里的按钮（关闭）与弹窗内控件
  if ((e.target as HTMLElement).closest('button, textarea, input')) return;
  e.preventDefault();
  const el = popEl.value;
  try {
    el?.setPointerCapture(e.pointerId);
  } catch {
    /* 忽略 */
  }
  const startX = e.clientX;
  const startY = e.clientY;
  const baseL = pos.left;
  const baseT = pos.top;

  const move = (ev: PointerEvent): void => {
    const p = clamp({ left: baseL + ev.clientX - startX, top: baseT + ev.clientY - startY });
    pos.left = p.left;
    pos.top = p.top;
  };
  const up = (ev: PointerEvent): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.classList.remove('dragging-popover');
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ left: pos.left, top: pos.top }));
    } catch {
      /* 忽略 */
    }
    try {
      el?.releasePointerCapture(ev.pointerId);
    } catch {
      /* 忽略 */
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  document.body.classList.add('dragging-popover');
}

onBeforeUnmount(() => {
  document.body.classList.remove('dragging-popover');
});

function computeStyles(el: Element): string {
  const win = el.ownerDocument.defaultView;
  if (!win) return '';
  const cs = win.getComputedStyle(el);
  const pick = ['color', 'backgroundColor', 'fontSize', 'fontWeight', 'textAlign', 'padding', 'margin', 'borderRadius'];
  return pick.map((k) => `${k}: ${cs.getPropertyValue(k)}`).join('; ');
}

async function generate(): Promise<void> {
  if (!settings.apiKey) {
    status.value = '请先在右侧「设置」页配置 API Key';
    statusKind.value = 'err';
    return;
  }
  const ins = instruction.value.trim();
  if (!ins) {
    status.value = '请输入修改指令';
    statusKind.value = 'err';
    return;
  }
  busy.value = true;
  status.value = '正在生成修改…';
  statusKind.value = 'idle';
  try {
    const { patches } = await requestPatches(settings, {
      instruction: ins,
      targetCssPath: path.value,
      targetHtml: props.target.outerHTML,
      targetStyles: computeStyles(props.target),
    });
    const applied = props.editor.patch(patches);
    flashElements(applied);
    status.value = `已应用 ${applied.length} 个修改（可撤销）`;
    statusKind.value = 'ok';
    instruction.value = '';
  } catch (err) {
    status.value = (err as Error).message;
    statusKind.value = 'err';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div ref="popEl" id="aiPopover" :style="style">
    <div class="head" title="按住拖动位置" @pointerdown="startDrag">
      <span class="tt">
        <Icon name="grip" :size="13" class="grip" />
        <Icon name="sparkles" :size="14" />
        AI 修改
        <code>{{ tag }}</code>
      </span>
      <button class="x" aria-label="关闭" @click="emit('close')"><Icon name="x" :size="13" /></button>
    </div>
    <textarea
      v-model="instruction"
      :disabled="busy"
      placeholder="例如：改成橙色加粗 / 换个更现代的风格 / 用口语化重写这段文字"
    ></textarea>
    <button class="btn-main" :disabled="busy" @click="generate">
      <Icon v-if="busy" name="loader" :size="14" class="spin" />
      <Icon v-else name="sparkles" :size="14" />
      {{ busy ? '生成中…' : '生成修改' }}
    </button>
    <div class="status" :class="statusKind">{{ status }}</div>
  </div>
</template>
