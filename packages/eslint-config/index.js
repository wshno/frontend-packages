import eslintReact from '@eslint-react/eslint-plugin'
import js from '@eslint/js'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Output and generated folders no project lints. */
export const ignores = [
  {
    ignores: ['**/node_modules/**', '**/build/**', '**/dist/**', '**/coverage/**', '**/.react-router/**'],
  },
]

/** JavaScript and TypeScript recommended, with `_`-prefixed names allowed to go unused. */
export const base = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
]

/**
 * React: @eslint-react's TypeScript preset (it includes rules-of-hooks and exhaustive-deps, so
 * eslint-plugin-react-hooks isn't needed) plus React Refresh for Vite HMR. Browser globals.
 */
export const react = [
  {
    files: ['**/*.{jsx,tsx}'],
    ...eslintReact.configs['recommended-typescript'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
]

/**
 * React Router framework mode: route modules and root.tsx export loaders, actions and meta next to
 * their component, which React Refresh would otherwise flag. Node globals for server code.
 */
export const reactRouter = [
  ...react,
  {
    files: ['app/routes/**/*.{ts,tsx}', 'app/root.tsx', 'app/routes.ts'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.server.{ts,tsx}', '**/.server/**/*.{ts,tsx}', 'app/entry.server.tsx', '*.config.{js,ts,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]

/** Node code: scripts, tools, Playwright and other test runners. */
export const node = [
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]

/** The usual setup for a React Router app. */
export default [...ignores, ...base, ...reactRouter]
