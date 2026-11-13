import { describe, expect, it } from 'vitest'

import {
  e2eGains,
  filterFiles,
  inLayout,
  mergeCoverage,
  normaliseSourcePath,
  parseCobertura,
  parseCoverage,
  parseLcov,
  renderMarkdown,
  type SourceLayout,
  totals,
} from './coverage-summary.js'

// skylens: an Expo app in app/, sources in app/src and the expo-router app/app.
const expo: SourceLayout = { root: 'app', sourceDirs: ['src', 'app'] }
// ClutterStock: a React Router app in frontend/, sources in frontend/app.
const vite: SourceLayout = { root: 'frontend', sourceDirs: ['app'] }
// romslig: the web app in apps/web plus the workspace packages its bundle imports.
const workspace: SourceLayout = { root: ['apps/web', 'packages/*'], sourceDirs: ['src'] }

const lcov = (records: [string, Record<number, number>][]) =>
  records
    .map(([file, lines]) =>
      [`SF:${file}`, ...Object.entries(lines).map(([l, h]) => `DA:${l},${h}`), 'end_of_record'].join('\n'),
    )
    .join('\n')

describe('normaliseSourcePath', () => {
  it('maps jest, monocart, Metro and absolute paths to <root>/<sourceDir>/...', () => {
    expect(normaliseSourcePath('src\\ar\\geo.ts', expo)).toBe('app/src/ar/geo.ts')
    expect(normaliseSourcePath('app\\_layout.tsx', expo)).toBe('app/app/_layout.tsx')
    expect(normaliseSourcePath('app/app/_layout.tsx', expo)).toBe('app/app/_layout.tsx')
    expect(normaliseSourcePath('app/src/ar/geo.ts', expo)).toBe('app/src/ar/geo.ts')
    expect(normaliseSourcePath('/src/state/store.ts', expo)).toBe('app/src/state/store.ts')
    expect(normaliseSourcePath('/home/runner/work/skylens/skylens/app/app/map.tsx', expo)).toBe('app/app/map.tsx')
    expect(normaliseSourcePath('C:\\r\\skylens\\app\\src\\api\\client.ts', expo)).toBe('app/src/api/client.ts')
    expect(normaliseSourcePath('node_modules/leaflet/dist/leaflet-src.js', expo)).toBe(
      'node_modules/leaflet/dist/leaflet-src.js',
    )
  })

  it('handles a differently named app directory', () => {
    expect(normaliseSourcePath('app/lib/nonce.tsx', vite)).toBe('frontend/app/lib/nonce.tsx')
    expect(normaliseSourcePath('frontend/app/root.tsx', vite)).toBe('frontend/app/root.tsx')
    expect(normaliseSourcePath('/home/runner/work/cs/cs/frontend/app/root.tsx', vite)).toBe('frontend/app/root.tsx')
    expect(normaliseSourcePath('node_modules/react/index.js', vite)).toBe('node_modules/react/index.js')
  })
})

describe('normaliseSourcePath with several roots', () => {
  it('puts app-relative paths under the first root and finds packages anywhere in the path', () => {
    expect(normaliseSourcePath('src/App.tsx', workspace)).toBe('apps/web/src/App.tsx')
    expect(normaliseSourcePath('/src/App.tsx', workspace)).toBe('apps/web/src/App.tsx')
    expect(normaliseSourcePath('apps/web/src/store.ts', workspace)).toBe('apps/web/src/store.ts')
    expect(normaliseSourcePath('packages/shared/src/geometry.ts', workspace)).toBe('packages/shared/src/geometry.ts')
    expect(normaliseSourcePath('../../../../packages/ai/src/client.ts', workspace)).toBe('packages/ai/src/client.ts')
    expect(normaliseSourcePath('/home/runner/work/r/r/packages/shared/src/walk.ts', workspace)).toBe(
      'packages/shared/src/walk.ts',
    )
    expect(normaliseSourcePath('node_modules/three/src/core/Object3D.js', workspace)).toBe(
      'node_modules/three/src/core/Object3D.js',
    )
  })

  it('takes the earliest root in the path', () => {
    expect(normaliseSourcePath('/w/apps/web/src/vendor/packages/x/src/a.ts', workspace)).toBe(
      'apps/web/src/vendor/packages/x/src/a.ts',
    )
  })
})

describe('inLayout', () => {
  const excluding: SourceLayout = { ...workspace, exclude: /^apps\/web\/src\/(main\.tsx|viewer3d\/)/ }

  it('keeps paths under any root, glob roots included', () => {
    expect(inLayout('apps/web/src/store.ts', workspace)).toBe(true)
    expect(inLayout('packages/shared/src/walk.ts', workspace)).toBe(true)
    expect(inLayout('packages/src/x.ts', workspace)).toBe(false)
    expect(inLayout('node_modules/three/src/x.js', workspace)).toBe(false)
    expect(inLayout('localhost-5173', workspace)).toBe(false)
  })

  it('leaves out what the layout excludes', () => {
    expect(inLayout('apps/web/src/main.tsx', excluding)).toBe(false)
    expect(inLayout('apps/web/src/viewer3d/Viewer3D.tsx', excluding)).toBe(false)
    expect(inLayout('apps/web/src/store.ts', excluding)).toBe(true)
    const files = filterFiles(
      new Map([
        ['apps/web/src/main.tsx', new Map([[1, true]])],
        ['apps/web/src/store.ts', new Map([[1, false]])],
      ]),
      excluding,
    )
    expect([...files.keys()]).toEqual(['apps/web/src/store.ts'])
  })
})

describe('parseLcov', () => {
  it('merges repeated records of one file', () => {
    const files = parseLcov(
      lcov([
        ['src/a.ts', { 1: 0, 2: 3 }],
        ['src/a.ts', { 1: 1, 3: 0 }],
      ]),
      expo,
    )
    expect([...files.get('app/src/a.ts')!]).toEqual([
      [1, true],
      [2, true],
      [3, false],
    ])
  })
})

describe('parseCobertura', () => {
  const xml = `<?xml version="1.0" ?>
<coverage lines-valid="4" lines-covered="2">
  <sources><source>/home/runner/work/cs/cs/frontend</source></sources>
  <packages><package name="app"><classes>
    <class name="nonce.tsx" filename="app/lib/nonce.tsx" line-rate="0.5">
      <methods/>
      <lines><line number="1" hits="2"/><line number="2" hits="0"/></lines>
    </class>
    <class name="root.tsx" filename="app/root.tsx" line-rate="0.5">
      <lines><line number="5" hits="0" branch="false"/><line number="6" hits="1"/></lines>
    </class>
  </classes></package></packages>
</coverage>`

  it('joins the source root and the filename, and reads the line hits', () => {
    const files = parseCobertura(xml, vite)
    expect([...files.keys()]).toEqual(['frontend/app/lib/nonce.tsx', 'frontend/app/root.tsx'])
    expect([...files.get('frontend/app/root.tsx')!]).toEqual([
      [5, false],
      [6, true],
    ])
  })

  it('is what parseCoverage picks for XML, and lcov otherwise', () => {
    expect([...parseCoverage(xml, vite).keys()]).toHaveLength(2)
    expect([...parseCoverage(lcov([['app/root.tsx', { 1: 1 }]]), vite).keys()]).toEqual(['frontend/app/root.tsx'])
  })
})

describe('mergeCoverage', () => {
  it('covers a line if either side does; one-sided lines keep their status', () => {
    const unit = parseLcov(
      lcov([
        ['src/a.ts', { 1: 1, 2: 0, 3: 0 }],
        ['src/u.ts', { 1: 0 }],
      ]),
      expo,
    )
    const e2e = parseLcov(
      lcov([
        ['app/src/a.ts', { 2: 4, 3: 0, 9: 1 }],
        ['app/src/e.ts', { 1: 1, 2: 0 }],
      ]),
      expo,
    )
    const merged = mergeCoverage(unit, e2e)
    expect([...merged.get('app/src/a.ts')!]).toEqual([
      [1, true],
      [2, true],
      [3, false],
      [9, true],
    ])
    expect([...merged.get('app/src/u.ts')!]).toEqual([[1, false]])
    expect([...merged.get('app/src/e.ts')!]).toEqual([
      [1, true],
      [2, false],
    ])
    expect(totals(merged)).toEqual({ covered: 4, total: 7, pct: (4 / 7) * 100 })
    expect(e2eGains(unit, e2e)).toEqual([
      { file: 'app/src/a.ts', added: 2 },
      { file: 'app/src/e.ts', added: 1 },
    ])
  })
})

describe('filterFiles', () => {
  it('keeps <root>/ only and applies the exclude', () => {
    const files = parseLcov(
      lcov([
        ['src/a.ts', { 1: 1 }],
        ['src/mock/feed.ts', { 1: 1 }],
        ['node_modules/x.js', { 1: 1 }],
      ]),
      expo,
    )
    expect([...filterFiles(files, expo, /^app\/src\/mock\//).keys()]).toEqual(['app/src/a.ts'])
  })
})

describe('renderMarkdown', () => {
  it('prints the three rows, n/a for a missing side', () => {
    const unit = parseLcov(lcov([['src/a.ts', { 1: 1, 2: 0 }]]), expo)
    const md = renderMarkdown({ unit, e2e: null, unitLabel: 'Unit (jest)' })
    expect(md).toMatch(/\| Unit \(jest\) \| 1 \/ 2 \| 50\.0% \|/)
    expect(md).toMatch(/\| E2E \(Playwright\) \| n\/a \| n\/a \|/)
    expect(md).toMatch(/\| \*\*Combined\*\* \| 1 \/ 2 \| 50\.0% \|/)
    expect(md).toMatch(/Approximate/)
  })

  it('lists where e2e adds the most when both sides are there', () => {
    const unit = parseLcov(lcov([['src/a.ts', { 1: 1, 2: 0 }]]), expo)
    const e2e = parseLcov(lcov([['app/src/a.ts', { 2: 1 }]]), expo)
    expect(renderMarkdown({ unit, e2e })).toMatch(/\| `app\/src\/a\.ts` \| 1 \| 50\.0% \| 100\.0% \|/)
  })
})
