import {build} from 'esbuild';
import {cp,mkdir,readFile,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildPlugin(id,outDir){
 if(!['mobile','desktop-thread-time'].includes(id))throw Error('未知插件');
 const source=join(root,'plugins',id);await mkdir(outDir,{recursive:true});
 const manifest=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));
 await cp(join(source,'manifest.json'),join(outDir,'manifest.json'));
 if(id==='desktop-thread-time'){await cp(join(source,'inject.js'),join(outDir,'inject.js'));return;}
 const code=join(source,'source');
 execFileSync(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'build'],{cwd:code,stdio:'inherit'});
 await build({entryPoints:[join(code,'plugins/mobile/main.ts')],outfile:join(outDir,'main.cjs'),bundle:true,platform:'node',format:'cjs',target:'node20',external:['bufferutil','utf-8-validate']});
 await cp(join(source,'ui'),join(outDir,'ui'),{recursive:true});await cp(join(code,'dist'),join(outDir,'web'),{recursive:true});
 await cp(code,join(outDir,'source'),{recursive:true,filter:p=>!p.includes('/node_modules/')&&!p.includes('/dist/')&&!p.includes('/tests/')&&!p.endsWith('.tsbuildinfo')});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const ids=process.argv[2]==='all'?['mobile','desktop-thread-time']:[process.argv[2]];for(const id of ids){const out=join(root,'dist',id);await rm(out,{recursive:true,force:true});await buildPlugin(id,out);}}
