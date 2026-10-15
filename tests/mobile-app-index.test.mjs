import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMobileAppIndex} from '../scripts/validate-mobile-app-index.mjs';
const release={tag_name:'v0.2.33',draft:false,prerelease:false,html_url:'https://github.com/loock-ai/codex-launcher-plugins/releases/tag/v0.2.33',assets:[{name:'CodexMobile-v0.2.33.apk',browser_download_url:'https://github.com/loock-ai/codex-launcher-plugins/releases/download/v0.2.33/CodexMobile-v0.2.33.apk',digest:'sha256:'+'a'.repeat(64)}]};
test('固定App更新索引只接受正式APK和校验值，拒绝插件Release与其他来源',()=>{
 assert.equal(validateMobileAppIndex(release),'v0.2.33');
 for(const value of [null,{...release,draft:true},{...release,tag_name:'mobile-v1.1.0'},{...release,assets:[]},{...release,assets:[{...release.assets[0],digest:null}]},{...release,assets:[{...release.assets[0],browser_download_url:'https://example.com/file.apk'}]}])assert.throws(()=>validateMobileAppIndex(value));
});
