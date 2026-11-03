import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// 管理界面按实际使用的编辑器和数据表分包，保持依赖初始化顺序。
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3101',
      '/media': 'http://127.0.0.1:3101',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler)\//u.test(id))
            return 'react';
        },
      },
    },
  },
});
