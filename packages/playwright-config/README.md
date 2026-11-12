# @wshno/playwright-config

The shared Playwright config, guards that fail a test on what it doesn't check (CSP violations, console
errors, failed requests), an axe accessibility check, and the one pinned `@playwright/test` version for
every app's e2e tests.

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

To add reporters, extend the exported lists. `allureReporter()` and `monocartReporter()` give the
entries the apps share (install `allure-playwright` and `monocart-reporter` yourself; they are optional
peers):

```ts
import {
  allureReporter,
  ciReporters,
  definePlaywrightConfig,
  isCI,
  localReporters,
  monocartReporter,
} from '@wshno/playwright-config'

export default definePlaywrightConfig({
  reporter: isCI ? [...ciReporters, allureReporter(), monocartReporter({ name: 'App E2E' })] : localReporters,
})
```

## Coverage

Browser JS coverage of the app's bundle, mapped back to its sources through the source maps, and merged
with the unit tests' coverage into one table.

1. **Collect.** Add the monocart reporter with `coverage`, and build the suite's `test` on `coverageTest`.
   Its `page` records V8 coverage and hands it to monocart, only when the run has that reporter and the
   browser is Chromium, so local runs without it pay nothing.

   ```ts
   // playwright.config.ts
   reporter: isCI
     ? [
         ...ciReporters,
         monocartReporter({
           name: 'App E2E',
           coverage: { origin: baseURL, layout: { root: 'frontend', sourceDirs: ['app'] } },
         }),
       ]
     : localReporters,

   // tests/fixtures.ts
   export const test = mergeTests(guardsTest, coverageTest)
   ```

   `layout` names the app's directory in the repo and its source directories: paths from the source maps
   become repo-relative (`frontend/app/root.tsx`), and anything outside `root` (node_modules, generated
   files) drops out. `origin` keeps the scripts served by the app; pass `entryFilter` instead to narrow it
   to the app's own chunks. The reports (v8 html, lcov, Cobertura) go to `monocart-coverage/`: list it in
   `playwright-e2e.yml`'s `coverage_paths_json` to upload it as the `e2e-coverage` artifact.

2. **Merge.** `wshno-coverage-summary` prints a Markdown table (unit, e2e, combined, and the files where e2e
   adds the most) for a job summary or a PR comment. Either report may be lcov or Cobertura, and the paths
   are normalised with the same layout:

   ```sh
   npx wshno-coverage-summary --unit frontend/coverage/cobertura-coverage.xml \
     --e2e e2e/monocart-coverage/lcov.info --root frontend --source-dirs app
   ```

   `--exclude <regex>` drops files (matched against the normalised path), `--top <n>` sizes the gains table,
   and `--unit-label` names the unit row. The merge is approximate: istanbul counts statement lines and V8
   counts every executable line, so a line only one side knows keeps that side's status.

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

## Guards

Three auto fixtures fail a test on problems it doesn't assert on, even when everything it does check
works:

| Guard          | Fails on                                                                      | Fixture with what it found |
| -------------- | ----------------------------------------------------------------------------- | -------------------------- |
| `cspGuard`     | Content-Security-Policy violations, Report-Only included                      | `cspViolations`            |
| `consoleGuard` | `console.error` and `console.warn`, uncaught exceptions, unhandled rejections | `consoleEntries`           |
| `requestGuard` | browser requests that answer 4xx/5xx or fail with a network error             | `failedRequests`           |

Each one fails the test in teardown, with one line per finding, and attaches its findings as JSON. Each
covers every page and frame in the test's browser context.

`guardsTest` has all three. Merge it into the suite's own `test`, and import `test` from there in the
specs:

```ts
// fixtures/test.ts
import { mergeTests } from '@playwright/test'
import { guardsTest } from '@wshno/playwright-config'

import { test as authTest } from './auth'

export * from '@playwright/test'
export const test = mergeTests(authTest, guardsTest)
```

`cspTest`, `consoleTest` and `requestTest` have one guard each. A suite that already calls
`test.extend(...)` can spread `cspFixtures`, `consoleFixtures` and `requestFixtures` into it instead.

### Options

Set them with `test.use()`, in the fixtures file or in a spec. Every guard takes `mode` and `allow`:

```ts
test.use({
  consoleGuard: {
    // fail (default), warn (annotate only) or off
    mode: 'warn',
    // findings to accept
    allow: [(entry) => entry.text.includes('Download the React DevTools')],
    // console only: which entries count (default: all three)
    types: ['error', 'pageerror'],
  },
  requestGuard: {
    // a spec that checks the 404 page on purpose
    allow: [(request) => request.resourceType === 'document' && request.status === 404],
    // requests only: ignore requests the browser cancelled, e.g. by navigating away (default: true)
    ignoreAborted: true,
  },
  cspGuard: {
    allow: [(violation) => violation.blockedURI.startsWith('https://www.google-analytics.com/')],
  },
})
```

**Taking them into an existing suite:** start with `mode: 'warn'`. The findings then show up as
annotations in the report, and the suite stays green while they are cleaned up. Then switch to `fail`.

### What each one sees

- **One finding, one guard.** The browser also logs CSP violations and failed loads to the console.
  `consoleGuard` leaves those to the other two, so nothing is reported twice. (`isOwnedByOtherGuard()`
  is the filter.)
- **Contexts a spec opens itself** with `browser.newContext()` are not covered. Call
  `attachCspGuard(context)`, `attachConsoleGuard(context)` or `attachRequestGuard(context)` on them.
- **The `request` fixture** (APIRequestContext) is not the browser, so `requestGuard` does not see it.
  A spec can assert on those responses directly.
- **`bypassCSP: true`** turns CSP off in the browser, so `cspGuard` refuses to run with it. Set
  `cspGuard: { mode: 'off' }` in specs that need it.
- **Web workers:** violations and console output from workers are not reported.
- **Only what the specs visit.** For CSP, run the policy as Report-Only in production for a while too.

To check the CSP header itself, `parseCsp()` turns it into one directive map per policy:

```ts
const response = await page.goto('/')
const [policy] = parseCsp(response?.headers()['content-security-policy'])
expect(policy?.get('frame-ancestors')).toEqual(["'none'"])
```

## Accessibility

`expectAccessible(page)` runs [axe](https://github.com/dequelabs/axe-core) on the page as it is now and
fails on serious and critical violations of WCAG 2.0, 2.1 and 2.2 A and AA. The full axe result is
attached to the test.

```ts
import { expectAccessible } from '@wshno/playwright-config'

test('the record list is accessible', async ({ page }) => {
  await page.goto('/records')
  await expectAccessible(page)

  // A dialog that is not open is not scanned: open it, then check again.
  await page.getByRole('button', { name: 'Add record' }).click()
  await expectAccessible(page, { include: ['[role="dialog"]'] })
})
```

Options: `impacts` (default `['serious', 'critical']`), `tags` (default `defaultAxeTags`), `include`
and `exclude` (CSS selectors), and `disableRules` (axe rule ids, e.g. `color-contrast` while a design
fix is pending).

It is an explicit call, not a guard: a scan is not free, and only the spec knows
when the page shows what should be checked.

## Lint

`@wshno/eslint-config` has a `playwright` preset for the spec files.

## Runner image

Each version of this package has an e2e runner image with the same version,
`ghcr.io/wshno/playwright-config:<version>`: `node:26-bookworm-slim` plus `chromium-headless-shell` for
the pinned `@playwright/test`, signed with cosign. A job in it installs no browsers, so it suits a
runner that can only reach a container registry; only `npm ci` needs a (possibly internal) npm
registry. Browser downloads are turned off in the image, so a version mismatch fails instead of
quietly downloading.

Bump the image tag together with this package: Playwright looks for the browser revision of its own
version. With `hwinther/reusable-workflows`' `playwright-e2e.yml`:

```yaml
with:
  container_image: ghcr.io/wshno/playwright-config:0.4.0 # same version as @wshno/playwright-config
  base_url: https://app.test.example
```

Headless only: the image has no headed Chromium, Firefox or WebKit. At 1.64.1 it is 363 MB
compressed, against 991 MB for Microsoft's `mcr.microsoft.com/playwright`. The image is built from
[`image/Dockerfile`](image/Dockerfile) on the same `playwright-config-v<version>` tag that stages the
npm package.
