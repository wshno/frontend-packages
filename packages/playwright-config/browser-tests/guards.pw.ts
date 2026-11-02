import { test as base, expect, type Page } from '@playwright/test'

import { expectAccessible } from '../src/a11y.js'
import { attachConsoleGuard, consoleTest } from '../src/console.js'
import { guardsTest } from '../src/guards.js'
import { requestTest } from '../src/requests.js'

// The pages are served by page.route from a made-up origin, so the suite needs no server.
const origin = 'http://guards.test'

async function serve(page: Page, body: string, path = '/', status = 200, headers: Record<string, string> = {}) {
  await page.route(`${origin}${path}`, (route) =>
    route.fulfill({
      body,
      headers: { 'content-type': path.endsWith('.png') ? 'image/png' : 'text/html', ...headers },
      status,
    }),
  )
}

const clean = '<!doctype html><html lang="en"><title>ok</title><main><h1>Fine</h1></main></html>'
const imageWithoutAlt = '<!doctype html><html lang="en"><title>t</title><main><img src="data:,"></main></html>'

consoleTest.describe('consoleGuard in warn mode', () => {
  consoleTest.use({ consoleGuard: { mode: 'warn' } })

  consoleTest('collects errors, warnings, exceptions and rejections', async ({ consoleEntries, page }) => {
    await serve(
      page,
      `<!doctype html><script>
        console.error('bad'); console.warn('careful'); console.log('fine'); console.info('fine too')
        setTimeout(() => { throw new Error('boom') }, 0)
        Promise.reject(new Error('nope'))
      </script>`,
    )
    await page.goto(origin)
    await expect
      .poll(() => consoleEntries.map((e) => `${e.type}: ${e.text.split('\n')[0]}`).sort())
      .toEqual(['error: bad', 'pageerror: Error: boom', 'pageerror: Error: nope', 'warning: careful'])
  })

  consoleTest('leaves CSP violations and failed loads to the other guards', async ({ consoleEntries, page }) => {
    await serve(page, '<!doctype html><script>1</script><img src="/missing.png">', '/', 200, {
      'content-security-policy': "script-src 'none'",
    })
    await serve(page, '', '/missing.png', 404)
    await page.goto(origin)
    await page.waitForTimeout(300)
    expect(consoleEntries).toEqual([])
  })

  consoleTest('attachConsoleGuard covers a context the test opens itself', async ({ browser }) => {
    const context = await browser.newContext()
    const entries = attachConsoleGuard(context)
    const page = await context.newPage()
    await serve(page, "<!doctype html><script>console.error('own context')</script>")
    await page.goto(origin)
    await expect.poll(() => entries.map((e) => e.text)).toEqual(['own context'])
    expect(attachConsoleGuard(context)).toBe(entries)
    await context.close()
  })
})

consoleTest.describe('consoleGuard in fail mode', () => {
  // The guard throws in teardown, after these assertions have passed.
  consoleTest('fails the test on a console error', async ({ page }) => {
    consoleTest.fail()
    await serve(page, "<!doctype html><script>console.error('bad')</script><p>still renders</p>")
    await page.goto(origin)
    await expect(page.getByText('still renders')).toBeVisible()
  })

  consoleTest.describe('with types limited to errors', () => {
    consoleTest.use({ consoleGuard: { types: ['error', 'pageerror'] } })

    consoleTest('passes on a warning', async ({ page }) => {
      await serve(page, "<!doctype html><script>console.warn('careful')</script><p>ok</p>")
      await page.goto(origin)
      await expect(page.getByText('ok')).toBeVisible()
    })
  })

  consoleTest.describe('with an allow rule', () => {
    consoleTest.use({ consoleGuard: { allow: [(e) => e.text === 'known noise'] } })

    consoleTest('passes when every entry is allowed', async ({ page }) => {
      await serve(page, "<!doctype html><script>console.error('known noise')</script><p>ok</p>")
      await page.goto(origin)
      await expect(page.getByText('ok')).toBeVisible()
    })
  })
})

requestTest.describe('requestGuard in warn mode', () => {
  requestTest.use({ requestGuard: { mode: 'warn' } })

  requestTest('collects 4xx/5xx responses and network errors', async ({ failedRequests, page }) => {
    await serve(page, '<!doctype html><img src="/missing.png"><script>fetch("/api").catch(() => {})</script>')
    await serve(page, '', '/missing.png', 404)
    await page.route(`${origin}/api`, (route) => route.abort('failed'))
    await page.goto(origin)
    await expect
      .poll(() => failedRequests.map((r) => `${r.status ?? 'error'} ${new URL(r.url).pathname}`).sort())
      .toEqual(['404 /missing.png', 'error /api'])
  })

  requestTest('collects nothing from a page whose requests all succeed', async ({ failedRequests, page }) => {
    await serve(page, clean)
    await page.goto(origin)
    expect(failedRequests).toEqual([])
  })
})

requestTest.describe('requestGuard in fail mode', () => {
  requestTest('fails the test on a missing image', async ({ page }) => {
    requestTest.fail()
    await serve(page, '<!doctype html><img src="/missing.png"><p>still renders</p>')
    await serve(page, '', '/missing.png', 404)
    await page.goto(origin)
    await expect(page.getByText('still renders')).toBeVisible()
  })

  requestTest('ignores requests the browser cancelled', async ({ page }) => {
    await serve(page, '<!doctype html><p>ok</p>')
    await page.route(`${origin}/slow`, (route) => route.abort('aborted'))
    await page.goto(origin)
    await page.evaluate(() => fetch('/slow').catch(() => undefined))
    await expect(page.getByText('ok')).toBeVisible()
  })

  requestTest.describe('with an allow rule', () => {
    requestTest.use({ requestGuard: { allow: [(r) => r.status === 404] } })

    requestTest('passes when every failed request is allowed', async ({ page }) => {
      await serve(page, '<!doctype html><img src="/missing.png"><p>ok</p>')
      await serve(page, '', '/missing.png', 404)
      await page.goto(origin)
      await expect(page.getByText('ok')).toBeVisible()
    })
  })
})

guardsTest.describe('guardsTest', () => {
  guardsTest('passes on a clean page with all three guards on', async ({ page }) => {
    await serve(page, clean)
    await page.goto(origin)
    await expect(page.getByRole('heading', { name: 'Fine' })).toBeVisible()
  })

  guardsTest.describe('in warn mode', () => {
    guardsTest.use({ consoleGuard: { mode: 'warn' }, cspGuard: { mode: 'warn' }, requestGuard: { mode: 'warn' } })

    guardsTest(
      'reports a CSP violation once, from the CSP guard',
      async ({ consoleEntries, cspViolations, failedRequests, page }) => {
        await serve(page, '<!doctype html><script>1</script><p>ok</p>', '/', 200, {
          'content-security-policy': "script-src 'none'",
        })
        await page.goto(origin)
        await expect.poll(() => cspViolations.length).toBe(1)
        await page.waitForTimeout(300)
        expect(consoleEntries).toEqual([])
        expect(failedRequests).toEqual([])
      },
    )
  })
})

base.describe('expectAccessible', () => {
  base('passes on an accessible page', async ({ page }) => {
    await serve(page, clean)
    await page.goto(origin)
    await expectAccessible(page)
  })

  base('fails on a serious or critical violation', async ({ page }) => {
    await serve(page, imageWithoutAlt)
    await page.goto(origin)
    await expect(expectAccessible(page)).rejects.toThrow(/critical image-alt/)
  })

  base('skips excluded parts and disabled rules', async ({ page }) => {
    await serve(
      page,
      '<!doctype html><html lang="en"><title>t</title><main><div id="widget"><img src="data:,"></div></main></html>',
    )
    await page.goto(origin)
    await expectAccessible(page, { exclude: ['#widget'] })
    await expectAccessible(page, { disableRules: ['image-alt'] })
  })

  base('does not fail on impacts outside the list', async ({ page }) => {
    await serve(page, imageWithoutAlt)
    await page.goto(origin)
    await expectAccessible(page, { impacts: ['serious'] })
  })
})
