<script setup lang="ts">
import { computed } from 'vue';
import type { Rect } from '@patchly/editor';
import Icon from './Icon.vue';

const props = defineProps<{ rect: Rect }>();
const emit = defineEmits<{ (e: 'action', act: string): void }>();

const style = computed(() => {
  const w = 360;
  let x = Math.max(8, Math.min(props.rect.left, window.innerWidth - w - 8));
  let y = props.rect.top - 44;
  if (y < 60) y = Math.min(window.innerHeight - 48, props.rect.top + props.rect.height + 10);
  return { left: `${x}px`, top: `${y}px` };
});
</script>

<template>
  <div id="blockBar" :style="style">
    <button title="AI 修改这个元素" @click="emit('action', 'ai')">
      <Icon name="sparkles" :size="14" />
      AI 改
    </button>
    <span class="sep"></span>
    <button title="调整颜色" @click="emit('action', 'color')">
      <Icon name="color" :size="14" />
      颜色
    </button>
    <button title="复制一份到下方" @click="emit('action', 'dup')">
      <Icon name="copy" :size="14" />
      复制
    </button>
    <button title="上移一位" @click="emit('action', 'up')">
      <Icon name="arrow-up" :size="14" />
      上移
    </button>
    <button title="下移一位" @click="emit('action', 'down')">
      <Icon name="arrow-down" :size="14" />
      下移
    </button>
    <button class="danger" title="删除该元素" @click="emit('action', 'del')">
      <Icon name="trash" :size="14" />
      删除
    </button>
  </div>
</template>
