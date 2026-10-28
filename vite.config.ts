import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vitest/config';

// Vite: dev en LAN (adb reverse tcp:5173) y build estático para Cloudflare Workers.
// `--mode https` (npm run dev:https) sirve con certificado autofirmado: WebXR exige
// contexto seguro y así la tablet puede entrar por la IP de la Wi-Fi sin adb.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'https' ? [basicSsl({ name: 'cauce-dev' })] : [],
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/gsap')) return 'gsap';
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
}));
