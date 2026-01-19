import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, renameSync, existsSync, rmSync } from 'fs';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/presentation/popup/popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: (assetInfo) => {
          // CSS と HTML は dist 直下に配置
          if (assetInfo.name?.endsWith('.css') || assetInfo.name?.endsWith('.html')) {
            return '[name].[ext]';
          }
          return 'assets/[name].[ext]';
        },
      },
    },
    // Chrome Extension では eval を使えないため
    sourcemap: false,
    minify: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    vue(),
    {
      name: 'chrome-extension-build',
      closeBundle() {
        // manifest.json を dist にコピー
        mkdirSync('dist', { recursive: true });
        copyFileSync('public/manifest.json', 'dist/manifest.json');

        // HTML ファイルを dist 直下に移動
        const htmlSource = 'dist/src/presentation/popup/popup.html';
        const htmlDest = 'dist/popup.html';
        if (existsSync(htmlSource)) {
          renameSync(htmlSource, htmlDest);
          // 空のディレクトリを削除
          if (existsSync('dist/src')) {
            rmSync('dist/src', { recursive: true, force: true });
          }
        }
      },
    },
  ],
});
