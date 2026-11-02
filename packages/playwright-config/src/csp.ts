import { type BrowserContext, test as base, type TestInfo } from '@playwright/test'

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

export interface CspGuardOptions {
  /** Violations to accept, for example from a third-party script the app does not control. */
  allow?: ((violation: CspViolation) => boolean)[]
  /** `fail` fails the test on a violation, `warn` only annotates it, `off` does not listen. */
  mode?: 'fail' | 'off' | 'warn'
}

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
  const seen = new Set<string>()
  return violations.filter((v) => {
    const key = violationKey(v)
    if (seen.has(key) || allow.some((accept) => accept(v))) return false
    seen.add(key)
    return true
  })
}

// Violation events are queued tasks, so one from the test's last action may not have reached the binding
// yet. A round trip through each open page lets them through; pages that are closing are skipped.
async function flush(context: BrowserContext) {
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

async function report(testInfo: TestInfo, options: CspGuardOptions, violations: CspViolation[]) {
  const unexpected = unexpectedCspViolations(violations, options.allow)
  if (unexpected.length === 0) return
  await testInfo.attach('csp-violations.json', {
    body: JSON.stringify(unexpected, null, 2),
    contentType: 'application/json',
  })
  const lines = unexpected.map(formatCspViolation)
  if (options.mode === 'warn') {
    for (const line of lines) testInfo.annotations.push({ description: line, type: 'csp-violation' })
    return
  }
  throw new Error(`${unexpected.length} CSP violation(s):\n  ${lines.join('\n  ')}`)
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
      await report(testInfo, { allow: [], mode: 'fail', ...cspGuard }, violations)
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
