import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
mkdirSync('diagnostics/final-launch',{recursive:true})
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean)
const findings=[]
const syntheticFixtures=[]
const knownFixture=(token,file)=>file==='tests/domain.test.mjs'&&token.split('.')[2]==='signature'&&Object.keys(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString())).join(',')==='role'
for(const file of files){
 if(!/\.(tsx?|mjs|json|md|html|css)$/.test(file)||file.endsWith('package-lock.json'))continue
 const text=readFileSync(file,'utf8')
 const patterns=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['supabase-secret',/sb_secret_[A-Za-z0-9_-]{16,}/],['google-secret',/GOCSPX-[A-Za-z0-9_-]{16,}/],['github-token',/gh[pousr]_[A-Za-z0-9]{30,}/]]
 for(const [type,re] of patterns)if(re.test(text))findings.push({file,type})
 for(const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
  try {if(JSON.parse(Buffer.from(match[0].split('.')[1],'base64url').toString()).role==='service_role') {
   if(knownFixture(match[0],file))syntheticFixtures.push({file,type:'deliberately-invalid-role-only-jwt'})
   else findings.push({file,type:'service-role-jwt'})
  }}catch{}
 }
}
const sensitiveFiles=files.filter(x=>/(^|\/)\.env($|\.)/.test(x)&&!['.env.example','.env.staging.example'].includes(x))
const historyFindings=[]
const commits=execFileSync('git',['rev-list','--all'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean)
for(const commit of commits){
 const patch=execFileSync('git',['show','--format=','--no-ext-diff',commit,'--','.',':!package-lock.json'],{encoding:'utf8',maxBuffer:64*1024*1024})
 for(const [type,re] of [['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['supabase-secret',/sb_secret_[A-Za-z0-9_-]{16,}/],['supabase-access-token',/sbp_[a-f0-9]{40,}/],['google-secret',/GOCSPX-[A-Za-z0-9_-]{16,}/],['github-token',/gh[pousr]_[A-Za-z0-9]{30,}/]]) {
  if(re.test(patch))historyFindings.push({commit,type})
 }
 let file=''
 for(const line of patch.split('\n')) {
  if(line.startsWith('+++ b/'))file=line.slice(6)
  for(const match of line.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
   try {if(JSON.parse(Buffer.from(match[0].split('.')[1],'base64url').toString()).role==='service_role') {
    if(knownFixture(match[0],file))syntheticFixtures.push({commit,file,type:'deliberately-invalid-role-only-jwt'})
    else historyFindings.push({commit,file,type:'service-role-jwt'})
   }}catch{}
  }
 }
}
const result={candidateFiles:files.length,findings,sensitiveFiles,historyCommits:commits.length,historyFindings,syntheticFixtures,scope:'Known secret patterns in Git candidates and reachable commit patches; not an exhaustive credential guarantee. Reports never include matched values.'}
writeFileSync('diagnostics/final-launch/secret-scan.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
if(findings.length||sensitiveFiles.length||historyFindings.length)process.exitCode=1
