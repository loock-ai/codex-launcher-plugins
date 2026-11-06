import type {BackendConfig} from './types';
import {t} from '../i18n';

export async function requestRestartGpt(backend:BackendConfig,fetcher:typeof fetch=fetch){
 const url=new URL('/api/host',backend.baseUrl);url.searchParams.set('token',backend.token);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const host=await fetcher(url,{signal:controller.signal,mode:'cors',cache:'no-store',redirect:'error'});
  if(!host.ok)throw Error(t('设备连接暂不可用'));
  const info=await host.json();
  if(!info.capabilities?.restartGpt)throw Error(t('当前设备的启动器需要更新后才能重启GPT'));
  url.pathname='/api/desktop/restart';
  try{
   const response=await fetcher(url,{method:'POST',signal:controller.signal,mode:'cors',redirect:'error'});
   if(response.status!==202)throw Error('rejected');
  }catch{throw Error(t('重启请求结果未确认，请等待设备重新连接'));}
  return info;
 }finally{clearTimeout(timer);}
}

/** 202仅表示接受请求；等本轮桌面重连完成，避免过早结束按钮loading。 */
export async function restartGptAndWait(backend:BackendConfig,fetcher:typeof fetch=fetch){
 const before=await requestRestartGpt(backend,fetcher);
 if(before.backend!=='desktop-control')return false;
 const url=new URL('/api/host',backend.baseUrl);url.searchParams.set('token',backend.token);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 let disconnected=false;
 try{
  while(!controller.signal.aborted){
   try{
    const response=await fetcher(url,{signal:controller.signal,mode:'cors',cache:'no-store',redirect:'error'});
    if(response.ok){const info=await response.json();
     if(info.appServerReady===false)disconnected=true;
     if(info.appServerReady===true&&(disconnected||typeof info.desktopRestartGeneration==='number'&&info.desktopRestartGeneration>(before.desktopRestartGeneration??0)))return true;
    }
   }catch{if(controller.signal.aborted)break;}
   await new Promise<void>(resolve=>{const done=()=>{clearTimeout(wait);controller.signal.removeEventListener('abort',done);resolve();};const wait=setTimeout(done,750);controller.signal.addEventListener('abort',done,{once:true});});
  }
  throw Error(t('桌面重连尚未确认，请稍后查看连接状态'));
 }finally{clearTimeout(timer);}
}
