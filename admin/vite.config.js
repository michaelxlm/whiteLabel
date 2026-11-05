import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 管理端独立工程：base=/admin/，构建产物输出到上层 dist/admin/，与静态站同域部署。
export default defineConfig({
  base: '/admin/',
  plugins: [vue()],
  build: {
    outDir: '../dist/admin',
    emptyOutDir: true,
  },
  server: {
    port: 5273,
    // dev 时把 API 与埋点代理到本机白标服务，避免跨域
    proxy: {
      '/admin/api': 'http://localhost:8787',
      '/track': 'http://localhost:8787',
    },
  },
});
