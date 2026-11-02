import { type BrowserContext, test as base } from '@playwright/test'

import { flush, type GuardOptions, reportGuard } from './guard.js'

/** A request the browser made that answered 4xx/5xx or never got an answer. */
export interface FailedRequest {
  /** The network error, when there was no response. */
  failure?: string
  method: string
  resourceType: string
  /** The HTTP status, when there was a response. */
  status?: number
  url: string
}

export interface RequestGuardOptions extends GuardOptions<FailedRequest> {
  /**
   * Ignore requests the browser cancelled, typically because the page navigated away mid-load.
   * Default: true.
   */
  ignoreAborted?: boolean
}

export interface RequestTestOptions {
  requestGuard: RequestGuardOptions
}

export interface RequestFixtures extends RequestTestOptions {
  failedRequests: FailedRequest[]
}

// Chromium's and Firefox's error text for a request that was cancelled: by a navigation away mid-load,
// or by route.abort('aborted') in a test.
const aborted = /net::ERR_ABORTED|NS_BINDING_ABORTED|NS_ERROR_ABORT\b/

const guarded = new WeakMap<BrowserContext, FailedRequest[]>()

/**
 * Collects requests that answered 4xx/5xx or failed outright, from every page in `context`. The
 * `failedRequests` fixture does this for the test's own context. Requests made with the `request`
 * fixture (APIRequestContext) are not the browser's, and are not collected.
 */
export function attachRequestGuard(context: BrowserContext): FailedRequest[] {
  const existing = guarded.get(context)
  if (existing) return existing
  const failed: FailedRequest[] = []
  guarded.set(context, failed)
  context.on('response', (response) => {
    if (response.status() < 400) return
    const request = response.request()
    failed.push({
      method: request.method(),
      resourceType: request.resourceType(),
      status: response.status(),
      url: response.url(),
    })
  })
  context.on('requestfailed', (request) => {
    failed.push({
      failure: request.failure()?.errorText ?? 'unknown',
      method: request.method(),
      resourceType: request.resourceType(),
      url: request.url(),
    })
  })
  return failed
}

export function formatFailedRequest(request: FailedRequest): string {
  const outcome = request.status === undefined ? request.failure : String(request.status)
  return `${outcome} ${request.method} ${request.url} (${request.resourceType})`
}

/**
 * Fixtures that fail a test when the browser gets a 4xx/5xx or a network error for any request: a
 * missing image or font, a failing API call, even when the page still looks right.
 */
export const requestFixtures: Parameters<typeof base.extend<RequestFixtures>>[0] = {
  requestGuard: [{ allow: [], mode: 'fail' }, { option: true }],

  failedRequests: [
    async ({ context, requestGuard }, use, testInfo) => {
      if (requestGuard.mode === 'off') {
        await use([])
        return
      }
      const failed = attachRequestGuard(context)
      await use(failed)
      await flush(context)
      const ignoreAborted = requestGuard.ignoreAborted ?? true
      await reportGuard(
        testInfo,
        requestGuard,
        failed.filter((request) => !(ignoreAborted && request.failure && aborted.test(request.failure))),
        {
          annotation: 'failed-request',
          attachment: 'failed-requests.json',
          format: formatFailedRequest,
          key: (request) => [request.method, request.url, request.status, request.failure].join('|'),
          noun: 'failed request(s)',
        },
      )
    },
    { auto: true },
  ],
}

export const requestTest = base.extend<RequestFixtures>(requestFixtures)
