import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The output directory must match the `localResourceRoots` in extension.ts
    outDir: '../dist',
    rollupOptions: {
      output: {
        entryFileNames: `main.js`,
        chunkFileNames: `[name].js`,
        assetFileNames: `[name].[ext]`
      }
    }
  }
});
