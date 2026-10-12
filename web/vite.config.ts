/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// В разработке запросы к API идут через прокси на Studio2: cookie сессии партнёра остаётся на одном origin
// (она SameSite=Strict, с другого origin браузер её не отдаст). Адрес Studio2 — переменная STUDIO2_URL.
const studio2 = process.env.STUDIO2_URL ?? 'http://localhost:5012';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
    // Дизайн-система лежит в соседней папке репозитория: токены, компоненты, шрифт, иконки.
    fs: { allow: ['..'] },
    proxy: { '/partner-api': { target: studio2, changeOrigin: true } }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false
  }
});
