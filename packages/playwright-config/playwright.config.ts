import { devices } from '@playwright/test'

import { definePlaywrightConfig } from './src/index.js'

// This package's own browser tests: the CSP guard against real Chromium and Firefox.
export default definePlaywrightConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  testDir: './browser-tests',
  testMatch: '*.pw.ts',
})
