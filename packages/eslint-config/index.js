import eslintReact from '@eslint-react/eslint-plugin'
import js from '@eslint/js'
import vitestPlugin from '@vitest/eslint-plugin'
import jestDom from 'eslint-plugin-jest-dom'
import playwrightPlugin from 'eslint-plugin-playwright'
import reactRefresh from 'eslint-plugin-react-refresh'
import sonarjs from 'eslint-plugin-sonarjs'
import testingLibraryPlugin from 'eslint-plugin-testing-library'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Output and generated folders no project lints. */
export const ignores = [
  {
    ignores: ['**/node_modules/**', '**/build/**', '**/dist/**', '**/coverage/**', '**/.react-router/**'],
  },
]

/**
 * JavaScript and TypeScript recommended plus SonarJS recommended (bugs and code smells), with
 * `_`-prefixed names allowed to go unused. SonarJS's cognitive-complexity and todo-tag are off: a
 * complexity score and a TODO comment aren't defects.
 */
export const base = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/todo-tag': 'off',
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
  // Tool config in CommonJS, e.g. orval or postcss transformers.
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
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

/** Test files, for `vitest` and `testingLibrary`. */
const unitTestFiles = ['**/*.{test,spec}.{js,jsx,ts,tsx}', '**/__tests__/**/*.{js,jsx,ts,tsx}']

/**
 * Vitest's recommended rules for unit tests.
 * @param {string[]} [files] where the tests are; defaults to `*.test.*`, `*.spec.*` and `__tests__/`.
 */
export function vitest(files = unitTestFiles) {
  return [{ files, ...vitestPlugin.configs.recommended }]
}

/**
 * React Testing Library and jest-dom recommended rules: query priority, no manual `act`, the right
 * DOM matchers.
 * @param {string[]} [files] where the component tests are; defaults to the same files as `vitest`.
 */
export function testingLibrary(files = unitTestFiles) {
  return [
    { files, ...testingLibraryPlugin.configs['flat/react'] },
    { files, ...jestDom.configs['flat/recommended'] },
  ]
}

/**
 * Playwright's recommended rules (missing `await` on actions and assertions, `waitForTimeout`,
 * focused or skipped tests left in), with Node globals.
 * @param {string[]} [files] where the e2e tests are; defaults to `e2e/` and `tests/`.
 */
export function playwright(files = ['e2e/**/*.{js,ts}', 'tests/**/*.{js,ts}']) {
  return [
    { files, ...playwrightPlugin.configs['flat/recommended'] },
    { files, languageOptions: { globals: { ...globals.node } } },
  ]
}

/** The usual setup for a React Router app. */
export default [...ignores, ...base, ...reactRouter]
