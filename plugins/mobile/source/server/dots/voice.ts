import {DotsError,type DesktopHttpTransport,type DotProfile} from './types.js';
import {isOpaqueId} from './identifiers.js';

interface StartInput {requestId:string;dotId:string;sdp:string}
interface Call extends StartInput {
 identityKey?:string;callId?:string;cancelled:boolean;unknown:boolean;expiresAt:number;
 pending:Promise<{requestId:string;answerSdp:string}>;attaching?:Promise<void>;stopping?:Promise<void>;
}
const failure=(code:string,message:string,status=409)=>new DotsError(code,message,status);
/** 一次创建只投递一次。requestId 保留到网关退出，未知结果不允许再次拨号。 */
export class DotsVoice {
 private calls=new Map<string,Call>();
 private active?:Call;
 private closed=false;
 private timer:ReturnType<typeof setInterval>;
 constructor(private transport:DesktopHttpTransport,private resolveDot:(id:string)=>Promise<DotProfile>){
  this.timer=setInterval(()=>{
   const call=this.active;
   if(call&&call.expiresAt<=Date.now()){
    call.expiresAt=Date.now()+30000;
    void this.stop(call.requestId).catch(()=>{/* 保留阻塞记录，下一轮仅重试清理，不重新创建。 */});
   }
  },5000);
  this.timer.unref?.();
 }
 async start(input:StartInput){
  if(!input||!isOpaqueId(input.requestId)||!isOpaqueId(input.dotId)||typeof input.sdp!=='string'||!input.sdp.startsWith('v=0')||input.sdp.length>65536)throw failure('DOTS_INVALID_INPUT','通话请求或 SDP 无效',400);
  const old=this.calls.get(input.requestId);
  if(old){
   if(old.dotId!==input.dotId||old.sdp!==input.sdp)throw failure('DOTS_INVALID_INPUT','请求 ID 已用于其他通话输入',400);
   this.assertOpen(old);await this.identity(old);this.assertOpen(old);return old.pending;
  }
  if(this.closed)throw failure('DOTS_UNAVAILABLE','语音服务已关闭',503);
  if(this.active)throw failure('DOTS_VOICE_BUSY','已有通话连接中、进行中或待清理，请先挂断');
  if(this.calls.size>=1000)throw failure('DOTS_LEDGER_FULL','通话记录已满，请重启网关',503);
  const call={...input,cancelled:false,unknown:false,expiresAt:Date.now()+60000} as Call;
  this.active=call;this.calls.set(call.requestId,call);
  call.pending=Promise.resolve().then(()=>this.create(call));
  return call.pending;
 }
 private async identity(call:Call){
  const status=await this.transport.status();
  if(!status.available||status.code==='DOTS_ACCOUNT_CHANGED'||!status.identityKey||call.identityKey&&call.identityKey!==status.identityKey)throw failure('DOTS_ACCOUNT_CHANGED','桌面账户已变化或不可用，通话无法继续');
  return status;
 }
 private assertOpen(call:Call){if(call.cancelled||this.closed)throw failure('DOTS_VOICE_CANCELLED','通话已取消');}
 private path(call:Call){return `/tbo/${encodeURIComponent(call.dotId)}/voice/calls`;}
 private async create(call:Call){
  try{
   const status=await this.identity(call);call.identityKey=status.identityKey;
   if(status.voiceSignaling!==true)throw failure('DOTS_VOICE_UNSUPPORTED','请先升级 Launcher，当前宿主尚不支持语音信令',503);
   const dot=await this.resolveDot(call.dotId);this.assertOpen(call);
   let response;
   try{response=await this.transport.request({method:'POST',path:this.path(call),body:{sdp:call.sdp}});}
   catch(error){
    if(error instanceof DotsError&&error.code==='DOTS_ACCOUNT_CHANGED')throw error;
    call.unknown=true;throw failure('DOTS_VOICE_UNKNOWN','通话创建结果未知，请在 ChatGPT 核对通话状态，勿重复拨号',502);
   }
   if(response.status<200||response.status>=300){
    if(response.status>=400&&response.status<500&&![408,499].includes(response.status))throw failure('DOTS_VOICE_REJECTED',`通话被拒绝（${response.status}）`,response.status);
    call.unknown=true;throw failure('DOTS_VOICE_UNKNOWN','无法确认通话创建结果，请在 ChatGPT 核对',502);
   }
   const raw=response.headers?.location?.split('?')[0].split('/').at(-1);
   let id:string|undefined;try{id=raw?decodeURIComponent(raw):undefined;}catch{/* 无法识别回执 */}
   if(!isOpaqueId(id)||!id.startsWith('rtc_')){call.unknown=true;throw failure('DOTS_VOICE_UNKNOWN','未获得可核对的通话 ID，请在 ChatGPT 核对',502);}
   call.callId=id;
   const root=response.headers?.['openai-root-thread-id'];
   if(typeof response.body!=='string'||!response.body.startsWith('v=0')||response.body.length>65536||root&&dot.threadId&&root!==dot.threadId){
    await this.stopAllocation(call);throw failure('DOTS_VOICE_INVALID_RESPONSE','通话应答或所属对话不匹配，已停止连接',502);
   }
   if(call.cancelled||this.closed){await this.stopAllocation(call);this.assertOpen(call);}
   return {requestId:call.requestId,answerSdp:response.body};
  }catch(error){if(!call.unknown&&!call.callId&&this.active===call)this.active=undefined;throw error;}
 }
 private get(requestId:string){
  const call=this.calls.get(requestId);
  if(!call)throw failure('DOTS_VOICE_NOT_FOUND','未找到本次网页创建的通话',404);
  return call;
 }
 async attach(requestId:string){
  const call=this.get(requestId);await call.pending;this.assertOpen(call);
  if(!call.callId)throw failure('DOTS_VOICE_CANCELLED','通话已经结束');
  if(!call.attaching)call.attaching=(async()=>{
   await this.identity(call);this.assertOpen(call);
   const result=await this.transport.request({method:'POST',path:`${this.path(call)}/${encodeURIComponent(call.callId!)}/attach`});
   if(result.status<200||result.status>=300)throw failure('DOTS_VOICE_ATTACH_FAILED','语音通话关联失败，请挂断后核对',502);
  })();
  await call.attaching;this.assertOpen(call);
  return {attached:true};
 }
 async heartbeat(requestId:string){
  const call=this.get(requestId);this.assertOpen(call);await this.identity(call);this.assertOpen(call);
  if(this.active!==call)throw failure('DOTS_VOICE_CANCELLED','通话已经结束');
  call.expiresAt=Date.now()+60000;return {alive:true};
 }
 private async stopAllocation(call:Call){
  if(!call.callId)return;
  if(!call.stopping)call.stopping=(async()=>{
   await this.identity(call);
   const result=await this.transport.request({method:'POST',path:`${this.path(call)}/${encodeURIComponent(call.callId!)}/stop`});
   if(result.status<200||result.status>=300)throw failure('DOTS_VOICE_STOP_FAILED','麦克风已关闭，但服务端挂断尚未确认，请在 ChatGPT 核对',502);
   call.callId=undefined;if(this.active===call)this.active=undefined;
  })().finally(()=>{call.stopping=undefined;});
  return call.stopping;
 }
 async stop(requestId:string){
  const call=this.get(requestId);call.cancelled=true;
  await call.pending.catch(()=>{});await call.attaching?.catch(()=>{});
  if(call.unknown)throw failure('DOTS_VOICE_UNKNOWN','本地已取消，服务端通话状态未知，请在 ChatGPT 核对',502);
  await this.stopAllocation(call);return {stopped:true};
 }
 async close(){
  this.closed=true;clearInterval(this.timer);
  if(this.active)await this.stop(this.active.requestId);
 }
}
