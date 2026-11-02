import { describe, expect, it } from 'vitest'

import { type CspViolation, formatCspViolation, parseCsp, unexpectedCspViolations } from './csp.js'

const violation = (overrides: Partial<CspViolation> = {}): CspViolation => ({
  blockedURI: 'inline',
  columnNumber: 5,
  disposition: 'enforce',
  documentURI: 'https://app.test/',
  effectiveDirective: 'script-src-elem',
  lineNumber: 12,
  originalPolicy: "script-src 'self'",
  sample: '',
  sourceFile: 'https://app.test/',
  violatedDirective: 'script-src-elem',
  ...overrides,
})

describe('parseCsp', () => {
  it('returns no policies for a missing header', () => {
    expect(parseCsp(undefined)).toEqual([])
    expect(parseCsp('')).toEqual([])
  })

  it('maps lower-cased directives to their sources', () => {
    const [policy] = parseCsp("default-src 'self'; Script-Src 'self' https://cdn.test ; img-src * data:;")
    expect(policy).toEqual(
      new Map([
        ['default-src', ["'self'"]],
        ['script-src', ["'self'", 'https://cdn.test']],
        ['img-src', ['*', 'data:']],
      ]),
    )
  })

  it('keeps the first of a repeated directive and value-less directives', () => {
    const [policy] = parseCsp("script-src 'self'; script-src *; upgrade-insecure-requests")
    expect(policy?.get('script-src')).toEqual(["'self'"])
    expect(policy?.get('upgrade-insecure-requests')).toEqual([])
  })

  it('splits repeated headers into separate policies', () => {
    expect(parseCsp("default-src 'self', frame-ancestors 'none'")).toHaveLength(2)
    expect(parseCsp("default-src 'self'\nframe-ancestors 'none'")).toHaveLength(2)
  })
})

describe('unexpectedCspViolations', () => {
  it('drops duplicates of the same violation', () => {
    expect(unexpectedCspViolations([violation(), violation(), violation({ lineNumber: 13 })])).toHaveLength(2)
  })

  it('keeps an enforced and a report-only violation of the same thing apart', () => {
    expect(unexpectedCspViolations([violation(), violation({ disposition: 'report' })])).toHaveLength(2)
  })

  it('drops allowed violations', () => {
    const fromCdn = violation({ blockedURI: 'https://cdn.test/x.js' })
    const allow = [(v: CspViolation) => v.blockedURI.startsWith('https://cdn.test/')]
    expect(unexpectedCspViolations([violation(), fromCdn], allow)).toEqual([violation()])
  })
})

describe('formatCspViolation', () => {
  it('says blocked for an enforced policy and would block for Report-Only', () => {
    expect(formatCspViolation(violation())).toBe(
      'script-src-elem blocked inline at https://app.test/:12:5 on https://app.test/',
    )
    expect(formatCspViolation(violation({ disposition: 'report', sample: 'alert(1)' }))).toBe(
      'script-src-elem would block inline at https://app.test/:12:5 on https://app.test/ sample="alert(1)"',
    )
  })

  it('handles a violation without a URI or source location', () => {
    expect(formatCspViolation(violation({ blockedURI: '', sourceFile: '' }))).toBe(
      'script-src-elem blocked (no URI) on https://app.test/',
    )
  })
})
