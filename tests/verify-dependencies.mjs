import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
mkdirSync('diagnostics/final-launch',{recursive:true})
for(const [name,args] of [['audit-all',['audit','--json']],['audit-production',['audit','--omit=dev','--json']]]){
 const result=spawnSync('npm.cmd',args,{shell:true,encoding:'utf8',timeout:60000})
 try {const data=JSON.parse(result.stdout);writeFileSync(`diagnostics/final-launch/${name}.json`,JSON.stringify(data,null,2)+'\n');console.log(name,JSON.stringify(data.metadata?.vulnerabilities??data.error))}catch{console.log(name,'unavailable',result.status)}
}
