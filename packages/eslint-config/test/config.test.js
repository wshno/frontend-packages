import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

import config, { base, ignores, node, playwright, testingLibrary, vitest } from '../index.js'

/** Lints `code` as `filePath` with `overrideConfig`, without picking up any eslint.config.js on disk. */
async function lint(code, filePath, overrideConfig = config) {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig, cwd: import.meta.dirname })
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((message) => message.ruleId)
}

describe('default (React Router) config', () => {
  it('accepts a clean component', async () => {
    const code = `import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
`
    expect(await lint(code, 'app/components/Counter.tsx')).toEqual([])
  })

  it('applies the rules of hooks', async () => {
    const code = `import { useState } from 'react'

export function Broken({ show }: { show: boolean }) {
  if (show) {
    const [value] = useState(0)
    return <p>{value}</p>
  }
  return null
}
`
    expect(await lint(code, 'app/components/Broken.tsx')).toContain('@eslint-react/rules-of-hooks')
  })

  it('flags missing keys in lists', async () => {
    const code = `export function List({ items }: { items: string[] }) {
  return <ul>{items.map((item) => <li>{item}</li>)}</ul>
}
`
    expect(await lint(code, 'app/components/List.tsx')).toContain('@eslint-react/no-missing-key')
  })

  it('lets route modules export loaders next to the component', async () => {
    const code = `export function loader() {
  return { ok: true }
}

export default function Home() {
  return <main />
}
`
    expect(await lint(code, 'app/routes/home.tsx')).toEqual([])
    expect(await lint(code, 'app/components/Home.tsx')).toContain('react-refresh/only-export-components')
  })

  it('treats .cjs files as CommonJS in Node', async () => {
    expect(await lint(`module.exports = { dir: __dirname }
`, 'orval-transformer.cjs')).toEqual([])
  })

  it('allows unused names prefixed with _', async () => {
    expect(await lint('export function f(_unused: number) { return 1 }\n', 'app/f.ts')).toEqual([])
    expect(await lint('export function f(unused: number) { return 1 }\n', 'app/f.ts')).toContain(
      '@typescript-eslint/no-unused-vars',
    )
  })
})

describe('node config', () => {
  // In .ts files typescript-eslint turns no-undef off (the compiler checks it), so this lints .js.
  it('knows Node globals', async () => {
    const code = "export const port = process.env.PORT ?? '8080'\n"
    expect(await lint(code, 'scripts/port.js', [...ignores, ...base, ...node])).toEqual([])
    expect(await lint(code, 'scripts/port.js', [...ignores, ...base])).toContain('no-undef')
  })
})

describe('SonarJS in base', () => {
  it('flags if/else branches that do the same thing', async () => {
    const code = `export function f(a: boolean) {
  if (a) {
    return 1
  } else {
    return 1
  }
}
`
    expect(await lint(code, 'app/f.ts')).toContain('sonarjs/no-all-duplicated-branches')
  })

  it('leaves TODO comments alone', async () => {
    expect(
      await lint(
        `// TODO: later
export const x = 1
`,
        'app/x.ts',
      ),
    ).toEqual([])
  })
})

describe('vitest', () => {
  const testConfig = [...config, ...vitest()]

  it('flags a test without an assertion', async () => {
    const code = `import { it } from 'vitest'

it('does nothing', () => {
  const x = 1 + 1
  void x
})
`
    expect(await lint(code, 'app/x.test.ts', testConfig)).toContain('vitest/expect-expect')
  })

  it('only applies to test files', async () => {
    const code = `import { it } from 'vitest'

it('does nothing', () => {})
`
    expect(await lint(code, 'app/x.ts', testConfig)).not.toContain('vitest/expect-expect')
  })
})

describe('testingLibrary', () => {
  it('prefers screen queries', async () => {
    const code = `import { render } from '@testing-library/react'
import { expect, it } from 'vitest'

it('renders', () => {
  const { getByText } = render(<p>hi</p>)
  expect(getByText('hi')).toBeTruthy()
})
`
    const messages = await lint(code, 'app/x.test.tsx', [...config, ...testingLibrary()])
    expect(messages).toContain('testing-library/prefer-screen-queries')
  })
})

describe('playwright', () => {
  it('flags waitForTimeout and a missing await', async () => {
    const code = `import { expect, test } from '@playwright/test'

test('home', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(1000)
  expect(page.getByRole('heading')).toBeVisible()
})
`
    const messages = await lint(code, 'e2e/home.spec.ts', [...ignores, ...base, ...playwright()])
    expect(messages).toContain('playwright/no-wait-for-timeout')
    expect(messages).toContain('playwright/missing-playwright-await')
  })

  it('takes other folders', async () => {
    const code = `import { test } from '@playwright/test'

test.only('home', async () => {})
`
    const messages = await lint(code, 'specs/home.spec.ts', [...ignores, ...base, ...playwright(['specs/**/*.ts'])])
    expect(messages).toContain('playwright/no-focused-test')
  })
})
