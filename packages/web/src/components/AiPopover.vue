<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { cssPath } from '@patchly/core';
import type { Rect, Patchlyor } from '@patchly/editor';
import Icon from './Icon.vue';
import { requestPatches } from '../services/llm';
import { loadSettings, type LLMSettings } from '../services/settings';
import { flashElements } from '../utils/flash';

const props = defineProps<{ editor: Patchlyor; target: Element; rect: Rect }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const settings = reactive<LLMSettings>(loadSettings());
const instruction = ref('');
const status = ref('');
const statusKind = ref<'idle' | 'ok' | 'err'>('idle');
const busy = ref(false);

const tag = computed(() => props.target.tagName.toLowerCase());
const path = computed(() => cssPath(props.target));

const style = computed(() => {
  const w = 300;
  let x = props.rect.left + props.rect.width + 12;
  if (x + w > window.innerWidth - 8) x = Math.max(8, props.rect.left - w - 12);
  let y = Math.max(8, Math.min(props.rect.top, window.innerHeight - 260));
  return { left: `${x}px`, top: `${y}px` };
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
  <div id="aiPopover" :style="style">
    <div class="head">
      <span class="tt">
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
