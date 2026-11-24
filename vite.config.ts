import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: path.resolve(__dirname, 'client'),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/docs': 'http://localhost:3000',
      '/docs.json': 'http://localhost:3000',
    },
  },
});
