import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: 'apps/api/src/hosted.ts',
    outDir: 'api', emptyOutDir: true, minify: false, target: 'node22',
    rollupOptions: { output: { entryFileNames: 'index.mjs' } },
  },
});
