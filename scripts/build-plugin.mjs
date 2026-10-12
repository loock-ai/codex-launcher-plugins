import {build} from 'esbuild';
import {cp,mkdir,readFile,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildPlugin(id,outDir,{pluginsDir=join(root,'plugins')}={}){
 if(!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id))throw Error('插件ID无效');
 const source=join(pluginsDir,id);await mkdir(outDir,{recursive:true});
 const manifest=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));
 await cp(join(source,'manifest.json'),join(outDir,'manifest.json'));
 if(manifest.id!==id)throw Error('插件manifest ID不一致');
 if(id!=='mobile'){await cp(source,outDir,{recursive:true,filter:p=>!p.includes('/node_modules/')&&!p.includes('/dist/')});return;}
 const code=join(source,'source');
 execFileSync(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'build'],{cwd:code,stdio:'inherit'});
 await build({entryPoints:[join(code,'plugins/mobile/main.ts')],outfile:join(outDir,'main.cjs'),bundle:true,platform:'node',format:'cjs',target:'node20',external:['bufferutil','utf-8-validate']});
 await cp(join(source,'ui'),join(outDir,'ui'),{recursive:true});await cp(join(code,'dist'),join(outDir,'web'),{recursive:true});
 await cp(code,join(outDir,'source'),{recursive:true,filter:p=>!p.includes('/node_modules/')&&!p.includes('/dist/')&&!p.includes('/tests/')&&!p.endsWith('.tsbuildinfo')});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const ids=process.argv[2]==='all'?(await (await import('node:fs/promises')).readdir(join(root,'plugins'),{withFileTypes:true})).filter(p=>p.isDirectory()).map(p=>p.name):[process.argv[2]];for(const id of ids){const out=join(root,'dist',id);await rm(out,{recursive:true,force:true});await buildPlugin(id,out);}}
