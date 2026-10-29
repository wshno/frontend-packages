# frontend-packages

Shared frontend packages, published to npm under `@wshno`.

| Package                                              | What it is                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`@wshno/eslint-config`](packages/eslint-config)     | ESLint 10 flat config: JavaScript and TypeScript recommended, React through @eslint-react, React Refresh   |
| [`@wshno/otel`](packages/otel)                       | OpenTelemetry JS 3.0 setup for React Router apps: browser tracing, the Node SDK for SSR, SSR request spans |
| [`@wshno/prettier-config`](packages/prettier-config) | Prettier config: single quotes, no semicolons, trailing commas, width 120                                  |
| [`@wshno/tsconfig`](packages/tsconfig)               | TypeScript base configs: base, React Router (Vite), Node                                                   |

Apps depend on these instead of on the tools' plugin and SDK packages, so a major upgrade (a new
ESLint, an OpenTelemetry SDK generation) is done once here and arrives in each app as one version bump.

## Development

npm workspaces, Node 24 or later:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run format/check
```

The repo lints and formats itself with its own packages, from the workspace.

## Releasing

Each package is versioned and released on its own:

1. Bump `version` in `packages/<name>/package.json` in a PR, and merge it.
2. Tag the merge commit `<name>-v<version>` and push the tag, e.g. `git tag otel-v0.2.0 && git push origin otel-v0.2.0`.

`publish.yml` checks the tag against the package version, runs the checks, and stages the version
with npm Trusted Publishing (OIDC) and a provenance attestation.

3. Approve it with 2FA: Staged Packages on npmjs.com, or `npm stage list @wshno/<name>` and
   `npm stage approve <stage-id>`. Until then nothing is published. A brand-new package needs the `NPM_TOKEN`
secret for its first version, because a trusted publisher can only be configured on a package that
exists; see the comment at the top of `publish.yml`.
