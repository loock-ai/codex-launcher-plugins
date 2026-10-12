import {readFile,writeFile,readdir,stat,mkdir,rm,mkdtemp} from 'node:fs/promises';import {createWriteStream} from 'node:fs';
import {join,resolve,basename} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import yazl from 'yazl';
import {buildPlugin} from './build-plugin.mjs';import {validateCatalog} from './catalog.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),repo='loock-ai/codex-launcher-plugins';
const gh=(...args)=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','inherit']}).trim();
async function entries(dir,prefix=''){const all=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('发布包不支持符号链接');const rel=prefix+e.name;if(e.isDirectory())all.push(...await entries(join(dir,e.name),rel+'/'));else if(e.isFile())all.push(rel);}return all.sort();}
export async function packagePlugin(id,out){
 if(!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id))throw Error('插件ID无效');
 const manifest=JSON.parse(await readFile(join(root,'plugins',id,'manifest.json'),'utf8'));
 if(manifest.id!==id||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version))throw Error('版本无效');
 await mkdir(out,{recursive:true});const dir=await mkdtemp(join(tmpdir(),'plugin-package-'));
 try{await buildPlugin(id,dir);const file=join(out,`${id}-${manifest.version}.zip`);const zip=new yazl.ZipFile();
 for(const rel of await entries(dir))zip.addFile(join(dir,rel),rel,{mode:(await stat(join(dir,rel))).mode});
 await new Promise((ok,no)=>{const stream=createWriteStream(file,{flags:'wx'});stream.on('error',no);zip.outputStream.on('error',no);stream.on('close',ok);zip.outputStream.pipe(stream);zip.end();});
 const sha256=createHash('sha256').update(await readFile(file)).digest('hex');await writeFile(file+'.sha256',`${sha256}  ${basename(file)}\n`);return {id,version:manifest.version,file,sha256,manifest};
 }finally{await rm(dir,{recursive:true,force:true});}
}
export async function publishPlugin(id){
 if(process.env.GITHUB_REF&&process.env.GITHUB_REF!=='refs/heads/main')throw Error('仅main可发布');
 const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const out=await mkdtemp(join(tmpdir(),'plugin-assets-'));const p=await packagePlugin(id,out);const tag=`${id}-v${p.version}`;
 const notes=join(out,'notes.md');await writeFile(notes,`# ${p.manifest.name} ${p.version}\n\n${p.manifest.description}\n\nZIP 为完整插件包，宿主 API ${p.manifest.launcherApiVersion??'1'}，Node.js >=20。配置保留在 ~/.codex-launcher/plugin-data/${id}/，不在更新包内。\n`);
 gh('release','create',tag,p.file,p.file+'.sha256','--repo',repo,'--target',source,'--title',`${p.manifest.name} ${p.version}`,'--notes-file',notes,'--draft','--latest=false');
 const verify=join(out,'readback');await mkdir(verify);gh('release','download',tag,'--repo',repo,'--dir',verify);
 if(createHash('sha256').update(await readFile(join(verify,basename(p.file)))).digest('hex')!==p.sha256)throw Error('远端包哈希不符，保留草稿');
 gh('release','edit',tag,'--repo',repo,'--draft=false','--latest=false');
 const catalog=JSON.parse(await readFile(join(root,'plugins.json'),'utf8'));const entry={id,name:p.manifest.name,description:p.manifest.description,version:p.version,git:{url:`https://github.com/${repo}.git`,path:`plugins/${id}`,ref:tag,commit:source},compatibility:{launcherApiVersion:p.manifest.launcherApiVersion??'1',node:'>=20'},release:{url:`https://github.com/${repo}/releases/download/${tag}/${basename(p.file)}`,sha256:p.sha256}};
 catalog.plugins=catalog.plugins.filter(x=>x.id!==id);catalog.plugins.push(entry);catalog.plugins.sort((a,b)=>a.id.localeCompare(b.id));validateCatalog(catalog);await writeFile(join(root,'plugins.json'),JSON.stringify(catalog,null,2)+'\n');
 console.log(JSON.stringify(entry));return entry;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await publishPlugin(process.argv[2]);
