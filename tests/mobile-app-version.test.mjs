import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAppVersion,androidVersionCode,shouldPublishApp} from '../scripts/mobile-app-version.mjs';
test('独立App版本读取所有App tags，忽略插件与更新频道，不退回旧仓库版本',()=>{
 assert.equal(resolveAppVersion({baseline:'0.2.28',tags:['mobile-v1.1.0','desktop-thread-time-v1.0.4','mobile-app-updates'],requested:''}),'0.2.29');
 assert.equal(resolveAppVersion({baseline:'0.2.28',tags:['v0.2.30','v0.2.9'],requested:''}),'0.2.31');
 assert.throws(()=>resolveAppVersion({baseline:'0.2.28',tags:['v0.2.30'],requested:'0.2.30'}));
 assert.equal(resolveAppVersion({baseline:'0.2.28',tags:['v0.2.30'],requested:'0.3.0'}),'0.3.0');
});
test('拒绝非法版本与过大Android版本，跨仓库版本码保持递增',()=>{
 assert.throws(()=>resolveAppVersion({baseline:'bad',tags:[],requested:''}));
 assert.throws(()=>androidVersionCode('1.0.1000'));
 assert.throws(()=>androidVersionCode('2000.0.0'));
 assert.ok(androidVersionCode('0.2.29')>100000);
 assert.ok(androidVersionCode('0.3.0')>androidVersionCode('0.2.999'));
 assert.equal(androidVersionCode('0.2.29'),200002029);
});

test('主分支push自动发布，手动构建只有明确请求才发布',()=>{assert.equal(shouldPublishApp(undefined,'workflow_dispatch'),false);assert.equal(shouldPublishApp('false','workflow_dispatch'),false);assert.equal(shouldPublishApp('true','workflow_dispatch'),true);assert.equal(shouldPublishApp(undefined,'push'),true)});
