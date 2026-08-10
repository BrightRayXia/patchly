<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <div id="toast" :class="{ on: !!message }">{{ message }}</div>
</template>
