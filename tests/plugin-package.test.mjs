import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {buildPlugin} from '../scripts/build-plugin.mjs';
test('Mobile包在没有宿主依赖的临时目录加载，包含Web及配置页',async()=>{
 const out=await mkdtemp(join(tmpdir(),'standalone-mobile-'));
 await buildPlugin('mobile',out);
 for(const p of ['manifest.json','main.cjs','web/index.html','ui/index.html'])await access(join(out,p));
 const run=execFileSync(process.execPath,['-e',`const p=require(${JSON.stringify(join(out,'main.cjs'))});if(typeof p.activate!=='function')throw Error('missing activate')`],{cwd:tmpdir(),env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.equal(run,'');assert.equal(JSON.parse(await readFile(join(out,'manifest.json'))).id,'mobile');
});
test('会话时间包包含注入入口且不需要后台',async()=>{
 const out=await mkdtemp(join(tmpdir(),'standalone-time-'));await buildPlugin('desktop-thread-time',out);
 assert.equal(JSON.parse(await readFile(join(out,'manifest.json'))).id,'desktop-thread-time');
 assert.match(await readFile(join(out,'inject.js'),'utf8'),/context.onDispose/);
});
