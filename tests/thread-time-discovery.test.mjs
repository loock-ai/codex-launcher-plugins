import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const source=await readFile(new URL('../plugins/desktop-thread-time/inject.js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function fixture(t,{preload=false,delayed=false}={}){
 const dir=await mkdtemp(join(tmpdir(),'thread-time-discovery-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await writeFile(join(dir,'package.json'),' {"type":"module"}');
 await mkdir(join(dir,'assets'));
 const module=pathToFileURL(join(dir,'assets/app-shared-new-build.js')).href;
 await writeFile(join(dir,'assets/app-shared-new-build.js'),`export const decoy={}; export const renamedExport={localThreadCatalog:{readEntries:async()=>[]}};`);
 const controller=new AbortController();let cleanup;let styles=0;let reads=0;
 const context={signal:controller.signal,onDispose(fn){cleanup=fn}};
 t.after(()=>{controller.abort();cleanup?.()});
 const document={head:{append(){styles++}},body:{},createElement(){return {setAttribute(){},remove(){styles--}}},querySelectorAll(selector){return selector.includes('script')&&preload?[{src:module,href:module}]:[]}};
 const performance={getEntriesByType(){reads++;return preload||delayed&&reads<2?[]:[{name:module}]}};
 const Observer=class{observe(){} disconnect(){}};
 await new AsyncFunction('context','window','document','performance','location','MutationObserver',source)(context,{electronBridge:{getSentryInitOptions:()=>({appVersion:'26.1007.71326'})}},document,performance,{href:pathToFileURL(join(dir,'index.html')).href},Observer);
 assert.equal(styles,1,'接口能力存在时应完成注入');
 controller.abort();assert.equal(styles,0,'停止后清理样式');
}
test('未知桌面版本与重命名导出可以通过已加载模块发现缓存服务',t=>fixture(t));
test('资源计时记录不可用时通过 modulepreload 发现服务',t=>fixture(t,{preload:true}));
test('桌面模块延迟加载时重新检测',t=>fixture(t,{delayed:true}));
