import { build } from 'vite'
import { gzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const phase = process.argv[2]
if (!['before','after'].includes(phase)) throw new Error('Use before or after')
// Measurements never initialize a real Supabase project in the browser.
Object.assign(process.env, { VITE_APP_ENV:'local', VITE_SUPABASE_URL:'https://launch-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_performance_only' })
const directory = 'diagnostics/checkpoint-02-performance'
await mkdir(directory,{recursive:true})
let report
await build({ configLoader:'runner',logLevel:'silent',build:{outDir:`node_modules/.tmp/performance-${phase}`},plugins:[{
  name:'local-bundle-measurement',
  generateBundle(_,bundle) {
    const chunks=Object.values(bundle).filter(item=>item.type==='chunk')
    const initial=new Set()
    function visit(name) { if(initial.has(name)||bundle[name]?.type!=='chunk')return;initial.add(name);for(const dependency of bundle[name].imports)visit(dependency) }
    for(const chunk of chunks)if(chunk.isEntry)visit(chunk.fileName)
    const modules=chunks.flatMap(chunk=>Object.entries(chunk.modules).map(([id,info])=>({module:id.replaceAll('\\','/').replace(resolve('.').replaceAll('\\','/')+'/',''),renderedCharacters:info.renderedLength,chunk:chunk.fileName})))
    report={phase,scope:'Same production Vite build, synthetic public config, raw/gzip bytes; no claimed network latency',
      initialJavaScriptBytes:chunks.filter(c=>initial.has(c.fileName)).reduce((sum,c)=>sum+Buffer.byteLength(c.code),0),
      initialJavaScriptGzipBytes:chunks.filter(c=>initial.has(c.fileName)).reduce((sum,c)=>sum+gzipSync(c.code).length,0),
      chunks:chunks.map(c=>({file:c.fileName,entry:c.isEntry,initial:initial.has(c.fileName),bytes:Buffer.byteLength(c.code),gzipBytes:gzipSync(c.code).length,imports:c.imports,dynamicImports:c.dynamicImports})),
      largestModules:modules.sort((a,b)=>b.renderedCharacters-a.renderedCharacters).slice(0,25)}
  },
}] })
await writeFile(`${directory}/bundle-${phase}.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({phase,initialJavaScriptBytes:report.initialJavaScriptBytes,initialJavaScriptGzipBytes:report.initialJavaScriptGzipBytes,chunks:report.chunks.length}))
