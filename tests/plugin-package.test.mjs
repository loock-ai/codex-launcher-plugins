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
test('新增第三个插件只需要目录与manifest，不修改Launcher或构建分支',async()=>{
 const {mkdir,writeFile,rm}=await import('node:fs/promises');const source=await mkdtemp(join(tmpdir(),'third-plugin-'));const out=await mkdtemp(join(tmpdir(),'third-out-'));
 try{await mkdir(join(source,'demo'));await writeFile(join(source,'demo/manifest.json'),JSON.stringify({id:'demo',version:'1.0.0',entrypoints:{main:'main.cjs'}}));await writeFile(join(source,'demo/main.cjs'),'exports.activate=async()=>({});');await buildPlugin('demo',out,{pluginsDir:source});assert.match(await readFile(join(out,'main.cjs'),'utf8'),/activate/);}finally{await rm(source,{recursive:true,force:true});await rm(out,{recursive:true,force:true});}
});
