<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Rect, Patchlyor } from '@patchly/editor';
import Icon from './Icon.vue';

const props = defineProps<{ editor: Patchlyor; target: Element; rect: Rect | null }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const SWATCH = [
  '#1E1B4B', '#4338CA', '#6366F1', '#EA580C', '#C2410C', '#0D9488', '#14B8A6', '#9D174D',
  '#D97706', '#FDE68A', '#292524', '#57534E', '#A8A29E', '#FFFFFF', '#F5F5F4', '#FAFAF5',
];

const win = computed(() => props.target.ownerDocument.defaultView);
const cs = computed(() => win.value?.getComputedStyle(props.target));

function toHex(v: string | undefined | null): string {
  const m = v?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '';
  return '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
}

const text = ref(toHex(cs.value?.color) || '#000000');
const bg = ref(toHex(cs.value?.backgroundColor) || '#ffffff');
const bd = ref(toHex(cs.value?.borderColor) || '#dddddd');
const lastProp = ref('backgroundColor');

/** 连续拖拽会话：第一次走 patch() 记录撤销点，后续合并进同一步 */
let sessionProp: string | null = null;

function apply(prop: string, value: string): void {
  if (sessionProp !== prop) {
    sessionProp = prop;
    props.editor.patch([{ type: 'set-style', target: props.target, style: { [prop]: value } }]);
  } else {
    props.editor.applyLive([{ type: 'set-style', target: props.target, style: { [prop]: value } }]);
  }
}

function onHexChange(prop: string, value: string): void {
  sessionProp = null;
  const v = value.trim();
  if (!/^#?[0-9a-fA-F]{6}$/.test(v)) return;
  apply(prop, v[0] === '#' ? v : '#' + v);
}

function clearProp(prop: string): void {
  sessionProp = null;
  props.editor.patch([{ type: 'set-style', target: props.target, style: { [prop]: '' } }]);
}

function stepFont(d: 1 | -1): void {
  const cur = parseFloat(cs.value?.fontSize || '14') || 14;
  props.editor.patch([{ type: 'set-style', target: props.target, style: { fontSize: String(Math.max(9, Math.min(72, cur + d))) } }]);
}

function toggleBold(): void {
  const bold = parseInt(cs.value?.fontWeight || '400', 10) >= 600;
  props.editor.patch([{ type: 'set-style', target: props.target, style: { fontWeight: bold ? 'normal' : 'bold' } }]);
}

function swatch(c: string): void {
  sessionProp = null;
  props.editor.patch([{ type: 'set-style', target: props.target, style: { [lastProp.value]: c } }]);
}

const style = computed(() => {
  let x = 8;
  let y = 8;
  if (props.rect) {
    x = Math.max(8, Math.min(props.rect.left, window.innerWidth - 296));
    y = props.rect.top + props.rect.height + 8;
    if (y + 260 > window.innerHeight) y = Math.max(8, props.rect.top - 268);
  }
  return { left: `${x}px`, top: `${y}px` };
});
</script>

<template>
  <div id="palette" :style="style">
    <h4>
      <span style="display: inline-flex; align-items: center; gap: 6px"><Icon name="color" :size="14" />调整颜色</span>
      <span @click="emit('close')"><Icon name="x" :size="13" /></span>
    </h4>
    <div class="crow">
      <em>文字</em>
      <input type="color" :value="text" @pointerdown="lastProp = 'color'" @input="(e) => { const v=(e.target as HTMLInputElement).value; text=v; apply('color', v); }" />
      <input type="text" :value="text" @focus="lastProp='color'" @change="(e) => { text=(e.target as HTMLInputElement).value; onHexChange('color', (e.target as HTMLInputElement).value); }" />
      <button class="clr" @click="clearProp('color')">✕</button>
    </div>
    <div class="crow">
      <em>背景</em>
      <input type="color" :value="bg" @pointerdown="lastProp = 'backgroundColor'" @input="(e) => { const v=(e.target as HTMLInputElement).value; bg=v; apply('backgroundColor', v); }" />
      <input type="text" :value="bg" @focus="lastProp='backgroundColor'" @change="(e) => { bg=(e.target as HTMLInputElement).value; onHexChange('backgroundColor', (e.target as HTMLInputElement).value); }" />
      <button class="clr" @click="clearProp('backgroundColor')">✕</button>
    </div>
    <div class="crow">
      <em>边框</em>
      <input type="color" :value="bd" @pointerdown="lastProp = 'borderColor'" @input="(e) => { const v=(e.target as HTMLInputElement).value; bd=v; apply('borderColor', v); }" />
      <input type="text" :value="bd" @focus="lastProp='borderColor'" @change="(e) => { bd=(e.target as HTMLInputElement).value; onHexChange('borderColor', (e.target as HTMLInputElement).value); }" />
      <button class="clr" @click="clearProp('borderColor')">✕</button>
    </div>
    <div class="crow">
      <em>样式</em>
      <button class="pbtn" @click="toggleBold"><b>B</b> 加粗</button>
      <button class="pbtn" @click="stepFont(-1)">A−</button>
      <button class="pbtn" @click="stepFont(1)">A＋</button>
    </div>
    <div id="swatches">
      <span v-for="c in SWATCH" :key="c" class="sw" :style="{ background: c }" :title="c" @click="swatch(c)"></span>
    </div>
  </div>
</template>
