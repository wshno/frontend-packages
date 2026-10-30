# @wshno/playwright-config

The shared Playwright config, and the one pinned `@playwright/test` version for every app's e2e tests.

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

## Lint

`@wshno/eslint-config` has a `playwright` preset for the spec files.
