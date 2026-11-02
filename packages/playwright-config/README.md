# @wshno/playwright-config

The shared Playwright config, a CSP violation guard, and the one pinned `@playwright/test` version for every
app's e2e tests.

Apps depend on this package instead of on `@playwright/test`. A Playwright upgrade is then made once
here, and reaches each app as one version bump. npm hoists the pinned `@playwright/test`, so specs keep
importing from `@playwright/test` and `npx playwright` works as before.

```bash
npm install --save-dev @wshno/playwright-config
npm uninstall @playwright/test
```

## Use

`playwright.config.ts`:

```ts
import { devices } from '@playwright/test'
import { definePlaywrightConfig } from '@wshno/playwright-config'

export default definePlaywrightConfig({
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

The defaults:

| Setting          | CI (`CI` set)                            | Locally                   |
| ---------------- | ---------------------------------------- | ------------------------- |
| `reporter`       | `github`, `html`, `json`                 | `list`, `html` on failure |
| `retries`        | 2                                        | 0                         |
| `forbidOnly`     | on                                       | off                       |
| `fullyParallel`  | on                                       | on                        |
| `testDir`        | `./tests`                                | `./tests`                 |
| `use.baseURL`    | `BASE_URL`, else `http://localhost:5173` | the same                  |
| `use.trace`      | `on-first-retry`                         | the same                  |
| `use.screenshot` | `only-on-failure`                        | the same                  |
| `use.video`      | `retain-on-failure`                      | the same                  |

Top-level keys you pass replace the defaults. `use` is merged key by key, so you set only what differs.
Projects are always the app's own.

## Reports

On CI the html report goes to `playwright-report/` and the json report to
`playwright-report/results.json`. Those are the paths `playwright-e2e.yml` in
[hwinther/reusable-workflows](https://github.com/hwinther/reusable-workflows) uploads and builds its PR
summary from.

To add reporters, extend the exported lists:

```ts
import { ciReporters, definePlaywrightConfig, isCI, localReporters } from '@wshno/playwright-config'

export default definePlaywrightConfig({
  reporter: isCI ? [...ciReporters, ['allure-playwright']] : localReporters,
})
```

## Layout

Keep the e2e suite in its own npm package (`e2e/`, or `tests/e2e/` next to other test folders), not in the
app's `package.json`. CI then installs Playwright and the specs, not the whole app, and the app drops its
Playwright dependencies. For example:

```text
e2e/
  package.json          @wshno/playwright-config (+ reporters, eslint, tsconfig)
  playwright.config.ts
  tests/                specs, page objects, fixtures
```

With `playwright-e2e.yml`, point `playwright_working_directory` at that folder.

## Two configs, one suite

When the same specs run in two modes, for example locally against dev servers and on CI against a
built image, give each mode its own config and share only the specs:

```ts
// playwright.config.ts: local, starts the servers itself
export default definePlaywrightConfig({
  workers: 1,
  use: { baseURL: 'http://localhost:8081' },
  webServer: [{ command: 'npx expo start --web --port 8081', cwd: '../app', url: 'http://localhost:8081' }],
})

// playwright.ci.config.ts: CI, the stack is already up (docker compose)
export default definePlaywrightConfig({
  workers: 1,
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:8081' },
})
```

Run the second with `playwright test --config playwright.ci.config.ts`.

## Packages that bring their own Playwright

Some tools depend on `playwright` or `playwright-core` themselves: Artillery's Playwright engine,
`playwright-lighthouse`. Override them to the version this package pins, so the lockfile holds one
Playwright:

```json
"overrides": {
  "playwright": "1.64.1",
  "playwright-core": "1.64.1"
}
```

npm can only refer to a direct dependency in an override, so the version is written out; update it
together with this package.

## CommonJS suites

The package is ESM. A suite without `"type": "module"` still loads it, because Node 22.12+ can
`require()` an ES module that has no top-level await.

## CSP guard

`cspTest` fails a test when the page breaks its Content-Security-Policy. Report-Only violations count
too, so a policy can be tried in `Content-Security-Policy-Report-Only` first and the e2e suite already
fails on what it would block. Every existing spec becomes a CSP test, without new specs.

It listens for `securitypolicyviolation` in every page and frame of the test's browser context, and
fails the test in teardown with one line per violation. The violations are also attached to the test as
`csp-violations.json`.

Merge it into the suite's own `test`, and import `test` from there in the specs:

```ts
// fixtures/test.ts
import { mergeTests } from '@playwright/test'
import { cspTest } from '@wshno/playwright-config'

import { test as authTest } from './auth'

export * from '@playwright/test'
export const test = mergeTests(authTest, cspTest)
```

A suite that already calls `test.extend(...)` can spread `cspFixtures` into it instead.

Options, with `test.use()` in the fixtures file or in a spec:

```ts
test.use({
  cspGuard: {
    // fail (default), warn (annotate only) or off
    mode: 'fail',
    // violations to accept, for example from a third-party script the app does not control
    allow: [(v) => v.blockedURI.startsWith('https://www.google-analytics.com/')],
  },
})
```

- A spec can read what was collected from the `cspViolations` fixture.
- Contexts a spec opens itself with `browser.newContext()` are not covered. Call
  `attachCspGuard(context)` on them.
- `bypassCSP: true` turns CSP off in the browser, so the guard refuses to run with it. Set
  `cspGuard: { mode: 'off' }` in specs that need it.
- Violations from web workers are not reported.
- It catches only what the specs visit. Run the policy as Report-Only in production for a while too.

To check the header itself, `parseCsp()` turns it into one directive map per policy:

```ts
const response = await page.goto('/')
const [policy] = parseCsp(response?.headers()['content-security-policy'])
expect(policy?.get('frame-ancestors')).toEqual(["'none'"])
```

## Lint

`@wshno/eslint-config` has a `playwright` preset for the spec files.
