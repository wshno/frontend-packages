import { mergeTests } from '@playwright/test'

import { consoleTest } from './console.js'
import { cspTest } from './csp.js'
import { requestTest } from './requests.js'

/** All three guards: CSP violations, console errors and warnings, and failed requests. */
export const guardsTest = mergeTests(cspTest, consoleTest, requestTest)
