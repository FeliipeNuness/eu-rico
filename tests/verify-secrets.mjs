import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
mkdirSync('diagnostics/launch-20261101',{recursive:true})
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean)
const findings=[]
for(const file of files){
 if(!/\.(tsx?|mjs|json|md|html|css)$/.test(file)||file.endsWith('package-lock.json'))continue
 const text=readFileSync(file,'utf8')
 const patterns=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['supabase-secret',/sb_secret_[A-Za-z0-9_-]{16,}/],['google-secret',/GOCSPX-[A-Za-z0-9_-]{16,}/],['github-token',/gh[pousr]_[A-Za-z0-9]{30,}/]]
 for(const [type,re] of patterns)if(re.test(text))findings.push({file,type})
 for(const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
  try {if(JSON.parse(Buffer.from(match[0].split('.')[1],'base64url').toString()).role==='service_role'&&!file.startsWith('tests/'))findings.push({file,type:'service-role-jwt'})}catch{}
 }
}
const sensitiveFiles=files.filter(x=>/(^|\/)\.env($|\.)/.test(x)&&!x.endsWith('.env.example'))
const result={candidateFiles:files.length,findings,sensitiveFiles,scope:'Known secret patterns in Git candidates; not an exhaustive credential guarantee'}
writeFileSync('diagnostics/launch-20261101/secret-scan.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
if(findings.length||sensitiveFiles.length)process.exitCode=1
