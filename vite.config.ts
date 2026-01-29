import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, renameSync, existsSync, rmSync, readFileSync, writeFileSync } from 'fs';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // Chrome Extension では相対パスが必要
  base: '',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/presentation/popup/popup.html'),
        background: resolve(__dirname, 'src/presentation/background/background.ts'),
        offscreen: resolve(__dirname, 'src/presentation/offscreen/offscreen.html'),
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

        // HTML ファイルを dist 直下に移動し、パスを修正
        const htmlFiles = [
          { source: 'dist/src/presentation/popup/popup.html', dest: 'dist/popup.html' },
          { source: 'dist/src/presentation/offscreen/offscreen.html', dest: 'dist/offscreen.html' },
        ];

        for (const { source, dest } of htmlFiles) {
          if (existsSync(source)) {
            // HTML を読み込んでパスを修正
            let content = readFileSync(source, 'utf-8');
            // ../../../ や ../../ などの相対パスを ./ に置換
            content = content.replace(/(?:\.\.\/)+/g, './');
            writeFileSync(dest, content);
            rmSync(source);
          }
        }

        // 空のディレクトリを削除
        if (existsSync('dist/src')) {
          rmSync('dist/src', { recursive: true, force: true });
        }
      },
    },
  ],
});
