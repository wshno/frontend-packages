import { describe, expect, it } from 'vitest'

import { formatConsoleEntry, isOwnedByOtherGuard } from './console.js'
import { unexpected } from './guard.js'
import { formatFailedRequest } from './requests.js'

describe('isOwnedByOtherGuard', () => {
  it.each([
    // Chromium
    "Executing inline script violates the following Content Security Policy directive 'script-src 'none''.",
    'Failed to load resource: the server responded with a status of 404 (Not Found)',
    'Failed to load resource: net::ERR_FAILED',
    // Firefox
    '[JavaScript Error: "Content-Security-Policy: The page’s settings blocked an inline script (script-src-elem)"]',
    '[JavaScript Warning: "Loading failed for the <script> with source “http://x.test/a.js”."]',
  ])('leaves %s to the CSP or request guard', (text) => {
    expect(isOwnedByOtherGuard(text)).toBe(true)
  })

  it('keeps the app’s own messages', () => {
    expect(isOwnedByOtherGuard('TypeError: x is undefined')).toBe(false)
    expect(isOwnedByOtherGuard('Failed to load the user profile')).toBe(false)
  })
})

describe('formatConsoleEntry', () => {
  it('shows the first line of a stack and the location', () => {
    expect(
      formatConsoleEntry({ location: 'http://x.test/', text: 'Error: boom\n    at f (a.js:1:2)', type: 'pageerror' }),
    ).toBe('pageerror: Error: boom (http://x.test/)')
    expect(formatConsoleEntry({ location: '', text: 'careful', type: 'warning' })).toBe('warning: careful')
  })
})

describe('formatFailedRequest', () => {
  it('shows the status, or the network error when there was no response', () => {
    expect(formatFailedRequest({ method: 'GET', resourceType: 'image', status: 404, url: 'http://x.test/a.png' })).toBe(
      '404 GET http://x.test/a.png (image)',
    )
    expect(
      formatFailedRequest({
        failure: 'net::ERR_FAILED',
        method: 'POST',
        resourceType: 'fetch',
        url: 'http://x.test/api',
      }),
    ).toBe('net::ERR_FAILED POST http://x.test/api (fetch)')
  })
})

describe('unexpected', () => {
  it('drops duplicates and allowed items', () => {
    const items = ['a', 'b', 'a', 'c']
    expect(unexpected(items, (x) => x, [(x) => x === 'c'])).toEqual(['a', 'b'])
  })
})
