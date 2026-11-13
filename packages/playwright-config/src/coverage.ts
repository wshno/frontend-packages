import { type FullConfig, type ReporterDescription, test as base } from '@playwright/test'

import { inLayout, normaliseSourcePath, type SourceLayout } from './coverage-summary.js'

/**
 * Browser JS coverage and the extra CI reporters: what used to be copied into each app's
 * playwright.config.ts and fixtures (ClutterStock, skylens).
 *
 * - `monocartReporter()` adds monocart-reporter: a dashboard, and with `coverage` the V8 coverage of
 *   the app's bundle mapped back to its sources (v8 html, lcov, Cobertura). The reusable
 *   playwright-e2e.yml uploads that directory as the e2e-coverage artifact (`coverage_paths_json`),
 *   and `wshno-coverage-summary` merges it with the unit tests' coverage.
 * - `coverageTest` records the coverage: its `page` starts V8 JS coverage and hands it to monocart at
 *   the end, but only when the run has the monocart reporter and the browser is Chromium (the only
 *   one with `page.coverage`). Everything else runs as before.
 * - `allureReporter()` adds allure-playwright, for an Allure report with history.
 *
 * monocart-reporter and allure-playwright are the app's own dependencies (optional peers here), so a
 * suite that uses neither installs neither.
 */

export interface MonocartCoverageOptions {
  /** Report title. Default: the reporter's name plus " coverage". */
  name?: string
  /**
   * Which scripts count, by URL. Default: script files (a path ending in a file name with an extension)
   * served from `origin`, so a page's inline scripts (an SSR document's hydration data, under the page's
   * own URL and without a source map) don't show up as a file named after the host. Narrow it to the
   * app's own chunks when the page loads big third-party bundles from the same origin.
   */
  entryFilter?: (entry: { url: string }) => boolean
  /** Where the app is served (the suite's baseURL); the default entryFilter keeps its scripts. */
  origin?: string
  /**
   * The app's layout in the repo. Source-map paths are normalised to repo-relative
   * `<root>/<sourceDir>/...` (the same paths wshno-coverage-summary gives the unit report), and only
   * those under a root and not matching `layout.exclude` are kept: node_modules, generated files and
   * whatever the app leaves out drop out.
   */
  layout?: SourceLayout
  /** Where the reports go. Default `./monocart-coverage` (relative to the config). */
  outputDir?: string
  /** monocart report types. Default `['v8', 'cobertura', 'lcov']`. */
  reports?: unknown[]
  /** Anything else monocart's coverage options take; overrides the above. */
  [option: string]: unknown
}

export interface MonocartReporterOptions {
  /** Report title, e.g. "ClutterStock E2E". */
  name: string
  /** Default `./monocart-report/index.html`. */
  outputFile?: string
  /** Browser coverage (see MonocartCoverageOptions); leave it out for the dashboard alone. */
  coverage?: MonocartCoverageOptions
}

/** The monocart-reporter entry for `reporter`, with the coverage defaults the apps share. */
export function monocartReporter({
  name,
  outputFile = './monocart-report/index.html',
  coverage,
}: MonocartReporterOptions): ReporterDescription {
  if (!coverage) return ['monocart-reporter', { name, outputFile }]
  const { name: coverageName, entryFilter, origin, layout, outputDir, reports, ...rest } = coverage
  const originPrefix = origin ? new URL(origin).origin : undefined
  const defaultEntryFilter = (entry: { url: string }) =>
    (!originPrefix || entry.url.startsWith(originPrefix)) && isScriptFile(entry.url)
  return [
    'monocart-reporter',
    {
      name,
      outputFile,
      coverage: {
        name: coverageName ?? `${name} coverage`,
        entryFilter: entryFilter ?? defaultEntryFilter,
        ...(layout && {
          sourcePath: (sourcePath: string) => normaliseSourcePath(sourcePath, layout),
          sourceFilter: (sourcePath: string) => inLayout(normaliseSourcePath(sourcePath, layout), layout),
        }),
        outputDir: outputDir ?? './monocart-coverage',
        reports: reports ?? ['v8', 'cobertura', 'lcov'],
        // One self-contained index.html, so the downloaded artifact opens from file://.
        inline: true,
        ...rest,
      },
    },
  ]
}

/** Whether a script URL names a file (`/assets/index-abc.js`), not a page (`/`, `/items/3`). */
export function isScriptFile(url: string): boolean {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    path = url.split(/[?#]/)[0] ?? ''
  }
  const last = path.split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  return dot > 0 && dot < last.length - 1
}

/** The allure-playwright entry for `reporter`. */
export function allureReporter(resultsDir = 'allure-results'): ReporterDescription {
  return ['allure-playwright', { resultsDir }]
}

/** Whether the run reports to monocart-reporter (Playwright resolves the name to its module path). */
export function hasMonocartReporter(config: Pick<FullConfig, 'reporter'>): boolean {
  return config.reporter.some(([name]) => /(?:^|[\\/])monocart-reporter(?:[\\/]|$)/.test(name))
}

export interface CoverageFixtures {
  /**
   * Record this test's coverage (default true). Turn it off for a project whose tests use the same V8
   * coverage interface themselves, e.g. Lighthouse audits: `use: { collectCoverage: false }`.
   */
  collectCoverage: boolean
}

/**
 * Records the test page's V8 JS coverage across navigations for monocart-reporter, when the run has
 * that reporter, the browser is Chromium and `collectCoverage` is on. Pages the test opens itself
 * (popups, `context.newPage()`) are not recorded, and a page the test already closed is skipped
 * rather than failing the test. Merge it with the guards: `mergeTests(guardsTest, coverageTest)`.
 */
export const coverageTest = base.extend<CoverageFixtures>({
  collectCoverage: [true, { option: true }],
  page: async ({ page, browserName, collectCoverage }, use, testInfo) => {
    const collect = collectCoverage && browserName === 'chromium' && hasMonocartReporter(testInfo.config)
    if (collect) await page.coverage.startJSCoverage({ resetOnNavigation: false })
    await use(page)
    if (collect && !page.isClosed()) {
      const coverage = await page.coverage.stopJSCoverage()
      const { addCoverageReport } = await import('monocart-reporter')
      await addCoverageReport(coverage, testInfo)
    }
  },
})
