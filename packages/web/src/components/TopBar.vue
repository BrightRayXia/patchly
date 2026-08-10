<script setup lang="ts">
import Icon from './Icon.vue';

defineProps<{
  fileName: string;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  editMode: boolean;
  scriptMode: boolean;
  allowScripts: boolean;
  hasDoc: boolean;
  changeView: boolean;
  changeCount: number;
}>();

const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'undo'): void;
  (e: 'redo'): void;
  (e: 'reset'): void;
  (e: 'export'): void;
  (e: 'toggle-script', v: boolean): void;
  (e: 'toggle-allow-scripts', v: boolean): void;
  (e: 'changes'): void;
}>();

function checked(e: Event): boolean {
  return (e.target as HTMLInputElement).checked;
}
</script>

<template>
  <header class="bar">
    <span class="brand">
      <span class="logo"><Icon name="zap" :size="16" /></span>
      <b>Patchly</b>
      <i>补丁式微调</i>
    </span>
    <span class="divider"></span>

    <button class="btn btn-open" @click="emit('open')">
      <span class="liquid-dot"></span>
      打开文件
    </button>
    <span v-if="fileName" class="pill" :title="fileName">{{ fileName }}</span>
    <span id="badge" :class="{ dirty }">{{ dirty ? '已修改' : '未修改' }}</span>

    <span class="spacer"></span>

    <div class="seg" title="编辑模式：手动改内容；预览模式：执行页面 JS 但不允许编辑">
      <button
        :class="{ active: editMode && !scriptMode }"
        :disabled="!hasDoc"
        @click="emit('toggle-script', false)"
      >
        <Icon name="pencil" :size="13" />
        编辑
      </button>
      <button
        :class="{ active: scriptMode }"
        :disabled="!hasDoc"
        title="预览模式会执行页面里的 JS，仅对可信文件开启"
        @click="emit('toggle-script', true)"
      >
        <Icon name="eye" :size="13" />
        预览
      </button>
    </div>
    <label
      v-if="editMode && !scriptMode && hasDoc"
      class="chip"
      title="多页 / 翻页 / 轮播等依赖 JS 渲染的内容：开启后脚本运行，同时保持可编辑"
    >
      <input type="checkbox" :checked="allowScripts" @change="emit('toggle-allow-scripts', checked($event))" />
      <span>允许脚本</span>
    </label>

    <span class="divider"></span>

    <button class="btn" :disabled="!canUndo" title="撤销 (Ctrl/⌘+Z)" @click="emit('undo')">
      <Icon name="undo" :size="15" />
    </button>
    <button class="btn" :disabled="!canRedo" title="重做 (Ctrl/⌘+Shift+Z)" @click="emit('redo')">
      <Icon name="redo" :size="15" />
    </button>
    <button class="btn" :disabled="!hasDoc" title="还原到打开时" @click="emit('reset')">
      <Icon name="reset" :size="15" />
    </button>

    <span class="divider"></span>

    <button
      class="btn"
      :class="{ active: changeView }"
      :disabled="!hasDoc"
      title="对比原文，标出所有修改过的元素与变更内容"
      @click="emit('changes')"
    >
      <Icon name="list" :size="15" />
      变更
      <span v-if="changeCount > 0" class="count">{{ changeCount }}</span>
    </button>

    <button class="btn btn-primary" :disabled="!hasDoc" title="导出 (Ctrl/⌘+S)" @click="emit('export')">
      <Icon name="download" :size="15" />
      导出
    </button>
  </header>
</template>
