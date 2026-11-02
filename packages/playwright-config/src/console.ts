import { type BrowserContext, test as base } from '@playwright/test'

import { flush, type GuardOptions, reportGuard } from './guard.js'

/** A console message, or an uncaught exception or unhandled rejection (`pageerror`). */
export interface ConsoleEntry {
  location: string
  text: string
  type: 'error' | 'pageerror' | 'warning'
}

export interface ConsoleGuardOptions extends GuardOptions<ConsoleEntry> {
  /** Which entries count. Default: all three. */
  types?: ConsoleEntry['type'][]
}

export interface ConsoleTestOptions {
  consoleGuard: ConsoleGuardOptions
}

export interface ConsoleFixtures extends ConsoleTestOptions {
  consoleEntries: ConsoleEntry[]
}

// What the browser logs for findings the other guards own, in Chromium's and Firefox's wording: CSP
// violations (cspGuard) and failed loads (requestGuard). Without this, each would be reported twice.
// Firefox also logs violations of its own favicon loader, which no page event reports.
const ownedElsewhere = [
  /Content[ -]Security[ -]Policy/,
  /^Failed to load resource: /,
  /Loading failed for the <script> with source/,
]

/** True for console text that cspGuard or requestGuard reports instead. */
export function isOwnedByOtherGuard(text: string): boolean {
  return ownedElsewhere.some((pattern) => pattern.test(text))
}

const guarded = new WeakMap<BrowserContext, ConsoleEntry[]>()

/**
 * Collects console errors and warnings, uncaught exceptions and unhandled rejections from every page in
 * `context`. The `consoleEntries` fixture does this for the test's own context.
 */
export function attachConsoleGuard(context: BrowserContext): ConsoleEntry[] {
  const existing = guarded.get(context)
  if (existing) return existing
  const entries: ConsoleEntry[] = []
  guarded.set(context, entries)
  context.on('console', (message) => {
    const type = message.type()
    if ((type !== 'error' && type !== 'warning') || isOwnedByOtherGuard(message.text())) return
    const { columnNumber, lineNumber, url } = message.location()
    entries.push({ location: url ? `${url}:${lineNumber}:${columnNumber}` : '', text: message.text(), type })
  })
  context.on('weberror', (webError) => {
    const error = webError.error()
    entries.push({ location: webError.page()?.url() ?? '', text: error.stack ?? error.message, type: 'pageerror' })
  })
  return entries
}

export function formatConsoleEntry(entry: ConsoleEntry): string {
  // A stack is many lines; its first one names the error.
  const text = entry.text.split('\n')[0] ?? ''
  const where = entry.location ? ` (${entry.location})` : ''
  return `${entry.type}: ${text}${where}`
}

/**
 * Fixtures that fail a test on console errors and warnings, uncaught exceptions and unhandled
 * rejections, even when everything the test checks works.
 */
export const consoleFixtures: Parameters<typeof base.extend<ConsoleFixtures>>[0] = {
  consoleGuard: [{ allow: [], mode: 'fail' }, { option: true }],

  consoleEntries: [
    async ({ consoleGuard, context }, use, testInfo) => {
      if (consoleGuard.mode === 'off') {
        await use([])
        return
      }
      const entries = attachConsoleGuard(context)
      await use(entries)
      await flush(context)
      const types = consoleGuard.types ?? ['error', 'pageerror', 'warning']
      await reportGuard(
        testInfo,
        consoleGuard,
        entries.filter((entry) => types.includes(entry.type)),
        {
          annotation: 'console-entry',
          attachment: 'console-entries.json',
          format: formatConsoleEntry,
          key: (entry) => [entry.type, entry.text, entry.location].join('|'),
          noun: 'console error(s), warning(s) or uncaught exception(s)',
        },
      )
    },
    { auto: true },
  ],
}

export const consoleTest = base.extend<ConsoleFixtures>(consoleFixtures)
