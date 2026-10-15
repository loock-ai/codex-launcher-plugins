import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parse} from 'yaml';
for(const name of ['build-android.yml','build-ios.yml'])test(`${name} 内嵌Shell与Python语法有效`,()=>{
 let pythonBlocks=0;
 const w=parse(readFileSync(new URL(`../.github/workflows/${name}`,import.meta.url),'utf8'));
 for(const job of Object.values(w.jobs))for(const step of job.steps??[]){
  if(!step.run)continue;
  assert.equal(spawnSync('bash',['-n'],{input:step.run,encoding:'utf8'}).status,0,step.name);
  const pattern=/python3?[^\n]*<<'PY'\n([\s\S]*?)^PY$/gm;
  for(const m of step.run.matchAll(pattern)){
   pythonBlocks++;
   const check=spawnSync('python3',['-c','import sys; compile(sys.stdin.read(),"workflow.py","exec")'],{input:m[1],encoding:'utf8'});
   assert.equal(check.status,0,`${step.name}: ${check.stderr}`);
  }
 }
 assert.ok(pythonBlocks>0,'必须实际检查原生封装Python脚本');
});
