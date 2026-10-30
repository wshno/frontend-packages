import { afterEach, describe, expect, it, vi } from 'vitest'

async function load(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return import('./index.js')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('definePlaywrightConfig', () => {
  it('uses the CI reporters, retries and forbidOnly on CI', async () => {
    const { ciReporters, definePlaywrightConfig } = await load({ CI: 'true' })
    const config = definePlaywrightConfig()
    expect(config.reporter).toEqual(ciReporters)
    expect(config.retries).toBe(2)
    expect(config.forbidOnly).toBe(true)
  })

  it('uses the local reporters and no retries off CI', async () => {
    const { definePlaywrightConfig, localReporters } = await load({ CI: '' })
    const config = definePlaywrightConfig()
    expect(config.reporter).toEqual(localReporters)
    expect(config.retries).toBe(0)
    expect(config.forbidOnly).toBe(false)
  })

  it('writes the json report where playwright-e2e.yml reads it, after html', async () => {
    const { ciReporters } = await load({ CI: 'true' })
    const names = ciReporters.map(([name]) => name)
    expect(names.indexOf('html')).toBeLessThan(names.indexOf('json'))
    expect(ciReporters.find(([name]) => name === 'json')?.[1]).toEqual({
      outputFile: 'playwright-report/results.json',
    })
  })

  it('takes baseURL from BASE_URL', async () => {
    const { definePlaywrightConfig } = await load({ BASE_URL: 'http://localhost:8080' })
    expect(definePlaywrightConfig().use?.baseURL).toBe('http://localhost:8080')
  })

  it('replaces top-level keys and merges use', async () => {
    const { definePlaywrightConfig } = await load({ CI: 'true' })
    const config = definePlaywrightConfig({
      retries: 0,
      testDir: './e2e',
      use: { trace: 'retain-on-failure' },
      workers: 1,
    })
    expect(config.retries).toBe(0)
    expect(config.testDir).toBe('./e2e')
    expect(config.workers).toBe(1)
    expect(config.use).toMatchObject({ screenshot: 'only-on-failure', trace: 'retain-on-failure' })
  })
})
