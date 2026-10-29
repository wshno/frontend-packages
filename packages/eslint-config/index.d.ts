import type { Linter } from 'eslint'

export declare const ignores: Linter.Config[]
export declare const base: Linter.Config[]
export declare const react: Linter.Config[]
export declare const reactRouter: Linter.Config[]
export declare const node: Linter.Config[]
export declare function vitest(files?: string[]): Linter.Config[]
export declare function testingLibrary(files?: string[]): Linter.Config[]
export declare function playwright(files?: string[]): Linter.Config[]

declare const config: Linter.Config[]
export default config
