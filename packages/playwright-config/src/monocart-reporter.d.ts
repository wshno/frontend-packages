// The one monocart-reporter export coverage.ts uses. monocart-reporter is an optional peer, imported
// only when the run has its reporter, so the package doesn't install it for its types.
declare module 'monocart-reporter' {
  import type { TestInfo } from '@playwright/test'

  export function addCoverageReport(data: unknown, testInfo: TestInfo): Promise<unknown>
}
