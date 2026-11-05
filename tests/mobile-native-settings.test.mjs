import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../plugins/mobile/ui/index.html',import.meta.url),'utf8');
const script=await readFile(new URL('../plugins/mobile/ui/app.js',import.meta.url),'utf8');
async function fixture(canApply=true){
 const dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window,actions=[];
 let activeMode='cdp';
 w.postMessage=message=>{
  actions.push(message);
  if(message.action==='config.apply')activeMode=message.params.mode;
  const result=message.action==='config.read'?{mode:activeMode,gatewayPort:19877,appServerPort:19876,host:'0.0.0.0',token:'',upstreamUrl:'ws://127.0.0.1:18765'}:
   message.action==='status.get'?{state:'running',mode:activeMode,port:19877,clients:1,error:'',canApplyConfig:canApply}:
   message.action==='connection.read'?{accessUrl:'http://192.168.1.2:19877/?token=fixture',localUrl:'http://127.0.0.1:19877/?token=fixture',qrDataUrl:'data:image/png;base64,fixture',desktop:{appPath:'/fixture',cdpPort:9333,nativeControlApi:canApply}}:{};
  queueMicrotask(()=>w.dispatchEvent(new w.MessageEvent('message',{source:w,data:{type:'launcher-plugin-response',id:message.id,result}})));
 };
 w.eval(script);await new Promise(r=>setTimeout(r,25));
 return {dom,w,actions,mode(value){w.document.querySelector('[name="mode"]').value=value;w.document.querySelector('[name="mode"]').dispatchEvent(new w.Event('change'));}};
}
test('单页只有一个Web端口和二维码，各模式只显示对应后端字段',async()=>{
 const f=await fixture();const d=f.w.document;
 try{
  assert.equal(d.querySelector('nav'),null);assert.equal(d.querySelector('header'),null);
  assert.equal(d.getElementById('approvals'),null);assert.equal(d.getElementById('logs'),null);
  assert.equal(d.querySelectorAll('[name="gatewayPort"]').length,1);assert.equal(d.querySelectorAll('img').length,1);
  assert.equal(d.querySelector('option[value="native"]').textContent,'本机原生 API');
  f.mode('native');assert.equal(d.querySelector('[name="appServerPort"]').disabled,true);assert.equal(d.querySelector('[name="upstreamUrl"]').disabled,true);
  f.mode('managed');assert.equal(d.querySelector('[name="appServerPort"]').disabled,false);assert.equal(d.querySelector('[name="upstreamUrl"]').disabled,true);
  f.mode('external');assert.equal(d.querySelector('[name="upstreamUrl"]').disabled,false);assert.equal(d.querySelector('[name="appServerPort"]').disabled,true);
  f.mode('cdp');assert.equal(d.querySelector('[name="gatewayPort"]').value,'19877');
  assert.ok(!f.actions.some(a=>['config.apply','config.save','remote-control.authorize','__runtime.stop'].includes(a.action)));
 }finally{f.dom.window.close();}
});
test('选择模式不会立即切换，应用后显示实际模式且沿用唯一入口',async()=>{
 const f=await fixture();const d=f.w.document;
 try{
  const original=d.getElementById('address').textContent;f.mode('native');
  assert.match(d.getElementById('summary').textContent,/CDP/);
  d.getElementById('config').dispatchEvent(new f.w.Event('submit',{cancelable:true}));
  await new Promise(r=>setTimeout(r,25));
  const apply=f.actions.find(a=>a.action==='config.apply');assert.equal(apply.params.mode,'native');assert.equal(apply.params.gatewayPort,19877);
  assert.equal(apply.params.appServerPort,undefined);assert.equal(apply.params.upstreamUrl,undefined);
  assert.equal(d.getElementById('address').textContent,original);assert.match(d.getElementById('summary').textContent,/本机原生 API/);
 }finally{f.dom.window.close();}
});
test('旧后台保持原连接，界面明确提示更新而不自动重启服务',async()=>{
 const f=await fixture(false);
 try{f.mode('native');assert.equal(f.w.document.getElementById('apply-config').disabled,true);assert.ok(!f.actions.some(a=>a.action==='__runtime.stop'));}finally{f.dom.window.close();}
});
