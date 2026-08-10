<script setup lang="ts">
import { reactive, ref } from 'vue';
import type { Change } from '@patchly/core';
import type { Patchlyor } from '@patchly/editor';
import Icon from './Icon.vue';
import { loadSettings, PRESETS, saveSettings, type LLMSettings } from '../services/settings';
import { requestPatches } from '../services/llm';
import { flashElements } from '../utils/flash';

export type SideTab = 'ai' | 'settings' | 'changes';

const props = defineProps<{
  open: boolean;
  tab: SideTab;
  editor: Patchlyor | null;
  selected: Element | null;
  selectedPath: string;
  hasDoc: boolean;
  changes: Change[] | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'update:tab', v: SideTab): void;
}>();

const settings = reactive<LLMSettings>(loadSettings());
const instruction = ref('');
const status = ref('');
const statusKind = ref<'idle' | 'ok' | 'err'>('idle');
const busy = ref(false);

function applyPreset(index: number): void {
  const p = PRESETS[index];
  if (!p) return;
  settings.baseUrl = p.baseUrl;
  settings.model = p.model;
}

function save(): void {
  saveSettings({ ...settings });
  status.value = '已保存';
  statusKind.value = 'ok';
  setTimeout(() => (status.value = ''), 1500);
}

function computeStyles(el: Element): string {
  const win = el.ownerDocument.defaultView;
  if (!win) return '';
  const cs = win.getComputedStyle(el);
  const pick = ['color', 'backgroundColor', 'fontSize', 'fontWeight', 'textAlign', 'padding', 'margin', 'borderRadius'];
  return pick.map((k) => `${k}: ${cs.getPropertyValue(k)}`).join('; ');
}

async function generate(): Promise<void> {
  if (!props.editor || !props.selected) return;
  if (!settings.apiKey) {
    status.value = '请先在「设置」页配置 API Key';
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
      targetCssPath: props.selectedPath,
      targetHtml: props.selected.outerHTML,
      targetStyles: computeStyles(props.selected),
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

function iconFor(kind: Change['kind']): string {
  switch (kind) {
    case 'text':
      return 'type';
    case 'style':
      return 'color';
    case 'attr':
      return 'settings';
    case 'added':
      return 'plus';
    case 'removed':
      return 'trash';
  }
}
</script>

<template>
  <button
    class="side-toggle"
    :style="open ? { right: '340px' } : {}"
    :title="open ? '收起侧栏' : '打开侧栏'"
    @click="emit('update:open', !open)"
  >
    <Icon :name="open ? 'chevrons-left' : 'sparkles'" :size="14" />
    {{ open ? '收起' : 'AI 助手' }}
  </button>

  <aside id="sidePanel" :class="{ open }">
    <div class="tabs">
      <button :class="{ active: tab === 'ai' }" @click="emit('update:tab', 'ai')">
        <Icon name="sparkles" :size="14" />
        AI 助手
      </button>
      <button :class="{ active: tab === 'changes' }" @click="emit('update:tab', 'changes')">
        <Icon name="list" :size="14" />
        变更
        <span v-if="changes && changes.length" class="badge-count">{{ changes.length }}</span>
      </button>
      <button :class="{ active: tab === 'settings' }" @click="emit('update:tab', 'settings')">
        <Icon name="settings" :size="14" />
        设置
      </button>
      <button class="tabs-close" title="收起侧栏 (Esc)" @click="emit('update:open', false)">
        <Icon name="x" :size="14" />
      </button>
    </div>

    <div class="body">
      <template v-if="tab === 'ai'">
        <h3>选中元素改</h3>
        <div v-if="selected" class="sel-info">
          已选中：<code>{{ selected.tagName.toLowerCase() }}</code>
          <br />路径 <code>{{ selectedPath }}</code>
        </div>
        <div v-else class="sel-info">在画布上点击选中一个元素（或先编辑文字），再描述你想怎么改</div>
        <div class="field">
          <label>修改指令</label>
          <textarea
            v-model="instruction"
            placeholder="例如：把标题改成橙色并加粗 / 给这段文字加个浅灰背景 / 把这张卡片复制一份放到下面"
            :disabled="!selected || busy"
          ></textarea>
        </div>
        <button class="btn-main" :disabled="!selected || busy || !hasDoc" @click="generate">
          <Icon v-if="busy" name="loader" :size="14" class="spin" />
          <Icon v-else name="sparkles" :size="14" />
          {{ busy ? '生成中…' : '生成修改' }}
        </button>
        <div class="status" :class="statusKind">{{ status }}</div>
        <p style="color: var(--text-3); font-size: 12px; line-height: 1.7">
          简单修改（改字 / 换色 / 挪位置）建议直接在画布上手动完成，不消耗 token；
          AI 适合更复杂的调整（改布局、整体换风格、补文案）。
        </p>
      </template>

      <template v-else-if="tab === 'changes'">
        <h3>修改记录</h3>
        <div v-if="!changes || changes.length === 0" class="sel-info">
          还没有修改。改动会对比打开时的原文自动记录（新增后又删除的不算）。
        </div>
        <ul v-else class="changelist">
          <li v-for="(c, i) in changes" :key="i" :class="c.kind">
            <span class="ic"><Icon :name="iconFor(c.kind)" :size="13" /></span>
            <div style="flex: 1; min-width: 0">
              <code>{{ c.path }}</code>
              <p>{{ c.detail }}</p>
            </div>
          </li>
        </ul>
      </template>

      <template v-else>
        <h3>AI 接口配置</h3>
        <div class="field">
          <label>服务商预设</label>
          <select @change="applyPreset(+($event.target as HTMLSelectElement).value)">
            <option v-for="(p, i) in PRESETS" :key="i" :value="i" :selected="settings.baseUrl === p.baseUrl">
              {{ p.label }}
            </option>
          </select>
        </div>
        <div class="field">
          <label>Base URL</label>
          <input v-model="settings.baseUrl" placeholder="https://api.openai.com/v1" />
        </div>
        <div class="field">
          <label>API Key</label>
          <input v-model="settings.apiKey" type="password" placeholder="sk-..." />
        </div>
        <div class="field">
          <label>模型</label>
          <input v-model="settings.model" placeholder="gpt-4o-mini" />
        </div>
        <div class="field">
          <label>CORS 代理地址（可选）</label>
          <input
            v-model="settings.proxyUrl"
            placeholder="https://patchly-proxy.你的子域.workers.dev"
          />
          <span style="font-size: 11.5px; color: var(--text-3)">示例：https://patchly-proxy.1092728665.workers.dev</span>
        </div>
        <button class="btn-main" @click="save"><Icon name="check" :size="14" />保存配置</button>
        <p style="color: var(--text-3); font-size: 12px; line-height: 1.7">
          配置仅保存在浏览器 localStorage，不会上传。兼容 OpenAI / DeepSeek / Moonshot 等接口。
          若目标 API 不允许浏览器跨域，在「CORS 代理地址」填上 Worker 地址即可（见仓库 proxy/）。
        </p>
      </template>
    </div>
  </aside>
</template>
