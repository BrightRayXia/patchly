<script setup lang="ts">
import type { Rect } from '@patchly/editor';

defineProps<{ rect: Rect; kind: 'hover' | 'pick' }>();
</script>

<template>
  <div
    class="ovl on"
    :id="kind === 'hover' ? 'hoverBox' : 'pickBox'"
    :style="{ left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' }"
  ></div>
</template>
