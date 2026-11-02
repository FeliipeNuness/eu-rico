import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temp = resolve(root, 'node_modules/.tmp/eu-rico-tests')
const modules = ['model', 'charts', 'finance', 'storage', 'backup', 'tasks', 'collections', 'migration']
await mkdir(resolve(temp, 'domain'), { recursive: true })
for (const name of modules) {
  const source = await readFile(resolve(root, `src/domain/${name}.ts`), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/(from\s+['"][^'"]+)\.ts(['"])/g, '$1.js$2')
  await writeFile(resolve(temp, `domain/${name}.js`), js)
}
await mkdir(resolve(temp, 'auth'), { recursive: true })
for (const name of ['config', 'oauthErrors', 'environment']) {
  const source = await readFile(resolve(root, `src/auth/${name}.ts`), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
  await writeFile(resolve(temp, `auth/${name}.js`), js)
}
const testSource = (await readFile(resolve(root, 'tests/domain.test.mjs'), 'utf8'))
  .replaceAll('../src/domain/', './domain/').replaceAll('../src/auth/', './auth/').replaceAll('../src/cloud/', './cloud/').replace(/\.ts(?=['"])/g, '.js')
await mkdir(resolve(temp, 'cloud'), { recursive: true })
const repositorySource = await readFile(resolve(root, 'src/cloud/repository.ts'), 'utf8')
const repositoryJs = ts.transpileModule(repositorySource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/(from\s+['"]\.\.?\/[^'"]+)(['"])/g, '$1.js$2')
await writeFile(resolve(temp, 'cloud/repository.js'), repositoryJs)
await writeFile(resolve(temp, 'auth/supabaseClient.js'), 'export const supabase = null; export const supabasePublicConfig = null;\n')
const testFile = resolve(temp, 'domain.test.mjs')
await writeFile(testFile, testSource)
const result = spawnSync(process.execPath, ['--test', testFile], { cwd: root, stdio: 'inherit' })
process.exit(result.status ?? 1)
