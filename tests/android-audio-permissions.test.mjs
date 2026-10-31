import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parse} from 'yaml';

const workflow=parse(readFileSync(new URL('../.github/workflows/build-android.yml',import.meta.url),'utf8'));
function python(stepName){
 const run=workflow.jobs.build.steps.find(step=>step.name===stepName)?.run;
 const match=run?.match(/python3[^\n]*<<'PY'\n([\s\S]*?)^PY$/m);
 assert.ok(match,`Missing production Python in ${stepName}`);return match[1];
}
const permissions=['INTERNET','ACCESS_NETWORK_STATE','CAMERA','RECORD_AUDIO','MODIFY_AUDIO_SETTINGS','REQUEST_INSTALL_PACKAGES'];
const appId='vip.loock.codexmobile';
function manifest(list,{final=false}={}){
 return `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${appId}">${list.map(name=>`<uses-permission android:name="android.permission.${name}"/>`).join('')}${final?`<uses-permission android:name="${appId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"/><permission android:name="${appId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" android:protectionLevel="signature"/>`:''}<application android:allowBackup="false"><provider android:name="androidx.core.content.FileProvider" android:authorities="${appId}.fileprovider" android:exported="false"/></application></manifest>`;
}
test('Android 清理权限时保留并补齐 WebRTC 音频设置权限，仍移除无关权限',()=>{
 const full=python('Harden and test embedded Android project');const end=full.indexOf('activity_path =');assert.ok(end>0);
 for(const includeAudioSettings of [true,false]){
  const root=mkdtempSync(join(tmpdir(),'android-audio-permissions-'));
  try{
   mkdirSync(join(root,'app/src/main/res/xml'),{recursive:true});mkdirSync(join(root,'app/src/main/assets'),{recursive:true});
   writeFileSync(join(root,'app/src/main/AndroidManifest.xml'),manifest(['INTERNET','RECORD_AUDIO','READ_SMS',...(includeAudioSettings?['MODIFY_AUDIO_SETTINGS']:[])]));
   const run=spawnSync('python3',['-c',full.slice(0,end)+`\nprint(sorted(element.get('{http://schemas.android.com/apk/res/android}name') for element in root.findall('uses-permission')))`],{cwd:root,encoding:'utf8'});
   assert.equal(run.status,0,run.stderr);
   const result=readFileSync(join(root,'app/src/main/AndroidManifest.xml'),'utf8');
   assert.ok(result.includes('android.permission.MODIFY_AUDIO_SETTINGS'),'WebRTC permission was removed or not inserted');
   assert.ok(result.includes('android.permission.RECORD_AUDIO'));assert.ok(!result.includes('android.permission.READ_SMS'));
  }finally{rmSync(root,{recursive:true,force:true});}
 }
});
test('APK 成品校验要求音频设置权限，缺失时拒绝发布',()=>{
 const script=python('Prepare and verify APK'),root=mkdtempSync(join(tmpdir(),'android-final-audio-'));
 try{
  const file=join(root,'manifest.xml');
  for(const complete of [true,false]){
   writeFileSync(file,manifest(complete?permissions:permissions.filter(p=>p!=='MODIFY_AUDIO_SETTINGS'),{final:true}));
   const run=spawnSync('python3',['-c',script,file],{encoding:'utf8',env:{...process.env,APP_ID:appId}});
   assert.equal(run.status===0,complete,run.stderr);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
