import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // 相对路径基准：可直接部署到 GitHub Pages 子路径 / Cloudflare Pages 等静态托管
  base: './',
  resolve: {
    alias: {
      // 直接链接源码，dev/build 都不需要先编译 core/editor
      '@patchly/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@patchly/editor': fileURLToPath(new URL('../editor/src/index.ts', import.meta.url)),
    },
  },
  server: {
    open: true,
  },
});
