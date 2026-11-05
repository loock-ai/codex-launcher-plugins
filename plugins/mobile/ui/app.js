const pending=new Map();
let sequence=0,runtimeStatus,connectionDetails;
const $=id=>document.getElementById(id);
const form=$('config');
const modeNames={cdp:'共享 Desktop（CDP）',native:'本机原生 API',managed:'托管 app-server',external:'外部 app-server','remote-control':'本机原生 API'};
const descriptions={
 cdp:'通过桌面消息桥连接，共享桌面当前的会话和执行状态。',
 native:'通过本机原生 AppServerManager API 连接，共享桌面当前的同一个执行实例。当前使用 CDP 获取句柄和接收通知。',
 managed:'由启动器启动并管理独立的 Codex 服务进程，使用独立的执行实例。',
 external:'连接已运行的 app-server，执行环境和会话状态由该服务提供。'
};
function call(action,params={}){
 return new Promise((resolve,reject)=>{
  const id=String(++sequence);
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error('插件响应超时，请查看运行状态'));},45000);
  pending.set(id,{resolve,reject,timer});
  window.parent.postMessage({type:'launcher-plugin-request',id,action,params},'*');
 });
}
window.addEventListener('message',event=>{
 if(event.source!==window.parent||event.data?.type!=='launcher-plugin-response')return;
 const item=pending.get(event.data.id);if(!item)return;
 clearTimeout(item.timer);pending.delete(event.data.id);
 if(event.data.error)item.reject(new Error(typeof event.data.error==='string'?event.data.error:event.data.error.message));
 else item.resolve(event.data.result);
});
function showError(error){$('error').hidden=!error;$('error').textContent=error?.message||'';}
function updateFields(){
 const mode=form.elements.mode.value;
 $('mode-description').textContent=descriptions[mode]||'';
 for(const block of document.querySelectorAll('[data-modes]')){
  const active=block.dataset.modes.split(' ').includes(mode);block.hidden=!active;
  for(const field of block.querySelectorAll('input,select')){field.disabled=!active;field.required=active;}
 }
 const needsUpdate=runtimeStatus&&!runtimeStatus.canApplyConfig&&runtimeStatus.state!=='stopped';
 const nativeUnavailable=mode==='native'&&connectionDetails&&!connectionDetails.nativeControlApi;
 $('apply-config').disabled=!!(needsUpdate||nativeUnavailable);
 $('apply-hint').textContent=needsUpdate||nativeUnavailable?'应用新的连接模式需要更新启动器后台，当前连接继续运行。':'运行中应用设置会短暂重连。切换后端时沿用当前 Web 端口和访问口令。';
}
async function connection(){
 const data=await call('connection.read');connectionDetails=data.desktop;
 $('qr-image').src=data.qrDataUrl;$('address').textContent=data.accessUrl;
 $('desktop').textContent=data.desktop.appPath+' · CDP '+data.desktop.cdpPort;
 $('cli-path').textContent=data.desktop.cliPath?'Codex CLI · '+data.desktop.cliPath:'启动时自动查找本机 Codex CLI。';
 updateFields();
}
async function refresh(){
 runtimeStatus=await call('status.get');
 const state=({stopped:'已停止',starting:'启动中',running:'运行中',waiting:'等待桌面',stopping:'停止中',error:'服务异常'})[runtimeStatus.state]||runtimeStatus.state;
 $('summary').textContent=state+' · '+(modeNames[runtimeStatus.mode]||runtimeStatus.mode)+' · 端口 '+runtimeStatus.port+' · '+runtimeStatus.clients+' 个客户端';
 if(runtimeStatus.error)showError(new Error(runtimeStatus.error));
 updateFields();
}
for(const button of document.querySelectorAll('[data-action]'))button.addEventListener('click',async()=>{
 button.disabled=true;showError(null);
 try{await call(button.dataset.action);await refresh();await connection();}
 catch(error){showError(error);}finally{button.disabled=false;}
});
form.elements.mode.addEventListener('change',()=>{showError(null);updateFields();});
form.addEventListener('submit',async event=>{
 event.preventDefault();showError(null);
 const button=$('apply-config');if(button.disabled)return;button.disabled=true;
 const values=Object.fromEntries(new FormData(form));
 values.gatewayPort=Number(values.gatewayPort);
 if(values.appServerPort!==undefined)values.appServerPort=Number(values.appServerPort);
 try{
  await call(runtimeStatus?.canApplyConfig?'config.apply':'config.save',values);
  form.elements.token.value='';await refresh();await connection();
 }catch(error){showError(error);}finally{updateFields();}
});
(async()=>{
 try{
  const config=await call('config.read');
  for(const [name,value]of Object.entries(config)){
   const field=form.elements.namedItem(name);
   if(field)field.value=name==='mode'&&value==='remote-control'?'native':value;
  }
  updateFields();await refresh();await connection();
 }catch(error){showError(error);}
})();
const poll=setInterval(()=>refresh().catch(showError),2500);
window.addEventListener('pagehide',()=>{clearInterval(poll);for(const item of pending.values())clearTimeout(item.timer);pending.clear();});
