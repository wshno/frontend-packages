import type { BrowserContext, TestInfo } from '@playwright/test'

/** `fail` fails the test, `warn` only annotates it, `off` does not listen. */
export type GuardMode = 'fail' | 'off' | 'warn'

export interface GuardOptions<T> {
  /** Findings to accept, for example from a third-party script the app does not control. */
  allow?: ((item: T) => boolean)[]
  mode?: GuardMode
}

export interface GuardReport<T> {
  /** Attachment name, e.g. `csp-violations.json`. */
  attachment: string
  /** Annotation type in warn mode, e.g. `csp-violation`. */
  annotation: string
  format: (item: T) => string
  /** Identity for de-duplication. */
  key: (item: T) => string
  /** Plural noun for the error message, e.g. `CSP violation(s)`. */
  noun: string
}

/** Drops duplicates and allowed findings, in the order they were reported. */
export function unexpected<T>(items: T[], key: (item: T) => string, allow: GuardOptions<T>['allow'] = []): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const id = key(item)
    if (seen.has(id) || allow.some((accept) => accept(item))) return false
    seen.add(id)
    return true
  })
}

// Browser events are queued tasks, so one from the test's last action may not have reached Node yet. A
// round trip through each open page lets them through; pages that are closing are skipped.
export async function flush(context: BrowserContext) {
  await Promise.all(
    context
      .pages()
      .map((page) =>
        Promise.race([
          page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0))).catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ]),
      ),
  )
}

/** Attaches what the guard found, then annotates (warn) or throws (fail). */
export async function reportGuard<T>(testInfo: TestInfo, options: GuardOptions<T>, items: T[], report: GuardReport<T>) {
  const found = unexpected(items, report.key, options.allow)
  if (found.length === 0) return
  await testInfo.attach(report.attachment, { body: JSON.stringify(found, null, 2), contentType: 'application/json' })
  const lines = found.map(report.format)
  if (options.mode === 'warn') {
    for (const line of lines) testInfo.annotations.push({ description: line, type: report.annotation })
    return
  }
  throw new Error(`${found.length} ${report.noun}:\n  ${lines.join('\n  ')}`)
}
