import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const rootDir = __dirname;
  const projectRoot = path.resolve(rootDir, '..');
  const env = loadEnv(mode, projectRoot, '');
  const requestedBackendPort = Number.parseInt(env.PORT ?? '', 10);
  const backendPort = Number.isFinite(requestedBackendPort) && requestedBackendPort > 0
    ? requestedBackendPort
    : 5001;
  const requestedFrontendPort = Number.parseInt(env.VITE_PORT ?? '', 10);
  const frontendPort = Number.isFinite(requestedFrontendPort) && requestedFrontendPort > 0
    ? requestedFrontendPort
    : 5173;
  const backendTarget = env.VITE_API_TARGET || `http://localhost:${backendPort}`;

  return {
    root: rootDir,
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    build: {
      outDir: path.resolve(projectRoot, 'dist'),
      emptyOutDir: true,
    },
    server: {
      host: '0.0.0.0',
      port: frontendPort,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
