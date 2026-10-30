import { defineConfig, type PlaywrightTestConfig, type ReporterDescription } from '@playwright/test'

/** True on CI runners (GitHub Actions sets CI=true). */
export const isCI = !!process.env.CI

/**
 * CI reporters. hwinther/reusable-workflows' playwright-e2e.yml uploads playwright-report/ and builds its
 * PR summary from playwright-report/results.json, so both paths are part of the contract. html must come
 * before json: it clears playwright-report/ when it writes.
 */
export const ciReporters: ReporterDescription[] = [
  ['github'],
  ['html', { open: 'never' }],
  ['json', { outputFile: 'playwright-report/results.json' }],
]

export const localReporters: ReporterDescription[] = [['list'], ['html', { open: 'on-failure' }]]

/**
 * The shared Playwright config. Top-level keys in `config` replace the defaults; `use` is merged key by key,
 * so an app sets only what differs. Projects are always the app's own.
 */
export function definePlaywrightConfig(config: PlaywrightTestConfig = {}): PlaywrightTestConfig {
  const { use, ...rest } = config
  return defineConfig({
    forbidOnly: isCI,
    fullyParallel: true,
    reporter: isCI ? ciReporters : localReporters,
    retries: isCI ? 2 : 0,
    testDir: './tests',
    ...rest,
    use: {
      baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
      screenshot: 'only-on-failure',
      trace: 'on-first-retry',
      video: 'retain-on-failure',
      ...use,
    },
  })
}
