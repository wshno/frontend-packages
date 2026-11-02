import { expect, type Page } from '@playwright/test'

import { attachCspGuard, cspTest as test } from '../src/csp.js'

// The pages are served by page.route from a made-up origin, so the suite needs no server.
const origin = 'http://csp.test'

async function serve(page: Page, headers: Record<string, string>, body: string, path = '/') {
  await page.route(`${origin}${path}`, (route) =>
    route.fulfill({ body, headers: { 'content-type': 'text/html', ...headers } }),
  )
}

const inlineScript = '<!doctype html><script>document.title = "ran"</script><p>hi</p>'

test.describe('cspGuard in warn mode', () => {
  test.use({ cspGuard: { mode: 'warn' } })

  test('collects an enforced violation, and the script is blocked', async ({ cspViolations, page }) => {
    await serve(page, { 'content-security-policy': "script-src 'self'" }, inlineScript)
    await page.goto(origin)
    await expect.poll(() => cspViolations.length).toBe(1)
    expect(cspViolations[0]).toMatchObject({ blockedURI: 'inline', disposition: 'enforce' })
    expect(await page.title()).toBe('')
  })

  test('collects a Report-Only violation, and the script still runs', async ({ cspViolations, page }) => {
    await serve(page, { 'content-security-policy-report-only': "script-src 'self'" }, inlineScript)
    await page.goto(origin)
    await expect.poll(() => cspViolations.length).toBe(1)
    expect(cspViolations[0]).toMatchObject({ disposition: 'report' })
    expect(await page.title()).toBe('ran')
  })

  test('collects violations from a frame', async ({ cspViolations, page }) => {
    await serve(page, {}, `<!doctype html><iframe src="${origin}/frame"></iframe>`)
    await serve(page, { 'content-security-policy': "img-src 'none'" }, '<img src="/x.png">', '/frame')
    await page.goto(origin)
    await expect.poll(() => cspViolations.map((v) => v.effectiveDirective)).toEqual(['img-src'])
  })

  test('collects nothing from a page that keeps to its policy', async ({ cspViolations, page }) => {
    await serve(page, { 'content-security-policy': "default-src 'self'" }, '<!doctype html><p>hi</p>')
    await page.goto(origin)
    expect(cspViolations).toEqual([])
  })

  test('attachCspGuard covers a context the test opens itself', async ({ browser }) => {
    const context = await browser.newContext()
    const violations = await attachCspGuard(context)
    const page = await context.newPage()
    await serve(page, { 'content-security-policy': "script-src 'self'" }, inlineScript)
    await page.goto(origin)
    await expect.poll(() => violations.length).toBe(1)
    expect(await attachCspGuard(context)).toBe(violations)
    await context.close()
  })
})

test.describe('cspGuard in fail mode', () => {
  // The guard throws in teardown, after these assertions have passed.
  test('fails the test on a violation', async ({ page }) => {
    test.fail()
    await serve(page, { 'content-security-policy': "script-src 'self'" }, inlineScript)
    await page.goto(origin)
    expect(await page.title()).toBe('')
  })

  test('fails the test on a Report-Only violation', async ({ page }) => {
    test.fail()
    await serve(page, { 'content-security-policy-report-only': "script-src 'self'" }, inlineScript)
    await page.goto(origin)
    expect(await page.title()).toBe('ran')
  })

  test.describe('with an allow rule', () => {
    test.use({ cspGuard: { allow: [(v) => v.blockedURI === 'inline'] } })

    test('passes when every violation is allowed', async ({ page }) => {
      await serve(page, { 'content-security-policy': "script-src 'self'" }, inlineScript)
      await page.goto(origin)
      expect(await page.title()).toBe('')
    })
  })

  test.describe('with bypassCSP', () => {
    test.use({ bypassCSP: true })

    // Declared as failing up front: the fixture throws during setup, before the test body runs.
    test.fail('refuses to run, because it would see nothing', async ({ page }) => {
      await page.goto('about:blank')
    })
  })
})

test.describe('cspGuard off', () => {
  test.use({ bypassCSP: true, cspGuard: { mode: 'off' } })

  test('ignores violations and allows bypassCSP', async ({ cspViolations, page }) => {
    await serve(page, { 'content-security-policy': "script-src 'self'" }, inlineScript)
    await page.goto(origin)
    expect(cspViolations).toEqual([])
  })
})
