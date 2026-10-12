import Ajv from 'ajv';import {readFileSync} from 'node:fs';
const check=new Ajv({allErrors:true}).compile(JSON.parse(readFileSync(new URL('../schemas/plugins.schema.json',import.meta.url))));
export function validateCatalog(value){
 if(!check(value))throw Error('插件目录格式错误: '+JSON.stringify(check.errors));
 const seen=new Set();for(const p of value.plugins){
  if(seen.has(p.id))throw Error('重复插件ID');seen.add(p.id);
  if(p.git.path!==`plugins/${p.id}`||p.git.ref!==`${p.id}-v${p.version}`||p.release.url!==`${value.repository}/releases/download/${p.git.ref}/${p.id}-${p.version}.zip`)throw Error('源码、版本与发布地址不一致');
 }
 return value;
}
export function resolvePlugin(catalog,id){const p=validateCatalog(catalog).plugins.find(p=>p.id===id);if(!p)throw Error('目录中未找到插件');return p;}
