import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  root: 'app',
  publicDir: '../public',
  plugins: [
    nodePolyfills({ include: ['buffer', 'process', 'util', 'stream'] }),
    react(),
    wasm(),
  ],
  build: {
    target: 'esnext',
    minify: false,
    outDir: '../dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/onchain-runtime-v3'],
    include: ['@midnight-ntwrk/compact-runtime'],
  },
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
    mainFields: ['browser', 'module', 'main'],
  },
});
