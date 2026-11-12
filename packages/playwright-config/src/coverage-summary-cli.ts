#!/usr/bin/env node
/**
 * wshno-coverage-summary: prints the unit + e2e coverage summary (coverage-summary.ts) as Markdown.
 *
 *   wshno-coverage-summary --unit app/coverage/lcov.info --e2e e2e/monocart-coverage/lcov.info \
 *     --root app --source-dirs src,app [--exclude '^app/src/mock/'] [--top 10] [--unit-label 'Unit (jest)']
 *
 * Either report may be lcov or Cobertura XML, and either may be missing (its row says n/a); with
 * neither it exits 1.
 */
import fs from 'node:fs'

import { filterFiles, parseCoverage, renderMarkdown, type SourceLayout } from './coverage-summary.js'

interface Args {
  unit?: string
  e2e?: string
  root: string
  sourceDirs: string[]
  exclude?: string
  top: number
  unitLabel: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = { root: 'app', sourceDirs: ['src', 'app'], top: 10, unitLabel: 'Unit' }
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    const value = argv[i + 1]
    if (value === undefined) throw new Error(`${key} needs a value`)
    if (key === '--unit') args.unit = value
    else if (key === '--e2e') args.e2e = value
    else if (key === '--root') args.root = value
    else if (key === '--source-dirs')
      args.sourceDirs = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    else if (key === '--exclude') args.exclude = value
    else if (key === '--top') args.top = Number(value)
    else if (key === '--unit-label') args.unitLabel = value
    else throw new Error(`Unknown argument: ${key}`)
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const layout: SourceLayout = { root: args.root, sourceDirs: args.sourceDirs }
const exclude = args.exclude ? new RegExp(args.exclude) : null
const read = (path?: string) =>
  path && fs.existsSync(path)
    ? filterFiles(parseCoverage(fs.readFileSync(path, 'utf8'), layout), layout, exclude)
    : null

const unit = read(args.unit)
const e2e = read(args.e2e)
if (!unit && !e2e) {
  console.error(`No coverage report found (--unit ${args.unit ?? '-'}, --e2e ${args.e2e ?? '-'})`)
  process.exit(1)
}
process.stdout.write(renderMarkdown({ unit, e2e, top: args.top, unitLabel: args.unitLabel }))
