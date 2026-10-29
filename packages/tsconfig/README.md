# @wshno/tsconfig

Shared TypeScript base configs.

| Config                              | For                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@wshno/tsconfig/base.json`         | Strict settings every project shares: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `isolatedModules` |
| `@wshno/tsconfig/react-router.json` | React Router / Vite apps: DOM libs, `bundler` resolution, `react-jsx`, `noEmit`, `vite/client` types                                              |
| `@wshno/tsconfig/node.json`         | Node scripts, tools and test runners: `NodeNext`                                                                                                  |

```bash
npm install --save-dev typescript @wshno/tsconfig
```

```json
{
  "extends": "@wshno/tsconfig/react-router.json",
  "include": ["**/*", "**/.server/**/*", "**/.client/**/*", ".react-router/types/**/*"],
  "compilerOptions": {
    "types": ["node", "vite/client", "vitest/globals"],
    "rootDirs": [".", "./.react-router/types"],
    "paths": { "~/*": ["./app/*"] }
  }
}
```

Keep `include`, `rootDirs`, `paths` and `baseUrl` in the project's own tsconfig. TypeScript resolves them
relative to the file that sets them, so in a shared config they'd point into `node_modules`. `types`
replaces the list rather than merging, so a project that adds e.g. `vitest/globals` repeats the defaults.
