#!/usr/bin/env node
/**
 * wshno-coverage-summary: prints the unit + e2e coverage summary (coverage-summary.ts) as Markdown.
 * See USAGE below; either report may be lcov or Cobertura XML, and either may be missing (its row says
 * n/a); with neither it exits 1.
 */
import fs from 'node:fs'

import { filterFiles, parseCoverage, renderMarkdown, type SourceLayout } from './coverage-summary.js'

const USAGE = `Usage: wshno-coverage-summary [--unit <report>] [--e2e <report>] [options]

Prints unit, e2e and combined line coverage (and the files where e2e adds the most) as Markdown.
Reports are lcov or Cobertura XML.

  --unit <path>          the unit tests' coverage report
  --e2e <path>           the e2e run's coverage report (monocart-coverage/lcov.info)
  --root <dir>           the app directory in the repo (default: app). Repeat it, or give a
                         comma-separated list, for workspace packages: --root apps/web,packages/*
                         (* is one directory; app-relative paths belong to the first root)
  --source-dirs <list>   source directories under each root, comma-separated (default: src,app)
  --exclude <regex>      repo-relative paths to leave out; repeat to add more
  --top <n>              rows in the "where e2e adds the most" table (default: 10)
  --unit-label <text>    the unit row's label (default: Unit)
  -h, --help             this text

  wshno-coverage-summary --unit app/coverage/lcov.info --e2e e2e/monocart-coverage/lcov.info \\
    --root app --source-dirs src,app --exclude '^app/src/mock/' --unit-label 'Unit (jest)'
`

interface Args {
  unit?: string
  e2e?: string
  roots: string[]
  sourceDirs: string[]
  excludes: string[]
  top: number
  unitLabel: string
}

const list = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

function parseArgs(argv: string[]): Args | 'help' {
  const args: Args = { roots: [], sourceDirs: ['src', 'app'], excludes: [], top: 10, unitLabel: 'Unit' }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (key === '-h' || key === '--help') return 'help'
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${key} needs a value`)
    i += 1
    if (key === '--unit') args.unit = value
    else if (key === '--e2e') args.e2e = value
    else if (key === '--root') args.roots.push(...list(value))
    else if (key === '--source-dirs') args.sourceDirs = list(value)
    else if (key === '--exclude') args.excludes.push(value)
    else if (key === '--top') args.top = Number(value)
    else if (key === '--unit-label') args.unitLabel = value
    else throw new Error(`Unknown argument: ${key}`)
  }
  if (args.roots.length === 0) args.roots = ['app']
  return args
}

let args: Args | 'help'
try {
  args = parseArgs(process.argv.slice(2))
} catch (error) {
  console.error(`${(error as Error).message}\n\n${USAGE}`)
  process.exit(2)
}
if (args === 'help') {
  process.stdout.write(USAGE)
  process.exit(0)
}

const layout: SourceLayout = {
  root: args.roots,
  sourceDirs: args.sourceDirs,
  ...(args.excludes.length > 0 && { exclude: new RegExp(args.excludes.map((e) => `(?:${e})`).join('|')) }),
}
const read = (path?: string) =>
  path && fs.existsSync(path) ? filterFiles(parseCoverage(fs.readFileSync(path, 'utf8'), layout), layout) : null

const unit = read(args.unit)
const e2e = read(args.e2e)
if (!unit && !e2e) {
  console.error(`No coverage report found (--unit ${args.unit ?? '-'}, --e2e ${args.e2e ?? '-'})`)
  process.exit(1)
}
process.stdout.write(renderMarkdown({ unit, e2e, top: args.top, unitLabel: args.unitLabel }))
