import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    rollupOptions: {
      input: { main: 'index.html', admin: 'admin/index.html' },
      output: {
        manualChunks: undefined
      }
    }
  },
  server: {
    fs: { deny: ['**/.git/**', '**/.env*', '**/.local/**', '**/server/**', '**/private/**', '**/database/**', '**/*.php'] },
    proxy: {
      '/api': 'http://127.0.0.1:8081',
      '/uploads': 'http://127.0.0.1:8081'
    },
    port: 5173,
    strictPort: false
  }
});
