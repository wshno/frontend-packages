import { type BrowserContext, test as base } from '@playwright/test'

import { flush, type GuardOptions, reportGuard, unexpected } from './guard.js'

/** One `securitypolicyviolation` event, as the browser reported it. */
export interface CspViolation {
  blockedURI: string
  columnNumber: number
  /** `enforce` for Content-Security-Policy, `report` for Content-Security-Policy-Report-Only. */
  disposition: 'enforce' | 'report'
  documentURI: string
  effectiveDirective: string
  lineNumber: number
  originalPolicy: string
  /** The first 40 characters of a blocked inline script or style, when the policy has 'report-sample'. */
  sample: string
  sourceFile: string
  violatedDirective: string
}

export type CspGuardOptions = GuardOptions<CspViolation>

export interface CspTestOptions {
  cspGuard: CspGuardOptions
}

export interface CspFixtures extends CspTestOptions {
  cspViolations: CspViolation[]
}

const bindingName = '__wshnoCspViolation'

// A string, not a function: this package compiles without the DOM lib. Playwright runs init scripts in
// every frame before the page's own scripts, and the browser does not apply the page's CSP to them.
// The listener goes on window, not document: a frame's first real document can reuse the window of its
// initial about:blank one, so a listener on that first document would never hear from the real page.
const listenerScript = `(() => {
  if (window.__wshnoCspGuard) return
  window.__wshnoCspGuard = true
  window.addEventListener('securitypolicyviolation', (e) => {
    const report = window.${bindingName}
    if (typeof report !== 'function') return
    void report({
      blockedURI: e.blockedURI,
      columnNumber: e.columnNumber,
      disposition: e.disposition,
      documentURI: e.documentURI,
      effectiveDirective: e.effectiveDirective,
      lineNumber: e.lineNumber,
      originalPolicy: e.originalPolicy,
      sample: e.sample,
      sourceFile: e.sourceFile,
      violatedDirective: e.violatedDirective,
    })
  }, true)
})()`

const guarded = new WeakMap<BrowserContext, CspViolation[]>()

/**
 * Collects CSP violations from every page and frame in `context`. The `cspViolations` fixture does this
 * for the test's own context; call it yourself for contexts a test opens with `browser.newContext()`.
 */
export async function attachCspGuard(context: BrowserContext): Promise<CspViolation[]> {
  const existing = guarded.get(context)
  if (existing) return existing
  const violations: CspViolation[] = []
  guarded.set(context, violations)
  await context.exposeBinding(bindingName, (_source, violation: CspViolation) => {
    violations.push(violation)
  })
  await context.addInitScript(listenerScript)
  return violations
}

function violationKey(v: CspViolation): string {
  return [v.disposition, v.effectiveDirective, v.blockedURI, v.sourceFile, v.lineNumber, v.columnNumber].join('|')
}

export function formatCspViolation(v: CspViolation): string {
  const blocked = v.blockedURI || '(no URI)'
  const where = v.sourceFile ? ` at ${v.sourceFile}:${v.lineNumber}:${v.columnNumber}` : ''
  const sample = v.sample ? ` sample=${JSON.stringify(v.sample)}` : ''
  const verb = v.disposition === 'report' ? 'would block' : 'blocked'
  return `${v.effectiveDirective} ${verb} ${blocked}${where} on ${v.documentURI}${sample}`
}

/** Drops duplicates and allowed violations, in the order they were reported. */
export function unexpectedCspViolations(violations: CspViolation[], allow: CspGuardOptions['allow'] = []) {
  return unexpected(violations, violationKey, allow)
}

/**
 * Fixtures that fail a test when the page violates its Content-Security-Policy, Report-Only included.
 * Spread them into an app's own `test.extend(...)`, or use `mergeTests(appTest, cspTest)`.
 */
export const cspFixtures: Parameters<typeof base.extend<CspFixtures>>[0] = {
  cspGuard: [{ allow: [], mode: 'fail' }, { option: true }],

  cspViolations: [
    async ({ bypassCSP, context, cspGuard }, use, testInfo) => {
      if (cspGuard.mode === 'off') {
        await use([])
        return
      }
      if (bypassCSP) {
        throw new Error('cspGuard cannot see violations with bypassCSP: true. Set cspGuard: { mode: "off" }.')
      }
      const violations = await attachCspGuard(context)
      await use(violations)
      await flush(context)
      await reportGuard(testInfo, cspGuard, violations, {
        annotation: 'csp-violation',
        attachment: 'csp-violations.json',
        format: formatCspViolation,
        key: violationKey,
        noun: 'CSP violation(s)',
      })
    },
    { auto: true },
  ],
}

export const cspTest = base.extend<CspFixtures>(cspFixtures)

/** One parsed policy: directive name (lower case) to its source list. */
export type CspPolicy = Map<string, string[]>

/**
 * Parses a Content-Security-Policy header value. Several policies, from repeated headers joined by
 * `,` or a newline, come back as one map each; the browser enforces all of them.
 */
export function parseCsp(header: string | undefined): CspPolicy[] {
  if (!header) return []
  return header
    .split(/[,\n]/)
    .map((policy) => {
      const directives: CspPolicy = new Map()
      for (const part of policy.split(';')) {
        const [name, ...sources] = part.trim().split(/\s+/)
        // The first occurrence of a directive wins; browsers ignore repeats.
        if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), sources)
      }
      return directives
    })
    .filter((policy) => policy.size > 0)
}
