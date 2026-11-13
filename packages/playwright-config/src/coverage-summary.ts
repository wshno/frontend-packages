/**
 * Unit + e2e line coverage: merges a unit-test coverage report with the Playwright run's browser
 * coverage (monocart-reporter, see coverage.ts) per file and line, and renders a Markdown table (Unit,
 * E2E, Combined) plus the files where e2e adds the most lines. The CLI is `wshno-coverage-summary`.
 *
 * Both sides may be lcov or Cobertura XML (jest, Vitest and monocart write both), detected from the
 * content. Paths are normalised to repo-relative `<root>/<sourceDir>/...` (see normaliseSourcePath),
 * so a unit report written relative to the app directory and an e2e report mapped through the
 * bundle's source maps name the same file the same way.
 *
 * The merge is approximate: istanbul counts statement lines, V8 (via monocart) counts every
 * executable source line, so the two sides don't agree on which lines exist. A line is covered in
 * Combined when either side covers it; a line only one side knows keeps that side's status.
 *
 * Dependency-free on purpose: CI runs it with plain node.
 */

/** Per file, per line: covered or not. */
export type FileCoverage = Map<string, Map<number, boolean>>

export interface SourceLayout {
  /**
   * The app directory, relative to the repo root, e.g. `app` or `frontend`. Several when the bundle
   * also holds workspace packages: `['apps/web', 'packages/*']`, where `*` stands for one directory.
   * A path relative to the app directory (`src/a.ts`) belongs to the first root.
   */
  root: string | string[]
  /** The source directories under each root, e.g. `['src', 'app']`. A path is recognised by one of them. */
  sourceDirs: string[]
  /**
   * Repo-relative paths to leave out (tested against `<root>/<sourceDir>/...`), e.g.
   * `/^frontend\/app\/routes\//` or generated code. The same in the unit and e2e reports, so every view
   * of the coverage counts the same files.
   */
  exclude?: RegExp
}

function cleanRoot(root: string): string {
  let out = root.replaceAll('\\', '/').replace(/^\.?\/+/, '')
  while (out.endsWith('/')) out = out.slice(0, -1)
  return out
}

/** The layout's roots, cleaned: forward slashes, no leading `./` or trailing `/`. */
export function layoutRoots(layout: SourceLayout): string[] {
  return (Array.isArray(layout.root) ? layout.root : [layout.root]).map(cleanRoot).filter(Boolean)
}

const escapeRe = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
/** A root as a regex source; `*` matches one path segment. */
const rootPattern = (root: string) => root.split('*').map(escapeRe).join('[^/]+')

/** Whether a repo-relative path is in one of the layout's `<root>/<sourceDir>/` directories. */
export function underRoot(path: string, layout: SourceLayout): boolean {
  const dirs = layout.sourceDirs.map(escapeRe).join('|')
  return layoutRoots(layout).some((root) => new RegExp(`^${rootPattern(root)}/(?:${dirs})/`).test(path))
}

export interface Totals {
  covered: number
  total: number
  pct: number
}

/**
 * A coverage path from any tool as repo-relative `<root>/<sourceDir>/...`:
 *
 * - already repo-relative (`app/src/a.ts`): kept;
 * - absolute or prefixed (`/home/runner/work/x/x/app/src/a.ts`, `C:\r\x\app\src\a.ts`): cut at the
 *   first `<root>/<sourceDir>/`;
 * - relative to the app directory (`src/a.ts`, `/src/a.ts` from Metro): prefixed with the first root.
 *
 * With several roots (workspace packages), the earliest `<root>/<sourceDir>/` in the path wins, so
 * `../../packages/shared/src/a.ts` becomes `packages/shared/src/a.ts`. Anything else
 * (`node_modules/...`) comes back as-is, with forward slashes.
 */
export function normaliseSourcePath(raw: string, layout: SourceLayout): string {
  const roots = layoutRoots(layout)
  const dirs = layout.sourceDirs.map(escapeRe).join('|')
  const prefix = `(?:${roots.map(rootPattern).join('|')})/(?:${dirs})/`
  let path = raw.trim().replaceAll('\\', '/')
  if (path.startsWith('./')) path = path.slice(2)
  if (new RegExp(`^${prefix}`).test(path)) return path
  // The first <root>/<sourceDir>/ that starts a path segment.
  const inside = new RegExp(`^.*?/(${prefix}.*)$`).exec(path)
  if (inside?.[1]) return inside[1]
  path = path.replace(/^\/+/, '')
  const first = roots.find((root) => !root.includes('*'))
  if (first && layout.sourceDirs.some((dir) => path.startsWith(`${dir}/`))) return `${first}/${path}`
  return path
}

function addLine(files: FileCoverage, file: string, line: number, hit: boolean): void {
  if (!Number.isInteger(line)) return
  let lines = files.get(file)
  if (!lines) {
    lines = new Map()
    files.set(file, lines)
  }
  lines.set(line, (lines.get(line) ?? false) || hit)
}

/** lcov text. Records of the same file (repeated SF blocks) merge, a line covered if any record hit it. */
export function parseLcov(text: string, layout: SourceLayout): FileCoverage {
  const files: FileCoverage = new Map()
  let file: string | null = null
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith('SF:')) {
      file = normaliseSourcePath(raw.slice(3), layout)
      if (!files.has(file)) files.set(file, new Map())
    } else if (raw.startsWith('DA:') && file) {
      const [line, hits] = raw.slice(3).split(',')
      addLine(files, file, Number(line), Number(hits) > 0)
    } else if (raw === 'end_of_record') {
      file = null
    }
  }
  return files
}

/**
 * Cobertura XML. A class's `filename` is relative to one of the `<source>` roots; the first source
 * joined with the filename is normalised like an lcov path (normaliseSourcePath cuts it at the app).
 */
export function parseCobertura(xml: string, layout: SourceLayout): FileCoverage {
  const files: FileCoverage = new Map()
  const source = /<source>([^<]*)<\/source>/.exec(xml)?.[1]?.trim() ?? ''
  const classRe = /<class\b[^>]*\bfilename="([^"]*)"[^>]*>([\s\S]*?)<\/class>/g
  for (const [, filename = '', body = ''] of xml.matchAll(classRe)) {
    const joined = source && !/^([a-zA-Z]:)?[\\/]/.test(filename) ? `${source}/${filename}` : filename
    const file = normaliseSourcePath(joined, layout)
    if (!files.has(file)) files.set(file, new Map())
    for (const [, number, hits] of body.matchAll(/<line\b[^>]*\bnumber="(\d+)"[^>]*\bhits="(\d+)"/g)) {
      addLine(files, file, Number(number), Number(hits) > 0)
    }
  }
  return files
}

/** lcov or Cobertura, from the content. */
export function parseCoverage(text: string, layout: SourceLayout): FileCoverage {
  return /^\s*(<\?xml|<coverage\b|<!DOCTYPE coverage)/.test(text)
    ? parseCobertura(text, layout)
    : parseLcov(text, layout)
}

/** Whether a normalised path counts: in a `<root>/<sourceDir>/`, and not excluded by the layout. */
export function inLayout(path: string, layout: SourceLayout): boolean {
  return underRoot(path, layout) && !layout.exclude?.test(path)
}

/** Keeps the files the layout counts (see inLayout) that don't match `exclude` either. */
export function filterFiles(files: FileCoverage, layout: SourceLayout, exclude: RegExp | null = null): FileCoverage {
  const out: FileCoverage = new Map()
  for (const [file, lines] of files) {
    if (!inLayout(file, layout)) continue
    if (exclude?.test(file)) continue
    out.set(file, lines)
  }
  return out
}

/** Per file: the union of lines, covered when either side covers the line. */
export function mergeCoverage(unit: FileCoverage, e2e: FileCoverage): FileCoverage {
  const merged: FileCoverage = new Map()
  for (const file of new Set([...unit.keys(), ...e2e.keys()])) {
    const a = unit.get(file) ?? new Map<number, boolean>()
    const b = e2e.get(file) ?? new Map<number, boolean>()
    const lines = new Map<number, boolean>()
    for (const line of new Set([...a.keys(), ...b.keys()])) {
      lines.set(line, a.get(line) === true || b.get(line) === true)
    }
    merged.set(file, lines)
  }
  return merged
}

export function totals(files: FileCoverage): Totals {
  let covered = 0
  let total = 0
  for (const lines of files.values()) {
    for (const hit of lines.values()) {
      total += 1
      if (hit) covered += 1
    }
  }
  return { covered, total, pct: total === 0 ? 0 : (covered / total) * 100 }
}

/** Files ranked by the lines e2e covers that unit doesn't (unit-uncovered or unknown to unit). */
export function e2eGains(unit: FileCoverage, e2e: FileCoverage, top = 10): { file: string; added: number }[] {
  const gains: { file: string; added: number }[] = []
  for (const [file, lines] of e2e) {
    const u = unit.get(file)
    let added = 0
    for (const [line, hit] of lines) if (hit && u?.get(line) !== true) added += 1
    if (added > 0) gains.push({ file, added })
  }
  gains.sort((x, y) => y.added - x.added || x.file.localeCompare(y.file))
  return gains.slice(0, top)
}

export interface RenderOptions {
  /** Filtered unit coverage, or null when that report is missing. */
  unit: FileCoverage | null
  /** Filtered e2e coverage, or null when that report is missing. */
  e2e: FileCoverage | null
  /** How many files the "where e2e adds the most" table lists. */
  top?: number
  /** The unit row's label, e.g. `Unit (jest)`. */
  unitLabel?: string
}

const pct = (t: Totals) => `${t.pct.toFixed(1)}%`
const row = (name: string, t: Totals | null) =>
  t ? `| ${name} | ${t.covered} / ${t.total} | ${pct(t)} |` : `| ${name} | n/a | n/a |`

/** The Markdown summary: a job summary or a PR comment. */
export function renderMarkdown({ unit, e2e, top = 10, unitLabel = 'Unit' }: RenderOptions): string {
  const u = unit ? totals(unit) : null
  const e = e2e ? totals(e2e) : null
  const merged = mergeCoverage(unit ?? new Map(), e2e ?? new Map())
  const out = [
    '### Coverage: unit + e2e (lines)',
    '',
    '| Suite | Lines covered | % |',
    '| --- | ---: | ---: |',
    row(unitLabel, u),
    row('E2E (Playwright)', e),
    row('**Combined**', totals(merged)),
    '',
    '_Approximate: istanbul counts statement lines, the e2e side counts V8 lines through the web',
    "bundle's source maps. Combined takes, per file and line, covered if either side covers it; a line",
    "only one side knows keeps that side's status._",
  ]
  if (unit && e2e) {
    const gains = e2eGains(unit, e2e, top)
    if (gains.length > 0) {
      out.push('', '<details><summary>Where e2e adds the most</summary>', '')
      out.push('| File | Lines added by e2e | Unit | Combined |', '| --- | ---: | ---: | ---: |')
      for (const { file, added } of gains) {
        const before = totals(new Map([[file, unit.get(file) ?? new Map<number, boolean>()]]))
        const after = totals(new Map([[file, merged.get(file) ?? new Map<number, boolean>()]]))
        out.push(`| \`${file}\` | ${added} | ${before.total ? pct(before) : 'n/a'} | ${pct(after)} |`)
      }
      out.push('', '</details>')
    }
  }
  return `${out.join('\n')}\n`
}
