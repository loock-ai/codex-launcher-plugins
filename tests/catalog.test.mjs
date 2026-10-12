import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateCatalog} from '../scripts/catalog.mjs';
const plugin={id:'mobile',name:'Mobile',description:'手机对话',version:'1.0.0',git:{url:'https://github.com/loock-ai/codex-launcher-plugins.git',path:'plugins/mobile',ref:'mobile-v1.0.0',commit:'a'.repeat(40)},compatibility:{launcherApiVersion:'1',node:'>=20'},release:{url:'https://github.com/loock-ai/codex-launcher-plugins/releases/download/mobile-v1.0.0/mobile-1.0.0.zip',sha256:'a'.repeat(64)}};
const catalog={schemaVersion:1,repository:'https://github.com/loock-ai/codex-launcher-plugins',plugins:[plugin]};
test('有效目录与真实发布字段通过校验',()=>assert.equal(validateCatalog(catalog).plugins[0].version,'1.0.0'));
test('重复ID、非法版本、路径和缺失哈希拒绝',()=>{
 for(const mutation of [c=>c.plugins.push({...plugin}),c=>c.plugins[0].version='01.0.0',c=>c.plugins[0].git.path='../x',c=>c.plugins[0].release.sha256='',c=>c.plugins[0].release.url='http://evil/x.zip',c=>c.plugins[0].git.commit='placeholder',c=>c.plugins[0].release.url=plugin.release.url.replace('mobile-v1.0.0','mobile-v1.1.0')]){
  const c=structuredClone(catalog);mutation(c);assert.throws(()=>validateCatalog(c));
 }
});
