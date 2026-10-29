# @wshno/eslint-config

Shared ESLint flat config (ESLint 10): JavaScript and TypeScript recommended rules, SonarJS, React
through [@eslint-react](https://eslint-react.xyz) (which includes the rules of hooks), and React
Refresh. Opt-in presets for Vitest, React Testing Library and Playwright.

```bash
npm install --save-dev eslint typescript @wshno/eslint-config
```

## A React Router app

`eslint.config.js`:

```js
import config from '@wshno/eslint-config'

export default config
```

## Composing

The default export is `[...ignores, ...base, ...reactRouter]`. Each piece is an array of flat-config
objects, so pick what fits and add project rules after it:

| Export                   | Contains                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ignores`                | `node_modules`, `build`, `dist`, `coverage`, `.react-router`                                                                                              |
| `base`                   | `@eslint/js`, `typescript-eslint` and SonarJS recommended; unused names allowed when prefixed with `_`; SonarJS `cognitive-complexity` and `todo-tag` off |
| `react`                  | `@eslint-react` `recommended-typescript` for `*.jsx`/`*.tsx`, React Refresh, browser globals                                                              |
| `reactRouter`            | `react`, plus route modules and `root.tsx` exempt from React Refresh, and Node globals for server code                                                    |
| `node`                   | Node globals, for scripts, tools and Playwright                                                                                                           |
| `vitest(files?)`         | `@vitest/eslint-plugin` recommended, on `*.test.*`, `*.spec.*` and `__tests__/` unless given other globs                                                  |
| `testingLibrary(files?)` | `eslint-plugin-testing-library` (React) and `eslint-plugin-jest-dom` recommended, on the same files                                                       |
| `playwright(files?)`     | `eslint-plugin-playwright` recommended and Node globals, on `e2e/` and `tests/` unless given other globs                                                  |

A React Router app with Vitest and Testing Library:

```js
import config, { testingLibrary, vitest } from '@wshno/eslint-config'

export default [...config, ...vitest(), ...testingLibrary()]
```

A standalone Playwright suite:

```js
import { base, ignores, node, playwright } from '@wshno/eslint-config'

export default [...ignores, ...base, ...node, ...playwright(['tests/**/*.ts']), { ignores: ['playwright-report/**'] }]
```

TypeScript is limited to `<6.1` by typescript-eslint.
