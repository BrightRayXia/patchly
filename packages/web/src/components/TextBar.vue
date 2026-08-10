<script setup lang="ts">
import { computed } from 'vue';
import type { Rect, PatchlyEditor } from '@patchly/editor';
import Icon from './Icon.vue';

const props = defineProps<{ editor: PatchlyEditor; rect: Rect }>();

const style = computed(() => {
  const w = 230;
  let x = Math.max(8, Math.min(props.rect.left + props.rect.width / 2 - w / 2, window.innerWidth - w - 8));
  let y = props.rect.top - 44;
  if (y < 60) y = props.rect.top + props.rect.height + 10;
  return { left: `${x}px`, top: `${y}px` };
});

function cmd(c: string): void {
  props.editor.richTextCmd(c);
}

function cmdColor(c: string, v: string): void {
  props.editor.richTextCmd(c, v);
}

function fs(d: 1 | -1): void {
  props.editor.stepSelFontSize(d);
}
</script>

<template>
  <div id="textBar" :style="style" @mousedown.prevent>
    <button title="加粗" @click="cmd('bold')"><Icon name="bold" :size="15" /></button>
    <button title="斜体" @click="cmd('italic')"><Icon name="italic" :size="15" /></button>
    <button title="下划线" @click="cmd('underline')"><Icon name="underline" :size="15" /></button>
    <button title="删除线" @click="cmd('strikeThrough')"><Icon name="strike" :size="15" /></button>
    <span class="sep"></span>
    <label title="文字颜色">
      <Icon name="type" :size="15" />
      <input type="color" value="#0F766E" @input="(e) => cmdColor('foreColor', (e.target as HTMLInputElement).value)" />
    </label>
    <label title="背景高亮">
      <Icon name="highlighter" :size="15" />
      <input type="color" value="#FDE68A" @input="(e) => cmdColor('hiliteColor', (e.target as HTMLInputElement).value)" />
    </label>
    <span class="sep"></span>
    <button title="缩小字号" @click="fs(-1)"><Icon name="minus" :size="14" /></button>
    <button title="放大字号" @click="fs(1)"><Icon name="plus" :size="14" /></button>
  </div>
</template>
