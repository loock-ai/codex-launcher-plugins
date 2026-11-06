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
 }finally{clearTimeout(timer);}
}
