# @wshno/eslint-config

Shared ESLint flat config (ESLint 10): JavaScript and TypeScript recommended rules, React through
[@eslint-react](https://eslint-react.xyz) (which includes the rules of hooks), and React Refresh.

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

| Export        | Contains                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `ignores`     | `node_modules`, `build`, `dist`, `coverage`, `.react-router`                                           |
| `base`        | `@eslint/js` and `typescript-eslint` recommended; unused names allowed when prefixed with `_`          |
| `react`       | `@eslint-react` `recommended-typescript` for `*.jsx`/`*.tsx`, React Refresh, browser globals           |
| `reactRouter` | `react`, plus route modules and `root.tsx` exempt from React Refresh, and Node globals for server code |
| `node`        | Node globals, for scripts, tools and Playwright                                                        |

```js
import { base, ignores, node } from '@wshno/eslint-config'

export default [...ignores, ...base, ...node, { ignores: ['playwright-report/**'] }]
```

TypeScript is limited to `<6.1` by typescript-eslint.
