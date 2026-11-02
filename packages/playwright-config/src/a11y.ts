import AxeBuilder from '@axe-core/playwright'
import { type Page, test } from '@playwright/test'

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>
type Violation = AxeResults['violations'][number]
export type AxeImpact = NonNullable<Violation['impact']>

export interface AccessibleOptions {
  /** Rule ids to skip, e.g. `color-contrast` while a design fix is pending. */
  disableRules?: string[]
  /** CSS selectors to leave out, e.g. a third-party widget. */
  exclude?: string[]
  /** Which impacts fail. Default: serious and critical. */
  impacts?: AxeImpact[]
  /** CSS selectors to limit the scan to. Default: the whole page. */
  include?: string[]
  /** axe rule tags to run. Default: WCAG 2.0, 2.1 and 2.2 A and AA. */
  tags?: string[]
}

export const defaultAxeTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export function formatAxeViolation(violation: Violation): string {
  const targets = violation.nodes.slice(0, 3).map((node) => node.target.join(' '))
  const more = violation.nodes.length > 3 ? ` and ${violation.nodes.length - 3} more` : ''
  return `${violation.impact ?? 'unknown'} ${violation.id}: ${violation.help} at ${targets.join(', ')}${more} (${violation.helpUrl})`
}

/**
 * Runs axe on the page as it is now and fails on violations of the given impacts. The full axe result
 * is attached to the test. Call it after the page has rendered what you want checked: a dialog that is
 * not open is not scanned.
 */
export async function expectAccessible(page: Page, options: AccessibleOptions = {}): Promise<void> {
  await test.step('axe accessibility scan', async () => {
    let builder = new AxeBuilder({ page }).withTags(options.tags ?? defaultAxeTags)
    for (const selector of options.include ?? []) builder = builder.include(selector)
    for (const selector of options.exclude ?? []) builder = builder.exclude(selector)
    if (options.disableRules?.length) builder = builder.disableRules(options.disableRules)
    const results = await builder.analyze()

    const impacts = options.impacts ?? ['serious', 'critical']
    const failing = results.violations.filter((violation) => violation.impact && impacts.includes(violation.impact))
    await test.info().attach('axe-results.json', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    })
    if (failing.length > 0) {
      throw new Error(
        `${failing.length} accessibility violation(s) on ${page.url()}:\n  ${failing.map(formatAxeViolation).join('\n  ')}`,
      )
    }
  })
}
