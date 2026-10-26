import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'assets-src/**', 'test-results/**', 'playwright-report/**', '.wrangler/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
  },
  {
    // Visor de modelos del Agente 2: corre en el navegador.
    files: ['tools/models/viewer/**/*.js'],
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', addEventListener: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly', devicePixelRatio: 'readonly', fetch: 'readonly', location: 'readonly', requestAnimationFrame: 'readonly', performance: 'readonly' },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    // Scripts de línea de comandos: la consola es su salida.
    files: ['tools/**'],
    rules: { 'no-console': 'off' },
  },
  {
    // La lógica pura no puede depender de Three.js ni del DOM.
    files: ['src/core/sim/**/*.ts', 'src/core/table/spec.ts', 'src/core/table/bounds.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', 'gsap', '*/ui/*'] }],
      'no-restricted-globals': ['error', 'document', 'window'],
    },
  },
  {
    // Las experiencias no tocan el DOM ni contienen textos (usan ctx.t()).
    files: ['src/experiences/*/logic/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'document'],
    },
  },
);
