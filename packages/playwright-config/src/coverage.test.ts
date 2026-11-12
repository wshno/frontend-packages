import { describe, expect, it } from 'vitest'

import { allureReporter, hasMonocartReporter, monocartReporter } from './coverage.js'

type CoverageOptions = {
  name: string
  entryFilter: (entry: { url: string }) => boolean
  sourcePath?: (path: string) => string
  sourceFilter?: (path: string) => boolean
  outputDir: string
  reports: unknown[]
  inline: boolean
}

const coverageOf = (reporter: ReturnType<typeof monocartReporter>) =>
  (reporter[1] as { coverage: CoverageOptions }).coverage

describe('monocartReporter', () => {
  it('is the dashboard alone without coverage', () => {
    expect(monocartReporter({ name: 'App E2E' })).toEqual([
      'monocart-reporter',
      { name: 'App E2E', outputFile: './monocart-report/index.html' },
    ])
  })

  it('keeps the scripts from the origin and maps sources through the layout', () => {
    const coverage = coverageOf(
      monocartReporter({
        name: 'App E2E',
        coverage: { origin: 'http://localhost:5173/some/path', layout: { root: 'frontend', sourceDirs: ['app'] } },
      }),
    )
    expect(coverage.name).toBe('App E2E coverage')
    expect(coverage.entryFilter({ url: 'http://localhost:5173/assets/root.js' })).toBe(true)
    expect(coverage.entryFilter({ url: 'https://auth.example/app.js' })).toBe(false)
    expect(coverage.sourcePath?.('app/lib/nonce.tsx')).toBe('frontend/app/lib/nonce.tsx')
    expect(coverage.sourceFilter?.('app/lib/nonce.tsx')).toBe(true)
    expect(coverage.sourceFilter?.('node_modules/react/index.js')).toBe(false)
    expect(coverage).toMatchObject({
      outputDir: './monocart-coverage',
      reports: ['v8', 'cobertura', 'lcov'],
      inline: true,
    })
  })

  it('lets the app override the defaults and pass monocart options through', () => {
    const entryFilter = (entry: { url: string }) => entry.url.includes('/_expo/')
    const coverage = coverageOf(
      monocartReporter({
        name: 'App',
        coverage: { entryFilter, outputDir: './cov', reports: ['lcov'], inline: false },
      }),
    )
    expect(coverage.entryFilter).toBe(entryFilter)
    expect(coverage).toMatchObject({ outputDir: './cov', reports: ['lcov'], inline: false })
    expect(coverage.sourcePath).toBeUndefined()
  })
})

describe('allureReporter', () => {
  it('writes to allure-results by default', () => {
    expect(allureReporter()).toEqual(['allure-playwright', { resultsDir: 'allure-results' }])
  })
})

describe('hasMonocartReporter', () => {
  it('recognises the reporter by its resolved module path', () => {
    expect(hasMonocartReporter({ reporter: [['/e2e/node_modules/monocart-reporter/lib/index.js', {}]] })).toBe(true)
    expect(hasMonocartReporter({ reporter: [['C:\\e2e\\node_modules\\monocart-reporter\\lib\\index.js', {}]] })).toBe(
      true,
    )
    expect(hasMonocartReporter({ reporter: [['monocart-reporter', {}]] })).toBe(true)
    expect(
      hasMonocartReporter({
        reporter: [
          ['html', {}],
          ['json', {}],
        ],
      }),
    ).toBe(false)
  })
})
