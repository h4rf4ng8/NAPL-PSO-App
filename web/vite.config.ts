import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('src', import.meta.url)) } },
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  optimizeDeps: { entries: ['index.html', 'test/browser/index.html', 'test/browser/regression.html'] },
  plugins: [react(), {
    name: 'fixture-fonts',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes('<!-- storage-fonts -->')) return html;
        const fonts = readFileSync(new URL('index.html', import.meta.url), 'utf8').match(/<style id="storage-fonts">[\s\S]*?<\/style>/)?.[0];
        if (!fonts) throw new Error('Production HTML must declare stored fonts.');
        return html.replace('<!-- storage-fonts -->', () => fonts);
      },
    },
  }],
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/test-results/**', '**/playwright-report/**'] } },
});
